import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ネイティブ(iOS/Android)ではKeychain/Keystore経由のSecureStoreに保存する。
// expo-secure-storeはWebに対応していないため、Webのみ従来通りAsyncStorage
// （localStorage相当）にフォールバックする。
const isNative = Platform.OS !== 'web';

export async function getSecureItem(key: string): Promise<string | null> {
  if (isNative) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (isNative) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function removeSecureItem(key: string): Promise<void> {
  if (isNative) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await AsyncStorage.removeItem(key);
}

// SecureStore導入前はAsyncStorageに認証トークンを保存していたため、
// アップデート直後に既存ユーザーが強制ログアウトにならないよう、
// AsyncStorageに残っている値があれば一度だけSecureStoreへ移行する。
export async function getSecureItemWithMigration(key: string): Promise<string | null> {
  const current = await getSecureItem(key);
  if (current || !isNative) {
    return current;
  }

  const legacyValue = await AsyncStorage.getItem(key);
  if (!legacyValue) {
    return null;
  }

  await SecureStore.setItemAsync(key, legacyValue);
  await AsyncStorage.removeItem(key);
  return legacyValue;
}
