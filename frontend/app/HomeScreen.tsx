// app/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";

export type Schedule = {
  id: number;
  title: string;
  group: string; // groupがNULLの場合はtitleが使用される（バックエンドでフォールバック）
  datetime: string; // date + start から生成（計算フィールド）
  date?: string | null;
  open?: string | null;
  start?: string | null;
  end?: string | null;
  notes?: string | null;
  category?: string | null;
  area: string;
  venue: string;
  target?: string | null;
  lineup?: string | null;
  seller?: string | null;
  ticket_fee?: number | null;
  drink_fee?: number | null;
  total_fare?: number | null;
  stay_fee?: number | null;
  travel_cost?: number | null;
  total_cost?: number | null;
  status: string; // "Canceled" | "Pending" | "Keep" | "Done"
  related_schedule_ids?: number[];
  traffic_ids?: string[];
  stay_ids?: string[];
  user_id?: number | null;
  is_public?: boolean;
};

import { authenticatedFetch, getApiUrl } from "../utils/api";

const YEARS = [2024, 2025, 2026];

export default function HomeScreen() {
  const router = useRouter();

  const [nextSchedules, setNextSchedules] = useState<Schedule[]>([]);
  const [loadingNext, setLoadingNext] = useState(false);
  const [errorNext, setErrorNext] = useState<string | null>(null);

  const fetchUpcoming = async () => {
    try {
      setLoadingNext(true);
      setErrorNext(null);
      const url = getApiUrl("/schedules/upcoming");
      console.log("Fetching upcoming schedules from:", url);
      const res = await authenticatedFetch(url);
      if (!res.ok) {
        throw new Error(`status: ${res.status}`);
      }
      const data: Schedule[] = await res.json();
      console.log("Upcoming schedules received:", data.length, "items");
      console.log("Data:", data);
      setNextSchedules(data);
    } catch (e: any) {
      console.error("Error fetching upcoming schedules:", e);
      setErrorNext(e.message ?? "Unknown error");
    } finally {
      setLoadingNext(false);
    }
  };

  const handleOpenYearPage = (year: number) => {
    router.push(`/year/${year}`);
  };

  const handleOpenNew = () => {
    router.push("/new");
  };

  useEffect(() => {
    fetchUpcoming();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live SCHEDULE</Text>

      <TouchableOpacity style={styles.newButton} onPress={handleOpenNew}>
        <Text style={styles.newButtonText}>+ New Live</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>NEXT</Text>
      {loadingNext && <ActivityIndicator color="#333333" />}
      {errorNext && <Text style={styles.errorText}>Error: {errorNext}</Text>}
      {!loadingNext && !errorNext && nextSchedules.length === 0 && (
        <Text style={styles.emptyText}>No upcoming schedules</Text>
      )}
      {!loadingNext && !errorNext && nextSchedules.length > 0 && (
        <FlatList
          data={nextSchedules}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/live/${item.id}`)}
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
        {YEARS.map((year) => (
          <TouchableOpacity
            key={year}
            style={styles.yearRow}
            onPress={() => handleOpenYearPage(year)}
          >
            <Text style={styles.yearRowText}>{year}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function formatDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return iso;
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours() + 0).padStart(2, "0"); // UTCのまま
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 48,
    paddingHorizontal: 24,
    backgroundColor: "#ffffff",
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  title: {
    fontSize: 40,
    fontWeight: "700",
    color: "#37352f",
    marginBottom: 24,
  },
  newButton: {
    alignSelf: "flex-start",
    marginBottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    backgroundColor: "#37352f",
  },
  newButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    marginTop: 32,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    padding: 16,
    borderRadius: 3,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 12,
    color: "#787774",
    marginBottom: 6,
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 4,
    lineHeight: 22,
  },
  cardSub: {
    fontSize: 14,
    color: "#787774",
    marginTop: 4,
  },
  separator: {
    height: 0,
  },
  errorText: {
    color: "#d93025",
    marginVertical: 8,
    fontSize: 14,
  },
  emptyText: {
    color: "#787774",
    fontSize: 14,
    fontStyle: "italic",
    marginTop: 8,
  },
  yearListColumn: {
    marginTop: 8,
  },
  yearRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  yearRowText: {
    color: "#37352f",
    fontSize: 16,
    fontWeight: "500",
  },
});