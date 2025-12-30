// app/year/[year].tsx

import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import type { Schedule } from "../HomeScreen";
import { authenticatedFetch, getApiUrl } from "../../utils/api";

const YEARS = [2024, 2025, 2026];

export default function YearScreen() {
  const params = useLocalSearchParams<{ year: string }>();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(
    params.year ?? null
  );

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

const fetchYear = async (y: string) => {
  try {
    setLoading(true);
    setError(null);

    const url = getApiUrl(`/schedules?year=${y}`);
    const res = await authenticatedFetch(url);

    if (!res.ok) throw new Error(`status: ${res.status}`);

    const data: Schedule[] = await res.json();
    console.log("YEAR SCHEDULES FROM API:", y, data);
    setSchedules(data);
  } catch (e: any) {
    console.log("ERROR FETCHING YEAR:", e);
    setError(e.message ?? "Unknown error");
  } finally {
    setLoading(false);
  }
};

  // currentYear が変わるたびにその年を再取得
  useEffect(() => {
    if (!currentYear) return;
    fetchYear(currentYear);
  }, [currentYear]);

  const handleSelectYear = (y: number) => {
    const yStr = String(y);
    setCurrentYear(yStr);
    // URL も変えたいなら以下を有効化
    // router.push(`/year/${yStr}`);
  };

  const handleOpenDetail = (id: number) => {
    router.push(`/live/${id}`);
  };

  return (
    <View style={styles.container}>
      {/* ナビゲーションバーのタイトル */}
      <Stack.Screen options={{ title: `Year ${currentYear ?? ""}` }} />

      <Text style={styles.title}>Year {currentYear}</Text>

      {/* 年ボタン */}
      <View style={styles.yearSelector}>
        {YEARS.map((y) => (
          <TouchableOpacity
            key={y}
            style={[
              styles.yearButton,
              currentYear === String(y) && styles.yearButtonActive,
            ]}
            onPress={() => handleSelectYear(y)}
          >
            <Text
              style={[
                styles.yearButtonText,
                currentYear === String(y) && styles.yearButtonTextActive,
              ]}
            >
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator color="#333333" />}
      {error && <Text style={styles.errorText}>Error: {error}</Text>}

      {!loading && !error && (
        <FlatList
          data={schedules}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => handleOpenDetail(item.id)}
            >
              <Text style={styles.cardDate}>
                {formatDateTimeUTC(item.datetime)}
              </Text>
              {/* ツアー名 (Group) */}
              <Text style={styles.cardGroup} numberOfLines={1}>
                {item.group || item.title}
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
    </View>
  );
}

// RustのUTC時刻をそのまま表示するフォーマット
function formatDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return iso;
  }

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 24,
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
  yearSelector: {
    flexDirection: "row",
    marginBottom: 24,
    gap: 8,
  },
  yearButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    backgroundColor: "#ffffff",
  },
  yearButtonActive: {
    backgroundColor: "#37352f",
    borderColor: "#37352f",
  },
  yearButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "500",
  },
  yearButtonTextActive: {
    color: "#ffffff",
    fontWeight: "600",
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
  cardGroup: {
    fontSize: 12,
    color: "#787774",
    marginBottom: 4,
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
});