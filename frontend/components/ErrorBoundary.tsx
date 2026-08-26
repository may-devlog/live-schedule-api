import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

// アプリ全体を包む最終防波堤。ThemeProviderより外側に置くため、useThemeには依存できない
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
    } else {
      this.setState({ error: null });
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>問題が発生しました</Text>
          <Text style={styles.message}>予期しないエラーが発生し、画面を表示できませんでした。</Text>
          <Text selectable style={styles.errorDetail}>{error.message}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReload}>
            <Text style={styles.buttonText}>ホームに戻る</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#201B2C', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 14, color: '#6B6675', textAlign: 'center', marginBottom: 16, maxWidth: 420 },
  errorDetail: {
    fontSize: 12,
    color: '#C2414B',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 420,
    ...(Platform.OS === 'web' ? { fontFamily: 'monospace' } : {}),
  },
  button: { backgroundColor: '#18181B', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
