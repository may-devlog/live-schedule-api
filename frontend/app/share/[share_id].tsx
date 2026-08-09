import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScheduleCalendar } from '../../components/ScheduleCalendar';
import { NotionTag } from '../../components/notion-tag';
import { PublicFooter, PublicHeader, brand } from '../../components/GenBGTBrand';
import { getApiUrl } from '../../utils/api';
import { fetchAreaColors } from '../../utils/fetch-area-colors';
import { getOptionColorSync } from '../../utils/get-option-color';
import type { Schedule } from '../HomeScreen';

export default function SharedScheduleScreen() {
  const router = useRouter();
  const { share_id } = useLocalSearchParams<{ share_id: string }>();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [nextSchedules, setNextSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(getApiUrl(`/share/${share_id}`));
      if (!res.ok) {
        const body = await res.text();
        let message = `サーバーエラー (${res.status})`;
        try { message = JSON.parse(body).error || message; } catch {}
        throw new Error(message);
      }
      const data: Schedule[] = await res.json();
      const visible = data.filter((schedule) => schedule.status !== 'Canceled');
      setSchedules(visible);

      const now = Date.now();
      const future = visible
        .filter((schedule) => schedule.datetime && new Date(schedule.datetime).getTime() > now)
        .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
      setNextSchedules(future.slice(0, 3));

      const years = new Set<number>();
      data.forEach((schedule) => {
        const rawYear = schedule.date?.split('-')[0] ?? (schedule.datetime ? String(new Date(schedule.datetime).getUTCFullYear()) : '');
        const year = Number(rawYear);
        if (year) years.add(year);
      });
      setAvailableYears(Array.from(years).sort((a, b) => b - a));
    } catch (err: any) {
      setError(err.message || 'スケジュールの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [share_id]);

  useEffect(() => {
    if (share_id) fetchSchedules();
    else {
      setError('共有IDが指定されていません');
      setLoading(false);
    }
  }, [share_id, fetchSchedules]);

  useEffect(() => {
    if (!share_id) return;
    fetch(getApiUrl(`/share/${share_id}/profile`))
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setAvatarDataUrl(data?.avatar_data_url ?? null))
      .catch(() => setAvatarDataUrl(null));
  }, [share_id]);

  useEffect(() => {
    if (!nextSchedules.length) return;
    let mounted = true;
    fetchAreaColors(nextSchedules).then((colors) => mounted && setAreaColors(colors));
    return () => { mounted = false; };
  }, [nextSchedules]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSchedules();
    setRefreshing(false);
  };

  const handleShare = async () => {
    const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : `https://www.genbgt.com/share/${share_id}`;
    await Share.share({ title: `${share_id}のライブスケジュール`, message: url, url });
  };

  if (loading) {
    return <View style={styles.statePage}><ActivityIndicator size="large" color={brand.violet} /><Text style={styles.stateText}>読み込み中...</Text></View>;
  }

  if (error) {
    return (
      <View style={styles.statePage}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchSchedules}><Text style={styles.retryText}>再試行</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <PublicHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={Platform.OS !== 'web' ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.violet} /> : undefined}
      >
        <View style={styles.main}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              {avatarDataUrl ? <Image source={{ uri: avatarDataUrl }} style={styles.avatarImage} /> : <Ionicons name="person" size={26} color="#A6A0AE" />}
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{share_id}</Text>
              <Text style={styles.profileLabel}>ライブスケジュール</Text>
            </View>
            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={18} color={brand.violet} />
              <Text style={styles.shareText}>シェア</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.calendarSection}>
            <Text style={styles.pageTitle}>SCHEDULE</Text>
            <ScheduleCalendar schedules={schedules} isPublic onSchedulePress={(id) => router.push(`/share/${share_id}/schedules/${id}`)} />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.eyebrow}>NEXT LIVE</Text>
            {!nextSchedules.length ? (
              <Text style={styles.emptyText}>今後のスケジュールはありません</Text>
            ) : (
              <FlatList
                data={nextSchedules}
                keyExtractor={(item) => String(item.id)}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.divider} />}
                renderItem={({ item }) => {
                  return (
                    <TouchableOpacity style={styles.eventRow} onPress={() => router.push(`/share/${share_id}/schedules/${item.id}`)}>
                      <View style={styles.eventContent}>
                        <Text style={styles.eventTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.metaRow}>
                          {item.area && <NotionTag label={item.area} color={areaColors.get(item.id) || getOptionColorSync(item.area, 'AREAS')} />}
                          {!!item.status && <NotionTag label={item.status} color={getOptionColorSync(item.status, 'STATUSES')} />}
                        </View>
                        {!!item.venue && <View style={styles.venuePill}><Ionicons name="location-outline" size={14} color={brand.violet} /><Text style={styles.venueText}>{item.venue}</Text></View>}
                      </View>
                      <View style={styles.arrowButton}><Ionicons name="arrow-forward" size={20} color="#FFFFFF" /></View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.eyebrow}>ARCHIVE</Text>
            <View style={styles.yearList}>
              {availableYears.map((year, index) => (
                <TouchableOpacity key={year} style={[styles.yearPill, index === 0 && styles.yearPillActive]} onPress={() => router.push(`/share/${share_id}/year/${year}`)}>
                  <Text style={[styles.yearText, index === 0 && styles.yearTextActive]}>{year}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        <PublicFooter />
      </ScrollView>
    </View>
  );
}

const cardShadow = Platform.OS === 'web' ? ({ boxShadow: '0 10px 32px rgba(46,16,101,0.06)' } as any) : {};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brand.lavender },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  main: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 48, gap: 16 },
  profileCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brand.border, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', ...cardShadow },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F0EEF3', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 24 },
  profileCopy: { marginLeft: 14, flex: 1 },
  profileName: { color: brand.ink, fontSize: 17, fontWeight: '700' },
  profileLabel: { color: brand.muted, fontSize: 13, marginTop: 3 },
  shareButton: { minHeight: 42, borderWidth: 1, borderColor: brand.violet, borderRadius: 10, paddingHorizontal: 16, flexDirection: 'row', gap: 7, alignItems: 'center' },
  shareText: { color: brand.violet, fontSize: 14, fontWeight: '700' },
  calendarSection: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brand.border, borderRadius: 18, padding: 22, ...cardShadow },
  pageTitle: { fontSize: 28, fontWeight: '800', color: brand.ink, letterSpacing: -0.4, marginBottom: 2 },
  sectionCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brand.border, borderRadius: 16, padding: 20, ...cardShadow },
  eyebrow: { color: brand.violet, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  eventContent: { flex: 1 },
  eventDate: { color: brand.ink, fontSize: 14, fontWeight: '700' },
  eventTime: { color: brand.muted, fontWeight: '600' },
  eventTitle: { color: brand.ink, fontSize: 18, fontWeight: '700', lineHeight: 25, marginTop: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  venuePill: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  venueText: { color: brand.muted, fontSize: 12 },
  arrowButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: brand.border, marginVertical: 16 },
  yearList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  yearPill: { backgroundColor: '#F5F3F7', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' },
  yearPillActive: { backgroundColor: '#FFFFFF', borderColor: brand.violet },
  yearText: { color: brand.muted, fontSize: 14, fontWeight: '600' },
  yearTextActive: { color: brand.violet },
  emptyText: { color: brand.muted, fontSize: 14, paddingVertical: 8 },
  statePage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.lavender, padding: 24 },
  stateText: { color: brand.muted, fontSize: 14, marginTop: 14 },
  errorText: { color: '#C2414B', fontSize: 15, textAlign: 'center', marginBottom: 18 },
  retryButton: { backgroundColor: brand.violet, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});
