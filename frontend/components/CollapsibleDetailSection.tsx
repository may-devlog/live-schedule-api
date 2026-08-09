import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand } from './GenBGTBrand';

type Props = {
  title: string;
  children: React.ReactNode;
  iconName?: keyof typeof Ionicons.glyphMap;
};

export function CollapsibleDetailSection({ title, children, iconName }: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [expanded, setExpanded] = useState(!isMobile);

  useEffect(() => {
    setExpanded(!isMobile);
  }, [isMobile]);

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={[styles.header, isMobile && styles.mobileHeader]}
        onPress={() => isMobile && setExpanded((value) => !value)}
        disabled={!isMobile}
        accessibilityRole={isMobile ? 'button' : undefined}
        accessibilityState={isMobile ? { expanded } : undefined}
      >
        {!!iconName && <Ionicons name={iconName} size={22} color={brand.violetDark} style={styles.icon} />}
        <Text style={styles.title}>{title}</Text>
        {isMobile && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={brand.violet} />}
      </TouchableOpacity>
      {expanded && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: brand.border, backgroundColor: '#FFFFFF', ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 30px rgba(46,16,101,0.06)' } as any) : {}) },
  header: { marginBottom: 4 },
  mobileHeader: { minHeight: 42, paddingHorizontal: 0, marginBottom: 0, flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 10 },
  title: { flex: 1, color: brand.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  content: { marginTop: 12 },
});
