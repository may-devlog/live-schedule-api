import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '@/components/GenBGTBrand';

type AppTabBarProps = {
  active: 'home' | 'schedule' | 'archive';
  homePath: string;
  schedulePath: string;
  archivePath: string;
};

// Web版のヘッダー/フッターの代わりに、ネイティブアプリでのみ画面下部に表示するタブバー
export function AppTabBar({ active, homePath, schedulePath, archivePath }: AppTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') return null;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <TouchableOpacity style={styles.tab} onPress={() => router.push(homePath)}>
        <Ionicons name={active === 'home' ? 'home' : 'home-outline'} size={22} color={active === 'home' ? brand.violet : brand.muted} />
        <Text style={[styles.label, active === 'home' && styles.labelActive]}>HOME</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => router.push(schedulePath)}>
        <Ionicons name={active === 'schedule' ? 'calendar' : 'calendar-outline'} size={22} color={active === 'schedule' ? brand.violet : brand.muted} />
        <Text style={[styles.label, active === 'schedule' && styles.labelActive]}>SCHEDULE</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => router.push(archivePath)}>
        <Ionicons name={active === 'archive' ? 'archive' : 'archive-outline'} size={22} color={active === 'archive' ? brand.violet : brand.muted} />
        <Text style={[styles.label, active === 'archive' && styles.labelActive]}>ARCHIVE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: brand.white,
    borderTopWidth: 1,
    borderTopColor: brand.border,
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
    color: brand.muted,
  },
  labelActive: {
    color: brand.violet,
  },
});
