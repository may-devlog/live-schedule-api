import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export function HomeButton() {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => router.push('/')}
    >
      <Text style={styles.buttonText}>🏠 ホーム</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#f7f6f3',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 3,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#37352f',
    fontSize: 14,
    fontWeight: '600',
  },
});

