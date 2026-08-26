import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ネイティブ(iOS/Android)ではKeychain/Keystore経由のSecureStoreに保存する。
// expo-secure-storeはWebに対応していないため、Webのみ従来通りAsyncStorage
// （localStorage相当）にフォールバックする。
const isNative = Platform.OS !== 'web';

// expo-secure-storeのキーは英数字・"."・"-"・"_"のみ許可されており、それ以外の文字
// （旧AsyncStorageキーで使っていた"@"など）を含めるとInvalid key providedエラーになる。
// AsyncStorage側のキー（移行元の値を探す際に使う）はそのまま維持しつつ、SecureStoreに
// 渡すキーだけ安全な文字列に変換する。
function toSecureStoreKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (isNative) {
    return SecureStore.getItemAsync(toSecureStoreKey(key));
  }
  return AsyncStorage.getItem(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (isNative) {
    await SecureStore.setItemAsync(toSecureStoreKey(key), value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function removeSecureItem(key: string): Promise<void> {
  if (isNative) {
    await SecureStore.deleteItemAsync(toSecureStoreKey(key));
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

  await SecureStore.setItemAsync(toSecureStoreKey(key), legacyValue);
  await AsyncStorage.removeItem(key);
  return legacyValue;
}
