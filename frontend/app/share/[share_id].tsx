import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getApiUrl } from '../../utils/api';
import { ScheduleCalendar } from '../../components/ScheduleCalendar';
import type { Schedule } from '../HomeScreen';

export default function SharedScheduleScreen() {
  const router = useRouter();
  const { share_id } = useLocalSearchParams<{ share_id: string }>();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      
      // 年を抽出してソート
      const years = new Set<number>();
      data.forEach((schedule) => {
        if (schedule.date) {
          const year = parseInt(schedule.date.split('-')[0]);
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

  const handleSchedulePress = (schedule: Schedule) => {
    router.push(`/public/${schedule.id}`);
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
    <ScrollView style={styles.scrollContainer}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>共有スケジュール</Text>
          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => router.push('/')}
          >
            <Text style={styles.homeButtonText}>🏠</Text>
          </TouchableOpacity>
        </View>

        {schedules.length > 0 && (
          <ScheduleCalendar schedules={schedules} />
        )}

        {availableYears.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>YEARS</Text>
            {availableYears.map((year) => (
              <TouchableOpacity
                key={year}
                style={styles.yearRow}
                onPress={() => router.push(`/year/${year}`)}
              >
                <Text style={styles.yearRowText}>{year}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {schedules.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ALL SCHEDULES</Text>
            <FlatList
              data={schedules}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => handleSchedulePress(item)}
                >
                  <Text style={styles.cardDate}>
                    {item.date ? item.date : '日付未設定'}
                  </Text>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  {item.group && item.group !== item.title && (
                    <Text style={styles.cardSub}>{item.group}</Text>
                  )}
                  {item.venue && (
                    <Text style={styles.cardSub}>会場: {item.venue}</Text>
                  )}
                </TouchableOpacity>
              )}
              scrollEnabled={false}
            />
          </View>
        )}

        {schedules.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>共有されているスケジュールはありません</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    paddingTop: 48,
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: 40,
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
  homeButton: {
    padding: 8,
  },
  homeButtonText: {
    fontSize: 24,
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
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: '#787774',
    fontSize: 14,
  },
});

