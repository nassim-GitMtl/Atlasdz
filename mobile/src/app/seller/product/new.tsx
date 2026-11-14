import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { PlacePicker, type Place } from '@/components/place-picker';
import { Button, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { CatalogCategory, ProductSubmission } from '@/lib/types';
import { useRequest } from '@/lib/use-request';
import { newRequestId } from '@/lib/uuid';

const multiline = { minHeight: 110, textAlignVertical: 'top' as const, paddingTop: 12 };

/** A new product for the shared catalogue, in French and Arabic, reviewed by the team. */
export default function NewProductScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const categories = useRequest('categories', () =>
    session.request<{ items: CatalogCategory[] }>('/api/v1/seller/products/categories'),
  );
  const [category, setCategory] = useState<Place | null>(null);
  const [form, setForm] = useState({ titleFr: '', titleAr: '', descFr: '', descAr: '' });
  const [requestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    if (!category) return;
    setBusy(true);
    setFailure(null);
    try {
      // The request id makes a retried submission land once.
      const created = await session.request<ProductSubmission>('/api/v1/seller/products', {
        body: {
          requestId,
          categoryId: category.id,
          title: { fr: form.titleFr.trim(), ar: form.titleAr.trim() },
          description: { fr: form.descFr.trim(), ar: form.descAr.trim() },
        },
      });
      router.replace(`/seller/product/${created.id}`);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  const complete = category && Object.values(form).every((value) => value.trim().length > 0);
  return (
    <Screen>
      <Text style={text.muted}>{t.catalog.reviewNote}</Text>
      <LoadState
        loading={categories.loading && !categories.data}
        error={categories.data ? undefined : categories.error}
        onRetry={() => void categories.reload()}
      />
      <PlacePicker
        label={t.catalog.category}
        value={category}
        places={(categories.data?.items ?? []).map((item) => ({
          id: item.id,
          label: localized(item.title, locale),
        }))}
        onChange={setCategory}
      />
      <Field
        label={t.catalog.titleFr}
        value={form.titleFr}
        onChangeText={set('titleFr')}
        maxLength={500}
      />
      <Field
        label={t.catalog.titleAr}
        value={form.titleAr}
        onChangeText={set('titleAr')}
        maxLength={500}
      />
      <Field
        label={t.catalog.descFr}
        value={form.descFr}
        onChangeText={set('descFr')}
        multiline
        maxLength={8000}
        style={multiline}
      />
      <Field
        label={t.catalog.descAr}
        value={form.descAr}
        onChangeText={set('descAr')}
        multiline
        maxLength={8000}
        style={multiline}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={t.catalog.submit}
        busy={busy}
        disabled={!complete}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
