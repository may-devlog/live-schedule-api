// app/year/[year].tsx

import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import React from "react";
import type { Schedule } from "../HomeScreen";
import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { YearPageContent } from "../../components/YearPageContent";

export default function YearScreen() {
  const params = useLocalSearchParams<{ year: string }>();
  const router = useRouter();

  // 利用可能な年を取得する関数
  const fetchAvailableYears = async (): Promise<number[]> => {
    try {
      const url = getApiUrl("/public/schedules");
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
    const url = getApiUrl(`/schedules?year=${year}`);
    const res = await authenticatedFetch(url);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[YearScreen] Failed to fetch schedules:", res.status, errorText);
      if (res.status === 401) {
        // 認証エラーの場合はログアウト
        const { logout } = await import("../../contexts/AuthContext");
        logout();
        throw new Error("認証に失敗しました。再度ログインしてください。");
      }
      throw new Error(`status: ${res.status} - ${errorText}`);
    }

    const data: Schedule[] = await res.json();
    console.log("YEAR SCHEDULES FROM API:", year, data);
    return data;
  };

  // 宿泊情報を取得する関数
  const fetchStays = async (year: string): Promise<any[]> => {
    const staysUrl = getApiUrl("/stay/all");
    const staysRes = await authenticatedFetch(staysUrl);
    if (!staysRes.ok) {
      return [];
    }
    
    const allStays: any[] = await staysRes.json();
    // 年でフィルタリング
    const yearNum = parseInt(year, 10);
    return allStays.filter((stay) => {
      if (stay.check_in) {
        const checkInYear = parseInt(stay.check_in.substring(0, 4), 10);
        return !isNaN(checkInYear) && checkInYear === yearNum;
      }
      return false;
    });
  };

  const handleOpenDetail = (id: number) => {
    router.push(`/live/${id}`);
  };

  const handleOpenStay = (id: number) => {
    router.push(`/stay/${id}`);
  };

  return (
    <>
      {/* ナビゲーションバーのタイトルを非表示 */}
      <Stack.Screen options={{ headerShown: false }} />
      
      <YearPageContent
        isShared={false}
        fetchSchedules={fetchSchedules}
        fetchStays={fetchStays}
        fetchAvailableYears={fetchAvailableYears}
        showStayTab={true}
        homePath="/"
        onSchedulePress={handleOpenDetail}
        onStayPress={handleOpenStay}
        initialYear={params.year ?? null}
      />
    </>
  );
}

