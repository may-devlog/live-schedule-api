import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { IconHome } from '@/components/FeatherSvgIcons';

export function HomeButton() {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => router.push('/')}
    >
      <View style={styles.buttonContent}>
        <IconHome size={16} color="#FFFFFF" />
        <Text style={styles.buttonText}>ホーム</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#7C3AED',
    borderWidth: 1,
    borderColor: '#7C3AED',
    minHeight: 42,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 9,
    alignSelf: 'flex-start',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});





