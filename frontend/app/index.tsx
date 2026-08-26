import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import ScheduleScreen from './share/[share_id]';
import { LandingScreen } from '@/components/LandingScreen';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // ネイティブアプリはSEOと無関係なため、未ログイン時は従来どおりログイン画面へ即リダイレクトする
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isLoading && !isAuthenticated) {
      console.log('[Index] Not authenticated, redirecting to login');
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (Platform.OS !== 'web') {
    if (isLoading || !isAuthenticated) return null;
    return <ScheduleScreen authenticated />;
  }

  // Web: 認証済みならホーム画面、それ以外（未ログイン・判定中）は常に公開ランディングページを表示する。
  // 静的書き出し（output: "static"）時点ではisLoadingがtrueのままHTMLが生成されるため、
  // ここでnullを返すとGoogleのクローラーが空のシェルしか見られず、SEO用の実コンテンツが失われる。
  if (!isLoading && isAuthenticated) {
    return <ScheduleScreen authenticated />;
  }
  return <LandingScreen />;
}
