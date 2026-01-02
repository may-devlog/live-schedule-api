import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { getApiUrl } from "../../../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../../../components/notion-property";
import { NotionTag } from "../../../../components/notion-tag";
import { getOptionColor } from "../../../../utils/get-option-color";
import { loadSelectOptions } from "../../../../utils/select-options-storage";
import type { Schedule } from "../../../HomeScreen";
import { maskHotelName } from "../../../../utils/mask-hotel-name";

type TrafficSummary = {
  id: number;
  schedule_id: number;
  date: string;
  order: number;
  transportation?: string | null;
  from: string;
  to: string;
  notes?: string | null;
  fare: number;
  miles?: number | null;
  return_flag: boolean;
  total_fare?: number | null;
  total_miles?: number | null;
};

type StaySummary = {
  id: number;
  schedule_id: number;
  date: string;
  title: string;
  notes?: string | null;
  fee: number;
};

export default function SharedScheduleDetailScreen() {
  const { share_id, id } = useLocalSearchParams<{ share_id: string; id: string }>();
  const router = useRouter();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [traffics, setTraffics] = useState<TrafficSummary[]>([]);
  const [stays, setStays] = useState<StaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (share_id && id) {
      fetchSchedule();
      fetchTraffics();
      fetchStays();
    }
  }, [share_id, id]);

  const fetchSchedule = async () => {
    try {
      const res = await fetch(getApiUrl(`/share/${share_id}/schedules/${id}`));
      if (!res.ok) {
        throw new Error('スケジュールの取得に失敗しました');
      }
      const data: Schedule = await res.json();
      setSchedule(data);
    } catch (err: any) {
      console.error('[SharedScheduleDetailScreen] Error:', err);
      setError(err.message || 'スケジュールの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchTraffics = async () => {
    try {
      const res = await fetch(getApiUrl(`/public/traffic?schedule_id=${id}`));
      if (res.ok) {
        const data: TrafficSummary[] = await res.json();
        setTraffics(data);
      }
    } catch (err) {
      console.error('[SharedScheduleDetailScreen] Failed to fetch traffics:', err);
    }
  };

  const fetchStays = async () => {
    try {
      const res = await fetch(getApiUrl(`/public/stay?schedule_id=${id}`));
      if (res.ok) {
        const data: StaySummary[] = await res.json();
        setStays(data);
      }
    } catch (err) {
      console.error('[SharedScheduleDetailScreen] Failed to fetch stays:', err);
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

  if (error || !schedule) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'スケジュールが見つかりません'}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollContainer}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← 戻る</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => router.push('/')}
          >
            <Text style={styles.homeButtonText}>🏠</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>{schedule.title}</Text>

        <NotionPropertyBlock>
          <NotionProperty label="日付" value={schedule.date || '-'} />
          <NotionProperty label="開場" value={schedule.open || '-'} />
          <NotionProperty label="開演" value={schedule.start || '-'} />
          <NotionProperty label="終了" value={schedule.end || '-'} />
          <NotionProperty label="グループ" value={schedule.group || '-'} />
          <NotionProperty label="会場" value={schedule.venue || '-'} />
          <NotionProperty label="エリア" value={schedule.area || '-'} />
          <NotionProperty label="カテゴリ" value={schedule.category || '-'} />
          <NotionProperty label="ステータス" value={schedule.status || '-'} />
        </NotionPropertyBlock>

        {traffics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>交通</Text>
            {traffics.map((traffic) => (
              <View key={traffic.id} style={styles.trafficCard}>
                <Text style={styles.trafficText}>
                  {traffic.from} → {traffic.to}
                </Text>
                {traffic.transportation && (
                  <Text style={styles.trafficSubText}>
                    交通手段: {traffic.transportation}
                  </Text>
                )}
                <Text style={styles.trafficSubText}>
                  料金: ¥{traffic.fare.toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        {stays.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>宿泊</Text>
            {stays.map((stay) => (
              <View key={stay.id} style={styles.stayCard}>
                <Text style={styles.stayText}>
                  {maskHotelName(stay.title, false)} {/* 共有ページでは常に非マスク */}
                </Text>
                <Text style={styles.staySubText}>
                  料金: ¥{stay.fee.toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        {schedule.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>備考</Text>
            <Text style={styles.notesText}>{schedule.notes}</Text>
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
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
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
  trafficCard: {
    padding: 16,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    marginBottom: 8,
  },
  trafficText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 4,
  },
  trafficSubText: {
    fontSize: 14,
    color: '#787774',
    marginTop: 4,
  },
  stayCard: {
    padding: 16,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    marginBottom: 8,
  },
  stayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#37352f',
    marginBottom: 4,
  },
  staySubText: {
    fontSize: 14,
    color: '#787774',
    marginTop: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#37352f',
    lineHeight: 20,
  },
});

