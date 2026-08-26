import { useEffect } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';

import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Tab navigation removed - using direct routing instead
// export const unstable_settings = {
//   anchor: '(tabs)',
// };

function RootLayoutNav() {
  const { scheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // プッシュ通知をタップして開いた場合、関連するライブの詳細画面へ遷移する
    // URLはuser_seq（ユーザーごとの連番）ベースのため、内部id(schedule_id)ではなくschedule_user_seqを使う
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const scheduleUserSeq = response.notification.request.content.data?.schedule_user_seq;
      if (scheduleUserSeq != null) {
        router.push(`/live/${scheduleUserSeq}`);
      }
    });
    return () => subscription.remove();
  }, [router]);

  // @expo/vector-icons のフォントを起動時に確実に読み込む（Web/ネイティブ両方）
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'GenBGT';
    }
  }, [pathname]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerShown: false, // デフォルトでヘッダーを非表示
            title: 'GenBGT',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppThemeProvider>
        <ErrorBoundary>
          <RootLayoutNav />
        </ErrorBoundary>
      </AppThemeProvider>
    </AuthProvider>
  );
}
