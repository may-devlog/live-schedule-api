import { Platform } from 'react-native';
import { API_BASE } from '../constants/api';
import { getSecureItemWithMigration } from './secure-token-storage';

const TOKEN_KEY = '@auth_token';

async function getToken(): Promise<string | null> {
  try {
    return await getSecureItemWithMigration(TOKEN_KEY);
  } catch (error) {
    console.error('Failed to get token:', error);
    return null;
  }
}

// トークンが期限切れ・無効化された場合に401を検知してログイン画面へ戻すためのハンドラ。
// AuthProviderがマウント時にlogout関数を登録する（utils/api.tsはコンポーネント外の
// プレーンな関数なのでReact contextを直接参照できないため、この登録方式にしている）
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
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

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && token) {
    unauthorizedHandler?.();
  }

  return response;
}

export function getApiUrl(path: string): string {
  // `npm run proxy:public` と 8084 番ポートで起動するローカル確認環境では、
  // 本番の公開データだけを読み取り専用プロキシ経由で取得する。
  // 通常のローカル開発（3000/8081 等）と本番環境の接続先は変更しない。
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
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
