import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../constants/api';

interface AuthResponse {
  token: string | null;
  email: string;
  email_verified: boolean;
}

interface AuthContextType {
  token: string | null;
  email: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changeEmail: (newEmail: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = '@auth_token';
const EMAIL_KEY = '@auth_email';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 起動時に保存された認証情報を読み込む
    loadAuth();
  }, []);

  const loadAuth = async () => {
    try {
      const [savedToken, savedEmail] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(EMAIL_KEY),
      ]);
      if (savedToken && savedEmail) {
        setToken(savedToken);
        setEmail(savedEmail);
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(errorData.error || 'ログインに失敗しました');
      }

      const data: AuthResponse = await res.json();
      
      if (data.token) {
        await Promise.all([
          AsyncStorage.setItem(TOKEN_KEY, data.token),
          AsyncStorage.setItem(EMAIL_KEY, data.email),
        ]);
        setToken(data.token);
        setEmail(data.email);
      }
      
      return data;
    } catch (error: any) {
      throw error;
    }
  };

  const register = async (email: string, password: string) => {
    try {
      console.log('[AuthContext] Registering user with email:', email);
      console.log('[AuthContext] API_BASE:', API_BASE);
      
      const requestBody = JSON.stringify({ email, password });
      console.log('[AuthContext] Request body:', requestBody);
      
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });

      console.log('[AuthContext] Registration response status:', res.status);
      console.log('[AuthContext] Response headers:', Object.fromEntries(res.headers.entries()));

      if (!res.ok) {
        let errorData;
        try {
          const text = await res.text();
          console.log('[AuthContext] Error response text:', text);
          errorData = JSON.parse(text);
        } catch (parseError) {
          console.error('[AuthContext] Failed to parse error response:', parseError);
          errorData = { error: `登録に失敗しました (status: ${res.status})` };
        }
        console.error('[AuthContext] Registration error:', errorData);
        throw new Error(errorData.error || '登録に失敗しました');
      }

      // 登録時はトークンが返されない（メール確認が必要）
      const responseText = await res.text();
      console.log('[AuthContext] Response text:', responseText);
      const data: AuthResponse = JSON.parse(responseText);
      console.log('[AuthContext] Registration successful:', data);
      // トークンは保存しない
    } catch (error: any) {
      console.error('[AuthContext] Registration exception:', error);
      console.error('[AuthContext] Error type:', error.constructor.name);
      console.error('[AuthContext] Error message:', error.message);
      console.error('[AuthContext] Error stack:', error.stack);
      
      // ネットワークエラーの場合、より詳細なメッセージを提供
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('サーバーに接続できません。バックエンドサーバーが起動しているか確認してください。');
      }
      
      throw error;
    }
  };

  const logout = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(TOKEN_KEY),
        AsyncStorage.removeItem(EMAIL_KEY),
      ]);
      setToken(null);
      setEmail(null);
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const changeEmail = async (newEmail: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE}/auth/change-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_email: newEmail }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Change email failed' }));
        throw new Error(errorData.error || 'メールアドレス変更に失敗しました');
      }

      const data = await res.json();
      return data;
    } catch (error: any) {
      throw error;
    }
  };

  const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, {
      ...options,
      headers,
    });
  };

  const value: AuthContextType = {
    token,
    email,
    isLoading,
    isAuthenticated: !!token,
    login,
    register,
    logout,
    changeEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

