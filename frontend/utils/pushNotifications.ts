import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authenticatedFetch, getApiUrl } from './api';

const PUSH_TOKEN_KEY = '@push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

// Expoのプッシュ通知トークンを取得する。権限が未許可の場合はリクエストする。
// Web・シミュレータ/エミュレータでは取得できないため null を返す。
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.warn('[PushNotifications] Physical device is required for push notifications');
    return null;
  }

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('[PushNotifications] Missing EAS projectId; cannot fetch push token');
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenResponse.data;
  } catch (error) {
    console.warn('[PushNotifications] Failed to get Expo push token (Expo Go では取得できません。開発ビルドが必要です):', error);
    return null;
  }
}

// 権限リクエストなしで、既に許可済みの場合のみトークンを取得する（アプリ起動時のサイレント再登録用）
export async function getExpoPushTokenSilently(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;

  return getExpoPushToken();
}

export async function registerPushTokenWithServer(token: string): Promise<void> {
  await authenticatedFetch(getApiUrl('/push-tokens'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
}

export async function unregisterPushTokenFromServer(): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  await authenticatedFetch(getApiUrl('/push-tokens'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => undefined);
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}
