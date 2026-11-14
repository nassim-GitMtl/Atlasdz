import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'camera' | 'library';

/**
 * Takes or chooses a product photo, cropped square and resized to at most 1600 px (JPEG). The
 * API re-encodes it again and strips metadata. Returns the local file, 'denied', or null.
 */
export async function pickPhoto(source: PhotoSource): Promise<string | 'denied' | null> {
  // The system photo picker needs no permission; the camera does.
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    return 'denied';
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > 1600) context.resize({ width: 1600 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return saved.uri;
}

/** The photo file's bytes for the upload request. */
export async function photoBytes(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}
