import AsyncStorage from '@react-native-async-storage/async-storage';

// Non-secret app data on the phone (favorites, recently viewed, addresses). The session token
// stays in secure storage (storage.ts).
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Losing a favorite or recent item is not worth interrupting the customer.
  }
}
