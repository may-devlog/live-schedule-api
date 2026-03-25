import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { IconArrowLeft, IconHome } from '@/components/FeatherSvgIcons';

type PageHeaderProps = {
  scheduleTitle?: string | null;
  showBackButton?: boolean;
  homePath?: string; // カスタムホームパス（指定しない場合は '/'）
};

export function PageHeader({ scheduleTitle, showBackButton = true, homePath }: PageHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {showBackButton && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <View style={styles.buttonContent}>
              <IconArrowLeft size={16} color="#37352f" />
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
            <IconHome size={16} color="#37352f" />
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
    // Web環境では固定ヘッダーを避けて、アドレスバーの非表示を促進
    ...(Platform.OS === 'web' && {
      position: 'relative' as const,
      // position: fixedを明示的に避ける
    }),
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

