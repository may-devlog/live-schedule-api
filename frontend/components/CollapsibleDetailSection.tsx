import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand } from './GenBGTBrand';

type Props = {
  title: string;
  children: React.ReactNode;
};

export function CollapsibleDetailSection({ title, children }: Props) {
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
        <Text style={styles.title}>{title}</Text>
        {isMobile && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={brand.violet} />}
      </TouchableOpacity>
      {expanded && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  header: { marginBottom: 12 },
  mobileHeader: { minHeight: 58, paddingHorizontal: 16, marginBottom: 0, borderWidth: 1, borderColor: brand.border, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, color: brand.ink, fontSize: 15, fontWeight: '800' },
  content: { marginTop: 12 },
});
