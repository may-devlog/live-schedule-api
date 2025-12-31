import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/contexts/AuthContext';

// スプラッシュスクリーンを表示したままにする
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  // アイコンフォントを読み込む（Web環境で必要）
  // @expo/vector-iconsのフォントを明示的に読み込む
  const [fontsLoaded, fontError] = useFonts({
    // Ioniconsフォントを読み込む
    Ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
    // MaterialIconsフォントも読み込む（IconSymbolコンポーネントで使用）
    MaterialIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // フォントの読み込みが完了したらスプラッシュスクリーンを非表示にする
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // フォントが読み込まれるまで何も表示しない（Web環境でフォントが正しく読み込まれるように）
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
