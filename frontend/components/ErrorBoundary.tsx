import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { useTheme, type ThemeColors } from '../contexts/ThemeContext';

const isProduction = process.env.NODE_ENV === 'production';

type ClassProps = { children: React.ReactNode; colors: ThemeColors };
type State = { error: Error | null };

class ErrorBoundaryClass extends React.Component<ClassProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 本番では画面にエラー詳細を出さないため、調査用に必ずコンソールへ残す
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
    const { colors } = this.props;
    const styles = getStyles(colors);

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>問題が発生しました</Text>
          <Text style={styles.message}>予期しないエラーが発生し、画面を表示できませんでした。</Text>
          {isProduction ? (
            <Text style={styles.message}>詳細はブラウザのコンソールをご確認ください。</Text>
          ) : (
            <Text selectable style={styles.errorDetail}>{error.message}</Text>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleReload}>
            <Text style={styles.buttonText}>ホームに戻る</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

// クラスコンポーネント（componentDidCatchが必要）ではuseThemeを直接使えないため、
// この関数コンポーネントでテーマを取得してcolorsをpropsで渡す
export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <ErrorBoundaryClass colors={colors}>{children}</ErrorBoundaryClass>;
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 16, maxWidth: 420 },
  errorDetail: {
    fontSize: 12,
    color: '#C2414B',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 420,
    ...(Platform.OS === 'web' ? { fontFamily: 'monospace' } : {}),
  },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: colors.accentContrastText, fontSize: 15, fontWeight: '700' },
});
