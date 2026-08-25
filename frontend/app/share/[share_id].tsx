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
import { isJapaneseHolidayDate, ScheduleCalendar } from '../../components/ScheduleCalendar';
import { NotionTag } from '../../components/notion-tag';
import { AppHeader, PublicFooter, PublicHeader } from '../../components/GenBGTBrand';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { AppTabBar } from '../../components/AppTabBar';
import { authenticatedFetch, getApiUrl } from '../../utils/api';
import { fetchAreaColors } from '../../utils/fetch-area-colors';
import { getOptionColorSync } from '../../utils/get-option-color';
import { fetchProfile } from '../../utils/profile-request';
import type { Schedule } from '../HomeScreen';

function nextDateDisplay(raw: string) {
  const datePart = raw.slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const holiday = isJapaneseHolidayDate(datePart);
  const weekday = `${['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}${holiday ? '・祝' : ''}`;
  const tone = date.getDay() === 6 ? 'saturday' : (date.getDay() === 0 || holiday) ? 'holiday' : 'weekday';
  return { label: datePart.replace(/-/g, '.'), weekday, tone };
}

type ScheduleScreenProps = { authenticated?: boolean };

export default function SharedScheduleScreen({ authenticated = false }: ScheduleScreenProps = {}) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { share_id } = useLocalSearchParams<{ share_id?: string }>();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [nextSchedules, setNextSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [profileShareId, setProfileShareId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = authenticated
        ? await authenticatedFetch(getApiUrl('/schedules?include_canceled=true'))
        : await fetch(getApiUrl(`/share/${share_id}`));
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
  }, [share_id, authenticated]);

  useEffect(() => {
    if (authenticated || share_id) fetchSchedules();
    else {
      setError('共有IDが指定されていません');
      setLoading(false);
    }
  }, [share_id, authenticated, fetchSchedules]);

  useEffect(() => {
    if (!authenticated && !share_id) return;
    fetchProfile(authenticated, share_id)
      .then((data) => {
        setAvatarDataUrl(data?.avatar_data_url ?? null);
        setDisplayName(data?.display_name ?? null);
        setProfileShareId(data?.share_id ?? share_id ?? null);
      })
      .catch(() => { setAvatarDataUrl(null); setDisplayName(null); setProfileShareId(share_id ?? null); });
  }, [share_id, authenticated]);

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
    return (
      <View style={styles.page}>
        {authenticated ? <AppHeader active="home" /> : <PublicHeader active="home" homePath={`/share/${share_id}`} archivePath={`/share/${share_id}/year/${availableYears[0] ?? new Date().getFullYear()}`} />}
        <View style={styles.statePage}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.stateText}>読み込み中...</Text>
        </View>
      </View>
    );
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
      {authenticated ? <AppHeader active="home" onDisplayNameChange={setDisplayName} /> : <PublicHeader active="home" homePath={`/share/${share_id}`} archivePath={`/share/${share_id}/year/${availableYears[0] ?? new Date().getFullYear()}`} />}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={Platform.OS !== 'web' ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
      >
        <View style={styles.main}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              {avatarDataUrl ? <Image source={{ uri: avatarDataUrl }} style={styles.avatarImage} /> : <Ionicons name="person" size={26} color="#A6A0AE" />}
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{displayName || profileShareId || 'MY SCHEDULE'}</Text>
              {!!displayName && !!profileShareId && <Text style={styles.profileLabel}>@{profileShareId}</Text>}
            </View>
            <TouchableOpacity style={styles.shareButton} onPress={authenticated ? () => router.push('/new') : handleShare}>
              <Ionicons name={authenticated ? "add" : "share-outline"} size={18} color={colors.accent} />
              <Text style={styles.shareText}>{authenticated ? '新規イベント' : 'シェア'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.calendarSection}>
            <Text style={styles.pageTitle}>SCHEDULE</Text>
            <ScheduleCalendar schedules={schedules} isPublic={!authenticated} onSchedulePress={(id) => router.push(authenticated ? `/live/${id}` : `/share/${share_id}/schedules/${id}`)} />
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
                  const dateDisplay = nextDateDisplay(item.date ?? item.datetime);
                  return (
                    <TouchableOpacity style={styles.eventRow} onPress={() => router.push(authenticated ? `/live/${item.id}` : `/share/${share_id}/schedules/${item.id}`)}>
                      <View style={styles.eventContent}>
                        <View style={styles.nextDateRow}>
                          <Text style={styles.nextDate}>{dateDisplay.label}</Text>
                          <Text style={[styles.nextWeekday, dateDisplay.tone === 'saturday' && styles.nextSaturday, dateDisplay.tone === 'holiday' && styles.nextHoliday]}>{dateDisplay.weekday}</Text>
                        </View>
                        <Text style={styles.eventTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.metaRow}>
                          {item.area && <NotionTag label={item.area} color={areaColors.get(item.id) || getOptionColorSync(item.area, 'AREAS')} />}
                          {!!item.status && <NotionTag label={item.status} color={getOptionColorSync(item.status, 'STATUSES')} />}
                        </View>
                        {!!item.venue && <View style={styles.venuePill}><Ionicons name="location-outline" size={14} color={colors.accent} /><Text style={styles.venueText}>{item.venue}</Text></View>}
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
              {availableYears.map((year) => {
                const isCurrentYear = year === new Date().getFullYear();
                return (
                  <TouchableOpacity key={year} style={[styles.yearPill, isCurrentYear && styles.yearPillActive]} onPress={() => router.push(authenticated ? `/year/${year}` : `/share/${share_id}/year/${year}`)}>
                    <Text style={[styles.yearText, isCurrentYear && styles.yearTextActive]}>{year}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
        <PublicFooter />
      </ScrollView>
      <AppTabBar
        active="home"
        homePath={authenticated ? '/' : `/share/${share_id}`}
        archivePath={authenticated ? `/year/${availableYears[0] ?? new Date().getFullYear()}` : `/share/${share_id}/year/${availableYears[0] ?? new Date().getFullYear()}`}
      />
    </View>
  );
}

const cardShadow = Platform.OS === 'web' ? ({ boxShadow: '0 10px 32px rgba(46,16,101,0.06)' } as any) : {};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceAlt },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  main: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 48, gap: 16 },
  profileCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', ...cardShadow },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F0EEF3', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 24 },
  profileCopy: { marginLeft: 14, flex: 1 },
  profileName: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  profileLabel: { color: colors.muted, fontSize: 13, marginTop: 3 },
  shareButton: { minHeight: 42, borderWidth: 1, borderColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, flexDirection: 'row', gap: 7, alignItems: 'center' },
  shareText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  calendarSection: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 22, ...cardShadow },
  pageTitle: { color: colors.accent, fontSize: 14, fontWeight: '800', letterSpacing: 0.6, marginBottom: 12 },
  sectionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, ...cardShadow },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  eventContent: { flex: 1 },
  nextDateRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 5 },
  nextDate: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  nextWeekday: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', minWidth: 30, fontFamily: Platform.OS === 'web' ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' : 'monospace' },
  nextSaturday: { color: '#2563EB' },
  nextHoliday: { color: '#DC2626' },
  eventDate: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  eventTime: { color: colors.muted, fontWeight: '600' },
  eventTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', lineHeight: 25, marginTop: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  venuePill: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  venueText: { color: colors.muted, fontSize: 12 },
  arrowButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  yearList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  yearPill: { backgroundColor: '#F5F3F7', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' },
  yearPillActive: { backgroundColor: colors.surface, borderColor: colors.accent },
  yearText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  yearTextActive: { color: colors.accent },
  emptyText: { color: colors.muted, fontSize: 14, paddingVertical: 8 },
  statePage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, padding: 24 },
  stateText: { color: colors.muted, fontSize: 14, marginTop: 14 },
  errorText: { color: '#C2414B', fontSize: 15, textAlign: 'center', marginBottom: 18 },
  retryButton: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});
