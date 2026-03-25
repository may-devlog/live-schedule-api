import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationIcon, PersonIcon } from '@/components/CustomIcons';

type PageHeaderProps = {
  scheduleTitle?: string | null;
  showBackButton?: boolean;
  homePath?: string; // カスタムホームパス（指定しない場合は '/'）
  showHomeButton?: boolean;
  rightActions?: React.ReactNode;
  showDivider?: boolean;
  fixedOnWeb?: boolean; // web で確実に固定する
};

export function PageHeader({
  scheduleTitle,
  showBackButton = true,
  homePath,
  showHomeButton = true,
  rightActions,
  showDivider = true,
  fixedOnWeb = false,
}: PageHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const { isAuthenticated } = useAuth();

  const brandLogoSource =
    colorScheme === 'dark'
      ? require('@/assets/images/genbgt-logo-white.png')
      : require('@/assets/images/genbgt-logo-black.png');

  const hasLeftButtons = Boolean(showBackButton || showHomeButton);
  const isSharePage = pathname?.startsWith('/share/');

  const effectiveRightActions =
    rightActions ??
    (!isSharePage ? (
      <View style={styles.rightArea}>
        {/* 共有ページ以外は常に右アイコンを表示 */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => {
            // 既存ではトップでモーダルを開いていたが、共通ヘッダーではまずは表示優先
            console.log('[PageHeader] Notification icon pressed');
          }}
        >
          <NotificationIcon size={40} color="#37352f" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => {
            console.log('[PageHeader] Person icon pressed, isAuthenticated:', isAuthenticated);
          }}
        >
          <PersonIcon size={40} color="#37352f" />
        </TouchableOpacity>
      </View>
    ) : null);

  const headerNode = (
    <View
      style={[
        styles.header,
        fixedOnWeb && Platform.OS === 'web' && styles.headerFixedOnWeb,
        {
          borderBottomWidth: showDivider ? 1 : 0,
          borderBottomColor: showDivider ? '#e9e9e7' : 'transparent',
        },
      ]}
    >
      {/* 1行目：左ロゴ / 右アクション（通知・人物など） */}
      <View style={styles.topRow}>
        <Image source={brandLogoSource} style={styles.logo} contentFit="contain" />
        <View style={styles.rightActionsContainer}>{effectiveRightActions}</View>
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

  // fixed の場合、コンテンツが下に潜らないようスペーサーを入れる
  if (fixedOnWeb && Platform.OS === 'web') {
    return (
      <>
        {headerNode}
        <View style={styles.fixedSpacer} />
      </>
    );
  }

  return headerNode;
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 2,
    paddingBottom: 2,
    backgroundColor: "#ffffff",
    ...(Platform.OS === 'web' && {
      position: 'sticky' as const,
      top: 0,
      zIndex: 50,
    }),
  },
  headerFixedOnWeb: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  fixedSpacer: {
    height: 112, // ヘッダー分の余白（ロゴ行＋ボタン行想定）
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
    marginTop: 2,
  },
  rightActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  rightArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  iconButton: {
    padding: 2,
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

