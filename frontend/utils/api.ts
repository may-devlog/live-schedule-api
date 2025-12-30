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
  return `${API_BASE}${path}`;
}

