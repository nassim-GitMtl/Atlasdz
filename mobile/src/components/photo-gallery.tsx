import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Photo } from '@/components/photo';
import { imageUri } from '@/lib/config';
import { colors, radius } from '@/lib/theme';

/** The cover photo, then the seller's extra photos as thumbnails that switch the large one. */
export function PhotoGallery({
  urls,
  label,
  thumbLabel,
}: {
  readonly urls: readonly string[];
  /** The product name, announced for the large photo. */
  readonly label: string;
  /** Names the thumbnails, e.g. "Product photos". */
  readonly thumbLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const position = Math.min(index, urls.length - 1);
  const current = urls[position] ?? '/assets/product-placeholder.svg';
  return (
    <View style={styles.gap}>
      <Photo
        uri={imageUri(current, 'large')}
        label={urls.length > 1 ? `${label} (${position + 1}/${urls.length})` : label}
        style={styles.image}
      />
      {urls.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}
        >
          {urls.map((url, item) => (
            <Pressable
              key={url}
              onPress={() => setIndex(item)}
              accessibilityRole="button"
              accessibilityLabel={`${thumbLabel} ${item + 1}/${urls.length}`}
              accessibilityState={{ selected: item === position }}
              style={[styles.thumb, item === position && styles.active]}
            >
              <Photo uri={imageUri(url, 'small')} style={StyleSheet.absoluteFill} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  image: { width: '100%', aspectRatio: 1, borderRadius: radius, backgroundColor: colors.soft },
  thumbs: { gap: 8, paddingVertical: 2 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.soft,
    overflow: 'hidden',
  },
  active: { borderWidth: 2, borderColor: colors.primary },
});
