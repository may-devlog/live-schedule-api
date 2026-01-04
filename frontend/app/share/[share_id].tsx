import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getApiUrl } from '../../utils/api';
import { ScheduleCalendar } from '../../components/ScheduleCalendar';
import type { Schedule } from '../HomeScreen';

function formatDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return iso;
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours() + 0).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export default function SharedScheduleScreen() {
  const router = useRouter();
  const { share_id } = useLocalSearchParams<{ share_id: string }>();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [nextSchedules, setNextSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  useEffect(() => {
    console.log('[SharedScheduleScreen] share_id:', share_id);
    if (share_id) {
      fetchSchedules();
    } else {
      console.error('[SharedScheduleScreen] share_id is missing');
      setError('共有IDが指定されていません');
      setLoading(false);
    }
  }, [share_id]);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = getApiUrl(`/share/${share_id}`);
      console.log('[SharedScheduleScreen] Fetching from:', url);
      const res = await fetch(url);
      console.log('[SharedScheduleScreen] Response status:', res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[SharedScheduleScreen] Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: `サーバーエラー (${res.status})` };
        }
        throw new Error(errorData.error || '共有ページの取得に失敗しました');
      }
      const data: Schedule[] = await res.json();
      console.log('[SharedScheduleScreen] Received schedules:', data.length);
      setSchedules(data);
      
      // 未来のスケジュールをフィルタリング（JSTで比較）
      const nowUTC = new Date();
      const jstOffset = 9 * 60 * 60 * 1000; // JSTはUTC+9
      const utcTime = nowUTC.getTime();
      const jstNow = new Date(utcTime + jstOffset);
      
      const futureSchedules = data.filter((schedule) => {
        if (!schedule.datetime) {
          return false;
        }
        const scheduleDateUTC = new Date(schedule.datetime);
        const scheduleUtcTime = scheduleDateUTC.getTime();
        const scheduleDateJST = new Date(scheduleUtcTime + jstOffset);
        return scheduleDateJST.getTime() > jstNow.getTime();
      });
      
      // 未来のスケジュールを日時順にソートして、最初の3件を取得
      futureSchedules.sort((a, b) => {
        const dateA = a.datetime ? new Date(a.datetime).getTime() : 0;
        const dateB = b.datetime ? new Date(b.datetime).getTime() : 0;
        return dateA - dateB;
      });
      setNextSchedules(futureSchedules.slice(0, 3));
      
      // 年を抽出してソート
      const years = new Set<number>();
      data.forEach((schedule) => {
        if (schedule.date) {
          const year = parseInt(schedule.date.split('-')[0]);
          if (!isNaN(year)) {
            years.add(year);
          }
        } else if (schedule.datetime) {
          const date = new Date(schedule.datetime);
          const year = date.getUTCFullYear();
          if (!isNaN(year)) {
            years.add(year);
          }
        }
      });
      setAvailableYears(Array.from(years).sort((a, b) => b - a));
    } catch (err: any) {
      console.error('[SharedScheduleScreen] Error:', err);
      setError(err.message || 'スケジュールの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSchedulePress = (scheduleId: number) => {
    router.push(`/share/${share_id}/schedules/${scheduleId}`);
  };

  const onRefresh = async () => {
    console.log('[SharedScheduleScreen] onRefresh called');
    setRefreshing(true);
    try {
      console.log('[SharedScheduleScreen] Starting refresh...');
      await fetchSchedules();
      console.log('[SharedScheduleScreen] Refresh completed');
    } catch (error) {
      console.error('[SharedScheduleScreen] Refresh error:', error);
    } finally {
      console.log('[SharedScheduleScreen] Setting refreshing to false');
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#37352f" />
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchSchedules}
          >
            <Text style={styles.retryButtonText}>再試行</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.scrollContainer} 
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl 
          refreshing={refreshing} 
          onRefresh={onRefresh}
          tintColor={Platform.OS === 'ios' ? '#37352f' : undefined}
          colors={Platform.OS === 'android' ? ['#37352f'] : undefined}
        />
      }
      scrollEnabled={true}
      nestedScrollEnabled={true}
      onTouchStart={(e) => {
        const touch = e.nativeEvent.touches[0];
        if (touch) {
          setTouchStartY(touch.pageY);
        }
      }}
      onTouchMove={(e) => {
        if (touchStartY !== null) {
          const touch = e.nativeEvent.touches[0];
          if (touch) {
            const distance = touch.pageY - touchStartY;
            if (distance > 0) {
              setPullDistance(distance);
            }
          }
        }
      }}
      onTouchEnd={() => {
        if (pullDistance > 100 && !refreshing) {
          onRefresh();
        }
        setTouchStartY(null);
        setPullDistance(0);
      }}
      onScroll={(e) => {
        const { contentOffset } = e.nativeEvent;
        if (contentOffset.y === 0 && pullDistance > 100 && !refreshing) {
          onRefresh();
        }
      }}
      scrollEventThrottle={16}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>SCHEDULES</Text>
        </View>

        {/* カレンダー */}
        <ScheduleCalendar 
          schedules={schedules} 
          isPublic={true}
          onSchedulePress={handleSchedulePress}
        />

        <Text style={styles.sectionTitle}>NEXT</Text>
        {loading && <ActivityIndicator color="#333333" />}
        {error && <Text style={styles.errorText}>Error: {error}</Text>}
        {!loading && !error && nextSchedules.length === 0 && (
          <Text style={styles.emptyText}>No upcoming schedules</Text>
        )}
        {!loading && !error && nextSchedules.length > 0 && (
          <FlatList
            data={nextSchedules}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleSchedulePress(item)}
              >
                <Text style={styles.cardDate}>
                  {formatDateTimeUTC(item.datetime)}
                </Text>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.cardSub}>
                  {item.area} / {item.venue}
                </Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

        <Text style={styles.sectionTitle}>Years</Text>
        <View style={styles.yearListColumn}>
          {availableYears.map((year) => (
            <TouchableOpacity
              key={year}
              style={styles.yearRow}
              onPress={() => router.push(`/share/${share_id}/year/${year}`)}
            >
              <Text style={styles.yearRowText}>{year}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.bottomSpacer} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
    minHeight: '100%',
  },
  container: {
    paddingTop: 48,
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#37352f',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 16,
    color: '#787774',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  errorText: {
    color: '#d93025',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#37352f',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
    marginTop: 32,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  yearListColumn: {
    flexDirection: 'column',
  },
  yearRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9e9e7',
  },
  yearRowText: {
    color: '#37352f',
    fontSize: 16,
    fontWeight: '500',
  },
  separator: {
    height: 0,
  },
  errorText: {
    color: '#d93025',
    marginVertical: 8,
    fontSize: 14,
  },
  emptyText: {
    color: '#787774',
    fontSize: 14,
    marginVertical: 8,
  },
  bottomSpacer: {
    height: 32,
  },
  card: {
    padding: 16,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 12,
    color: '#787774',
    marginBottom: 6,
    fontWeight: '500',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 4,
    lineHeight: 22,
  },
  cardSub: {
    fontSize: 14,
    color: '#787774',
    marginTop: 4,
  },
});

