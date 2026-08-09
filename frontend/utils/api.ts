import { API_BASE } from '../constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@auth_token';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('Failed to get token:', error);
    return null;
  }
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}

export function getApiUrl(path: string): string {
  // `npm run proxy:public` と 8084 番ポートで起動するローカル確認環境では、
  // 本番の公開データだけを読み取り専用プロキシ経由で取得する。
  // 通常のローカル開発（3000/8081 等）と本番環境の接続先は変更しない。
  if (typeof window !== 'undefined') {
    const isLocalPreview =
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      window.location.port === '8084';
    const isPublicPath = path.startsWith('/share/') || path.startsWith('/public/');

    if (isLocalPreview && isPublicPath) {
      return `http://${window.location.hostname}:3002${path}`;
    }
  }

  return `${API_BASE}${path}`;
}
