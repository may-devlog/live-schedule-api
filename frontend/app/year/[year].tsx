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
import { HomeButton } from "../../components/HomeButton";
import { NotionTag } from "../../components/notion-tag";
import { getOptionColor } from "../../utils/get-option-color";

export default function YearScreen() {
  const params = useLocalSearchParams<{ year: string }>();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(
    params.year ?? null
  );

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());

const fetchAvailableYears = async () => {
  try {
    // 公開スケジュールAPIから全データを取得して年を抽出
    const url = getApiUrl("/public/schedules");
    const res = await fetch(url);
    if (!res.ok) return;

    const data: Schedule[] = await res.json();
    
    // データから存在する年を抽出
    const years = new Set<number>();
    data.forEach((schedule) => {
      if (schedule.date) {
        // dateは"YYYY-MM-DD"形式
        const year = parseInt(schedule.date.substring(0, 4), 10);
        if (!isNaN(year)) {
          years.add(year);
        }
      } else if (schedule.datetime) {
        // datetimeから年を抽出
        const date = new Date(schedule.datetime);
        const year = date.getUTCFullYear();
        if (!isNaN(year)) {
          years.add(year);
        }
      }
    });
    // 年を降順でソート（新しい年から）
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    setAvailableYears(sortedYears);
  } catch (e: any) {
    console.error("ERROR FETCHING AVAILABLE YEARS:", e);
  }
};

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

  // 利用可能な年を取得
  useEffect(() => {
    fetchAvailableYears();
  }, []);

  // currentYear が変わるたびにその年を再取得
  useEffect(() => {
    if (!currentYear) return;
    fetchYear(currentYear);
  }, [currentYear]);

  // Areaの色情報を取得
  useEffect(() => {
    if (schedules.length === 0) return;
    
    const fetchAreaColors = async () => {
      const colorMap = new Map<number, string>();
      for (const schedule of schedules) {
        if (schedule.area) {
          const color = await getOptionColor(schedule.area, "AREAS");
          colorMap.set(schedule.id, color);
        }
      }
      setAreaColors(colorMap);
    };
    
    fetchAreaColors();
  }, [schedules]);

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
      {/* ナビゲーションバーのタイトルを非表示 */}
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <HomeButton />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Year {currentYear}</Text>

        {/* 年ボタン */}
        <View style={styles.yearSelector}>
        {availableYears.map((y) => (
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
                {item.group || "-"}
              </Text>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.cardSubContainer}>
                {item.area && (
                  <NotionTag
                    label={item.area}
                    color={areaColors.get(item.id) || undefined}
                  />
                )}
                <Text style={styles.cardSub}>{item.venue}</Text>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
      </View>
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
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  content: {
    padding: 24,
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  title: {
    paddingHorizontal: 24,
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
  cardSubContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  cardSub: {
    fontSize: 14,
    color: "#787774",
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