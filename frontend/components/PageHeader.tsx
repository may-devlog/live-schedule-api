import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { IconArrowLeft, IconHome } from '@/components/FeatherSvgIcons';

type PageHeaderProps = {
  scheduleTitle?: string | null;
  showBackButton?: boolean;
  homePath?: string; // カスタムホームパス（指定しない場合は '/'）
  contentMaxWidth?: number; // ページ本体のコンテンツ幅に合わせて中央揃えする場合に指定
};

export function PageHeader({ scheduleTitle, showBackButton = true, homePath, contentMaxWidth }: PageHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View style={[styles.headerInner, contentMaxWidth ? { maxWidth: contentMaxWidth } : null]}>
        <View style={styles.headerRow}>
          {showBackButton && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <View style={styles.buttonContent}>
                <IconArrowLeft size={16} color="#5B21B6" />
                <Text style={styles.backButtonText}>戻る</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => {
              const path = homePath || '/';
              console.log('[PageHeader] Home button pressed, navigating to:', path);
              router.push(path);
            }}
          >
            <View style={styles.buttonContent}>
              <IconHome size={16} color="#FFFFFF" />
              <Text style={styles.homeButtonText}>ホーム</Text>
            </View>
          </TouchableOpacity>
        </View>
        {scheduleTitle && (
          <Text style={styles.scheduleTitle}>
            {scheduleTitle}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "#F3F0FF",
    // Web環境では固定ヘッダーを避けて、アドレスバーの非表示を促進
    ...(Platform.OS === 'web' && {
      position: 'relative' as const,
      // position: fixedを明示的に避ける
    }),
  },
  headerInner: {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButton: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 9,
  },
  backButtonText: {
    color: '#5B21B6',
    fontSize: 14,
    fontWeight: '600',
  },
  homeButton: {
    backgroundColor: '#7C3AED',
    borderWidth: 1,
    borderColor: '#7C3AED',
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 9,
  },
  homeButtonText: {
    color: '#FFFFFF',
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
