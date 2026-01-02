import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import HomeScreen from './HomeScreen';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  
  // ログイン必須化：未ログイン時はログイン画面にリダイレクト
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);
  
  // 未ログイン時は何も表示しない（リダイレクト中）
  if (!isAuthenticated) {
    return null;
  }
  
  return <HomeScreen />;
}