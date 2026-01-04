import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import HomeScreen from './HomeScreen';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  
  // ログイン必須化：未ログイン時はログイン画面にリダイレクト
  useEffect(() => {
    // 認証状態の読み込みが完了してからチェック
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);
  
  // 認証状態の読み込み中、または未ログイン時は何も表示しない（リダイレクト中）
  if (isLoading || !isAuthenticated) {
    return null;
  }
  
  return <HomeScreen />;
}