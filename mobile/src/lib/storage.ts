import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The session token lives in the Android Keystore / iOS Keychain. The web build exists only
// for automated tests and keeps values in localStorage.
const web = Platform.OS === 'web';

export async function readValue(key: string): Promise<string | null> {
  if (web) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function writeValue(key: string, value: string): Promise<void> {
  if (web) return globalThis.localStorage?.setItem(key, value);
  await SecureStore.setItemAsync(key, value);
}

export async function removeValue(key: string): Promise<void> {
  if (web) return globalThis.localStorage?.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}
