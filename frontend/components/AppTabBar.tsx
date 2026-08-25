import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';

type AppTabBarProps = {
  active: 'home' | 'archive';
  homePath: string;
  archivePath: string;
};

// Web版のヘッダー/フッターの代わりに、ネイティブアプリでのみ画面下部に表示するタブバー
export function AppTabBar({ active, homePath, archivePath }: AppTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = getStyles(colors);

  if (Platform.OS === 'web') return null;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <TouchableOpacity style={styles.tab} onPress={() => router.push(homePath)}>
        <Ionicons name={active === 'home' ? 'home' : 'home-outline'} size={22} color={active === 'home' ? colors.accent : colors.muted} />
        <Text style={[styles.label, active === 'home' && styles.labelActive]}>HOME</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => router.push(archivePath)}>
        <Ionicons name={active === 'archive' ? 'archive' : 'archive-outline'} size={22} color={active === 'archive' ? colors.accent : colors.muted} />
        <Text style={[styles.label, active === 'archive' && styles.labelActive]}>ARCHIVE</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  labelActive: {
    color: colors.accent,
  },
});
