import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { useColorScheme } from '@/hooks/use-color-scheme';

type PageHeaderProps = {
  scheduleTitle?: string | null;
  showBackButton?: boolean;
  homePath?: string; // カスタムホームパス（指定しない場合は '/'）
  showHomeButton?: boolean;
  rightActions?: React.ReactNode;
  showDivider?: boolean;
};

export function PageHeader({
  scheduleTitle,
  showBackButton = true,
  homePath,
  showHomeButton = true,
  rightActions,
  showDivider = true,
}: PageHeaderProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();

  const brandLogoSource =
    colorScheme === 'dark'
      ? require('@/assets/images/genbgt-logo-white.png')
      : require('@/assets/images/genbgt-logo-black.png');

  const hasLeftButtons = Boolean(showBackButton || showHomeButton);

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomWidth: showDivider ? 1 : 0,
          borderBottomColor: showDivider ? '#e9e9e7' : 'transparent',
        },
      ]}
    >
      {/* 1行目：左ロゴ / 右アクション（通知・人物など） */}
      <View style={styles.topRow}>
        <Image source={brandLogoSource} style={styles.logo} contentFit="contain" />
        <View style={styles.rightArea}>{rightActions}</View>
      </View>

      {/* 2行目：戻る・ホーム（新規イベントボタンと同じ左位置） */}
      {hasLeftButtons && (
        <View style={styles.bottomRow}>
          {showBackButton && (
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>← 戻る</Text>
            </TouchableOpacity>
          )}
          {showHomeButton && (
            <TouchableOpacity
              style={styles.homeButton}
              onPress={() => {
                const path = homePath || '/';
                console.log('[PageHeader] Home button pressed, navigating to:', path);
                router.push(path);
              }}
            >
              <Text style={styles.homeButtonText}>🏠 ホーム</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {scheduleTitle && (
        <Text style={styles.scheduleTitle}>
          {scheduleTitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "#ffffff",
    ...(Platform.OS === 'web' && {
      position: 'sticky' as const,
      top: 0,
      zIndex: 50,
    }),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
  },
  logo: {
    width: 150,
    height: 40,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24, // HomeScreen の newButton と同じ左位置
    marginTop: 8,
  },
  rightArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  backButton: {
    backgroundColor: '#f7f6f3',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
  },
  backButtonText: {
    color: '#37352f',
    fontSize: 14,
    fontWeight: '600',
  },
  homeButton: {
    backgroundColor: '#f7f6f3',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
  },
  homeButtonText: {
    color: '#37352f',
    fontSize: 14,
    fontWeight: '600',
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#787774',
    marginTop: 8,
  },
});

