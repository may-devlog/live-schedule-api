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
  showDivider?: boolean; // 区切り線（borderBottom）を表示するか
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

  return (
    <View
      style={[
        styles.header,
        // showDivider に応じて常に明示的に上書きする（スタイルマージの差で残るのを防ぐ）
        {
          borderBottomWidth: showDivider ? 1 : 0,
          borderBottomColor: showDivider ? "#e9e9e7" : "transparent",
        },
      ]}
    >
      {/* ロゴは左上に固定配置。戻る/ホームボタン側は padding で干渉回避。 */}
      <Image
        source={brandLogoSource}
        style={styles.pageHeaderLogo}
        contentFit="contain"
      />

      <View style={styles.headerRow}>
        <View style={styles.leftButtons}>
          {showBackButton && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
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

        {rightActions ? <View style={styles.rightActions}>{rightActions}</View> : <View style={styles.rightActions} />}
      </View>

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
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
    position: "relative",
    // Web環境では固定ヘッダーを避けて、アドレスバーの非表示を促進
    ...(Platform.OS === 'web' && {
      position: 'sticky' as const,
      top: 0,
      zIndex: 50,
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: "space-between",
    marginBottom: 8,
    // ロゴ（絶対配置）の分だけ左ボタンを右へずらす
    paddingLeft: 210,
  },
  leftButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageHeaderLogo: {
    position: "absolute",
    top: 6,
    left: 0,
    width: 190,
    height: 44,
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
    marginTop: 4,
  },
});

