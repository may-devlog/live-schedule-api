// app/public/index.tsx - 公開スケジュール一覧ページ
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { getApiUrl } from "../../utils/api";
import type { Schedule } from "../HomeScreen";

export default function PublicIndexScreen() {
  const router = useRouter();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPublicSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = getApiUrl("/public/schedules");
      console.log("Fetching public schedules from:", url);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`status: ${res.status}`);
      }
      const data: Schedule[] = await res.json();
      console.log("Public schedules received:", data.length, "items");
      
      // 日付順にソート（未来のイベントを先に）
      const sorted = data.sort((a, b) => {
        const dateA = new Date(a.datetime).getTime();
        const dateB = new Date(b.datetime).getTime();
        return dateA - dateB;
      });
      
      setSchedules(sorted);
    } catch (e: any) {
      console.error("Error fetching public schedules:", e);
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSchedule = (id: number) => {
    router.push(`/public/${id}`);
  };

  const formatDate = (datetime: string) => {
    const d = new Date(datetime);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    fetchPublicSchedules();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchPublicSchedules();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>公開スケジュール</Text>

      {loading && <ActivityIndicator color="#333333" style={styles.loader} />}
      {error && <Text style={styles.errorText}>Error: {error}</Text>}
      
      {!loading && !error && schedules.length === 0 && (
        <Text style={styles.emptyText}>公開されているスケジュールがありません</Text>
      )}

      {!loading && !error && schedules.length > 0 && (
        <FlatList
          data={schedules}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.scheduleItem}
              onPress={() => handleOpenSchedule(item.id)}
            >
              <Text style={styles.scheduleDate}>{formatDate(item.datetime)}</Text>
              <Text style={styles.scheduleTitle}>{item.title}</Text>
              {item.venue && (
                <Text style={styles.scheduleVenue}>{item.venue}</Text>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#37352f",
    marginBottom: 24,
  },
  loader: {
    marginTop: 24,
  },
  errorText: {
    color: "#d93025",
    marginTop: 24,
    fontSize: 14,
  },
  emptyText: {
    color: "#9b9a97",
    marginTop: 24,
    fontSize: 14,
    fontStyle: "italic",
  },
  listContent: {
    paddingBottom: 24,
  },
  scheduleItem: {
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    padding: 16,
    marginBottom: 12,
  },
  scheduleDate: {
    fontSize: 12,
    color: "#9b9a97",
    marginBottom: 4,
  },
  scheduleTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 4,
  },
  scheduleVenue: {
    fontSize: 14,
    color: "#787774",
  },
});



