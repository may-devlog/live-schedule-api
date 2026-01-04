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
    if (!isLoading) {
      if (!isAuthenticated) {
        console.log('[Index] Not authenticated, redirecting to login');
        router.replace('/login');
      } else {
        console.log('[Index] Authenticated, showing HomeScreen');
      }
    } else {
      console.log('[Index] Still loading auth state...');
    }
  }, [isAuthenticated, isLoading, router]);
  
  // 認証状態の読み込み中は何も表示しない
  if (isLoading) {
    return null;
  }
  
  // 未認証時も何も表示しない（リダイレクト中）
  if (!isAuthenticated) {
    return null;
  }
  
  return <HomeScreen />;
}