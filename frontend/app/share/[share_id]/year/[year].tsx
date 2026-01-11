// app/share/[share_id]/year/[year].tsx - 共有ページ用の年別ページ

import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { View, StyleSheet, Text } from "react-native";
import type { Schedule } from "../../../HomeScreen";
import { getApiUrl } from "../../../../utils/api";
import { PageHeader } from "../../../../components/PageHeader";
import { YearPageContent } from "../../../../components/YearPageContent";

export default function SharedYearScreen() {
  const { share_id, year } = useLocalSearchParams<{ share_id: string; year: string }>();
  const router = useRouter();

  if (!share_id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Share ID not found</Text>
      </View>
    );
  }

  // 利用可能な年を取得する関数
  const fetchAvailableYears = async (): Promise<number[]> => {
    try {
      const url = getApiUrl(`/share/${share_id}`);
      const res = await fetch(url);
      if (!res.ok) return [];

      const data: Schedule[] = await res.json();
      
      // データから存在する年を抽出
      const years = new Set<number>();
      data.forEach((schedule) => {
        if (schedule.date) {
          const year = parseInt(schedule.date.substring(0, 4), 10);
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
      // 年を降順でソート（新しい年から）
      return Array.from(years).sort((a, b) => b - a);
    } catch (e: any) {
      console.error("ERROR FETCHING AVAILABLE YEARS:", e);
      return [];
    }
  };

  // スケジュールを取得する関数
  const fetchSchedules = async (year: string): Promise<Schedule[]> => {
    const url = getApiUrl(`/share/${share_id}`);
    const res = await fetch(url);

    if (!res.ok) throw new Error(`status: ${res.status}`);

    const data: Schedule[] = await res.json();
    
    // 年でフィルタリング
    const yearNum = parseInt(year, 10);
    return data.filter((schedule) => {
      if (schedule.date) {
        const scheduleYear = parseInt(schedule.date.substring(0, 4), 10);
        return !isNaN(scheduleYear) && scheduleYear === yearNum;
      } else if (schedule.datetime) {
        const date = new Date(schedule.datetime);
        const scheduleYear = date.getUTCFullYear();
        return !isNaN(scheduleYear) && scheduleYear === yearNum;
      }
      return false;
    });
  };

  const handleOpenDetail = (id: number) => {
    if (!share_id) return;
    router.push(`/share/${share_id}/schedules/${id}`);
  };

  return (
    <View style={styles.container}>
      <PageHeader showBackButton={true} homePath={`/share/${share_id}`} />
      
      <YearPageContent
        isShared={true}
        shareId={share_id}
        fetchSchedules={fetchSchedules}
        fetchAvailableYears={fetchAvailableYears}
        showStayTab={false}
        homePath={`/share/${share_id}`}
        onSchedulePress={handleOpenDetail}
        initialYear={year ?? null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  errorText: {
    color: "#d93025",
    marginVertical: 8,
    fontSize: 14,
  },
});
