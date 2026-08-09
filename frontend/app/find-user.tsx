import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AuthHeader, PublicFooter, brand } from '@/components/GenBGTBrand';
import { getApiUrl } from '@/utils/api';

type SearchResult = {
  share_id: string;
  avatar_data_url: string | null;
};

export default function FindUserScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const findFromExistingShareEndpoint = async (normalized: string): Promise<SearchResult | null> => {
    const sharedRes = await fetch(getApiUrl(`/share/${encodeURIComponent(normalized)}`));
    if (!sharedRes.ok) return null;

    // 新しいプロフィールAPIが未デプロイの環境でも検索自体は成功させる
    let avatarDataUrl: string | null = null;
    try {
      const profileRes = await fetch(getApiUrl(`/share/${encodeURIComponent(normalized)}/profile`));
      if (profileRes.ok) {
        const profile = await profileRes.json();
        avatarDataUrl = profile.avatar_data_url ?? null;
      }
    } catch {
      // プロフィール画像は任意なので、取得できなくても共有ページを表示する
    }
    return { share_id: normalized, avatar_data_url: avatarDataUrl };
  };

  const search = async () => {
    const normalized = userId.trim();
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(normalized)) {
      setResult(null);
      setMessage('ユーザーIDは3〜20文字の英数字・ハイフン・アンダースコアで入力してください。');
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      setResult(null);
      let found: SearchResult | null = null;
      try {
        const res = await fetch(getApiUrl(`/share/search-user?user_id=${encodeURIComponent(normalized)}`));
        if (res.ok) {
          const data = await res.json();
          if (data.found) found = { share_id: data.share_id, avatar_data_url: data.avatar_data_url ?? null };
        } else {
          found = await findFromExistingShareEndpoint(normalized);
        }
      } catch {
        found = await findFromExistingShareEndpoint(normalized);
      }

      if (found) setResult(found);
      else setMessage('共有中のユーザーが見つかりませんでした。ユーザーIDをご確認ください。');
    } catch (error: any) {
      setMessage(error.message || '検索に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <AuthHeader />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.main}>
          <View style={styles.card}>
            <View style={styles.iconCircle}><Ionicons name="people-outline" size={30} color={brand.violet} /></View>
            <Text style={styles.title}>共有ユーザーを探す</Text>
            <Text style={styles.lead}>ユーザーIDを入力すると、共有を公開しているユーザーのスケジュールを表示できます。</Text>

            <Text style={styles.label}>ユーザーID</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.input}
                value={userId}
                onChangeText={(value) => { setUserId(value); setResult(null); setMessage(null); }}
                onSubmitEditing={search}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                editable={!loading}
              />
              <TouchableOpacity style={styles.searchButton} onPress={search} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="search" size={20} color="#FFFFFF" />}
                <Text style={styles.searchButtonText}>検索</Text>
              </TouchableOpacity>
            </View>

            {!!message && <View style={styles.messageBox}><Text style={styles.message}>{message}</Text></View>}

            {result && (
              <TouchableOpacity style={styles.resultCard} onPress={() => router.push(`/share/${result.share_id}`)}>
                <View style={styles.avatar}>
                  {result.avatar_data_url ? <Image source={{ uri: result.avatar_data_url }} style={styles.avatarImage} /> : <Ionicons name="person" size={27} color="#A6A0AE" />}
                </View>
                <View style={styles.resultCopy}>
                  <Text style={styles.resultId}>{result.share_id}</Text>
                  <Text style={styles.resultLabel}>公開中のライブスケジュール</Text>
                </View>
                <View style={styles.openButton}><Ionicons name="arrow-forward" size={19} color="#FFFFFF" /></View>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <PublicFooter compact />
      </ScrollView>
    </View>
  );
}

const shadow = Platform.OS === 'web' ? ({ boxShadow: '0 18px 50px rgba(46,16,101,0.09)' } as any) : {};
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brand.lavender },
  scrollContent: { flexGrow: 1 },
  main: { flex: 1, minHeight: 650, padding: 24, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 620, padding: 36, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brand.border, borderRadius: 24, ...shadow },
  iconCircle: { width: 58, height: 58, borderRadius: 29, alignSelf: 'center', backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 18, color: brand.ink, fontSize: 27, fontWeight: '800', textAlign: 'center' },
  lead: { marginTop: 10, marginBottom: 28, color: brand.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  label: { color: brand.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  searchRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, height: 50, borderWidth: 1, borderColor: '#D8D3E0', borderRadius: 10, paddingHorizontal: 14, color: brand.ink, fontSize: 15 },
  searchButton: { height: 50, minWidth: 104, paddingHorizontal: 16, borderRadius: 10, backgroundColor: brand.violet, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  messageBox: { marginTop: 18, padding: 14, borderRadius: 10, backgroundColor: '#F7F5FA' },
  message: { color: brand.muted, fontSize: 13, lineHeight: 20 },
  resultCard: { marginTop: 20, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 14, padding: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF9FF' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F0EEF3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  resultCopy: { flex: 1, marginLeft: 13 },
  resultId: { color: brand.ink, fontSize: 17, fontWeight: '800' },
  resultLabel: { color: brand.muted, fontSize: 12, marginTop: 3 },
  openButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center' },
});
