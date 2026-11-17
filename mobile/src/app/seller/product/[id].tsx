import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Photo } from '@/components/photo';
import { Badge, Button, Card, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { imageUri } from '@/lib/config';
import { fill, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { photoBytes, pickPhoto, type PhotoSource } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, radius } from '@/lib/theme';
import type { CatalogEntry, ProductSubmission } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** A submitted product: review status, then (once approved) its photo and a way to sell it. */
export default function SellerProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const session = useSession();
  const submission = useRequest(`submission:${id}`, () =>
    session.request<ProductSubmission>(`/api/v1/seller/products/${encodeURIComponent(id)}`),
  );
  const catalog = useRequest('catalog-entries', () =>
    session.request<{ items: CatalogEntry[] }>('/api/v1/seller/products/catalog'),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Which card reported the failure: the main photo or the extra photos.
  const [failedIn, setFailedIn] = useState<'image' | 'gallery'>('image');
  const [denied, setDenied] = useState(false);

  const data = submission.data;
  const productId = data?.status === 'APPROVED' ? data.productId : null;
  const entry = productId ? catalog.data?.items.find((item) => item.id === productId) : undefined;

  /** Replaces the main photo, or adds an extra one with `target: 'gallery'`. */
  async function upload(source: PhotoSource, target: 'image' | 'gallery' = 'image') {
    if (!productId) return;
    setFailure(null);
    setDenied(false);
    try {
      const picked = await pickPhoto(source);
      if (picked === 'denied') {
        setDenied(true);
        return;
      }
      if (picked === null) return;
      setBusy(true);
      await session.request(`/api/v1/seller/products/${productId}/${target}`, {
        rawBody: await photoBytes(picked),
        contentType: 'image/jpeg',
        timeoutMs: 60_000,
      });
      await Promise.all([catalog.reload(), submission.reload()]);
    } catch (error) {
      setFailedIn(target);
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!productId) return;
    setBusy(true);
    setFailure(null);
    try {
      await session.request(`/api/v1/seller/products/${productId}/image/remove`, { body: {} });
      await catalog.reload();
    } catch (error) {
      setFailedIn('image');
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  async function changeExtra(mediaId: string, change: 'cover' | 'remove') {
    if (!productId) return;
    setBusy(true);
    setFailure(null);
    try {
      await session.request(`/api/v1/seller/products/${productId}/gallery/${mediaId}/${change}`, {
        body: {},
      });
      await Promise.all([catalog.reload(), submission.reload()]);
    } catch (error) {
      setFailedIn('gallery');
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  const extras = data?.gallery ?? [];

  return (
    <Screen refreshing={submission.loading && !!data} onRefresh={() => void submission.reload()}>
      <LoadState
        loading={submission.loading && !data}
        error={data ? undefined : submission.error}
        onRetry={() => void submission.reload()}
      />
      {data ? (
        <>
          <Card>
            <Badge
              label={t.catalog[data.status]}
              tone={
                data.status === 'APPROVED' ? 'good' : data.status === 'REJECTED' ? 'bad' : 'wait'
              }
            />
            <Text style={text.title}>{localized(data.title, locale)}</Text>
            <Text style={text.muted}>{localized(data.category.title, locale)}</Text>
            {data.status === 'PENDING_REVIEW' ? (
              <Text style={text.muted}>{t.catalog.reviewNote}</Text>
            ) : null}
            {data.reviewReason ? (
              <Notice tone="error">
                {fill(t.catalog.reviewReason, { reason: data.reviewReason })}
              </Notice>
            ) : null}
            <Text style={text.body}>{localized(data.description, locale)}</Text>
          </Card>
          {productId ? (
            <Card>
              <Text style={text.heading}>{t.catalog.photo}</Text>
              {entry ? (
                <Photo uri={imageUri(entry.imageUrl, 'large')} style={styles.photo} />
              ) : null}
              <Text style={text.muted}>{t.catalog.photoNote}</Text>
              {denied ? <Notice tone="error">{t.catalog.permission}</Notice> : null}
              {failure && failedIn === 'image' ? (
                <Notice tone="error">{errorMessage(t, failure)}</Notice>
              ) : null}
              <Button
                label={t.catalog.takePhoto}
                busy={busy}
                onPress={() => void upload('camera')}
              />
              <Button
                label={t.catalog.choosePhoto}
                variant="secondary"
                disabled={busy}
                onPress={() => void upload('library')}
              />
              {entry?.imageUrl.startsWith('/media/') ? (
                <Button
                  label={t.catalog.removePhoto}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void removePhoto()}
                />
              ) : null}
            </Card>
          ) : null}
          {productId ? (
            <Card>
              <Text style={text.heading}>{t.catalog.extraPhotos}</Text>
              <Text style={text.muted}>{t.catalog.extraNote}</Text>
              {failure && failedIn === 'gallery' ? (
                <Notice tone="error">{errorMessage(t, failure)}</Notice>
              ) : null}
              {extras.map((photo, index) => (
                <View key={photo.id} style={styles.extra}>
                  <Photo
                    uri={imageUri(photo.url, 'small')}
                    label={`${t.catalog.extraPhotos} ${index + 1}`}
                    style={styles.thumb}
                  />
                  <View style={styles.extraActions}>
                    <Button
                      label={t.catalog.makeCover}
                      variant="secondary"
                      disabled={busy}
                      onPress={() => void changeExtra(photo.id, 'cover')}
                    />
                    <Button
                      label={t.catalog.removeExtra}
                      variant="secondary"
                      disabled={busy}
                      onPress={() => void changeExtra(photo.id, 'remove')}
                    />
                  </View>
                </View>
              ))}
              {extras.length < MAX_EXTRA_PHOTOS ? (
                <>
                  <Button
                    label={t.catalog.extraCamera}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void upload('camera', 'gallery')}
                  />
                  <Button
                    label={t.catalog.extraLibrary}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void upload('library', 'gallery')}
                  />
                </>
              ) : null}
            </Card>
          ) : null}
          {productId ? (
            <Button
              label={t.catalog.sell}
              onPress={() => router.push(`/seller/offer/new?productId=${productId}`)}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Extra photos a product may show after its cover (the API enforces the same limit). */
const MAX_EXTRA_PHOTOS = 7;

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius, backgroundColor: colors.soft },
  extra: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: colors.soft },
  extraActions: { flex: 1, gap: 8 },
});
