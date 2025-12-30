import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import HomeScreen from './HomeScreen';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
    } else if (segments.length === 0) {
      // 認証済みでルートにいる場合はHomeScreenを表示
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return null; // またはローディング画面
  }

  if (!isAuthenticated) {
    return null; // リダイレクト中
  }

  return <HomeScreen />;
}