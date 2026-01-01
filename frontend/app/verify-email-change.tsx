// app/verify-email-change.tsx - メールアドレス変更確認ページ
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getApiUrl } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

export default function VerifyEmailChangeScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { updateEmail, reloadAuth } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('確認トークンが指定されていません');
      return;
    }

    const verifyEmailChange = async () => {
      try {
        const res = await fetch(getApiUrl('/auth/verify-email-change'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'メールアドレス変更に失敗しました');
          return;
        }

        // 新しいメールアドレスをAuthContextに反映
        if (data.new_email) {
          console.log('[VerifyEmailChange] Updating email to:', data.new_email);
          await updateEmail(data.new_email);
          // 認証情報を再読み込みして確実に状態を更新
          await reloadAuth();
          console.log('[VerifyEmailChange] Email updated successfully');
        }

        setStatus('success');
        setMessage(data.message || 'メールアドレスの変更が完了しました');
      } catch (error: any) {
        setStatus('error');
        setMessage(error.message || 'メールアドレス変更に失敗しました');
      }
    };

    verifyEmailChange();
  }, [token]);

  return (
    <View style={styles.container}>
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color="#333333" />
          <Text style={styles.message}>メールアドレス変更を確認中...</Text>
        </>
      )}

      {status === 'success' && (
        <>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.title}>メールアドレス変更完了</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.buttonText}>ホームに戻る</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'error' && (
        <>
          <Text style={styles.errorIcon}>✗</Text>
          <Text style={styles.title}>エラー</Text>
          <Text style={styles.errorMessage}>{message}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.buttonText}>ホームに戻る</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333333',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: '#666666',
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: '#ff0000',
  },
  successIcon: {
    fontSize: 64,
    color: '#4CAF50',
    marginBottom: 16,
  },
  errorIcon: {
    fontSize: 64,
    color: '#ff0000',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#333333',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

