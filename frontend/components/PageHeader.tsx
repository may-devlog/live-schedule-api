import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

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
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.push(homePath || '/')}
        >
          <Text style={styles.homeButtonText}>🏠 Home</Text>
        </TouchableOpacity>
      </View>
      {scheduleTitle && (
        <Text style={styles.scheduleTitle} numberOfLines={1}>
          {scheduleTitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
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

