import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A product photo. With `label` it is announced as an image; without, it is decorative and
 * hidden from screen readers (the surrounding card or row already names the product). The
 * wrapper carries the semantics because expo-image's web output has no alt attribute.
 */
export function Photo({
  uri,
  label,
  style,
}: {
  readonly uri: string;
  readonly label?: string;
  readonly style: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.frame, style]}
      accessible={label !== undefined}
      accessibilityRole={label !== undefined ? 'image' : undefined}
      accessibilityLabel={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <View style={StyleSheet.absoluteFill} aria-hidden>
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: 'hidden' } });
