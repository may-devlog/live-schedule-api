// app/share/[share_id]/stay/[stayId].tsx - 共有ページ用の宿泊詳細画面（閲覧専用）
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, Platform } from "react-native";
import { getApiUrl } from "../../../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../../../components/notion-property";
import { NotionTag } from "../../../../components/notion-tag";
import { PageHeader } from "../../../../components/PageHeader";
import type { Schedule } from "../../../HomeScreen";
import { maskHotelName } from "../../../../utils/mask-hotel-name";
import type { SelectOption } from "../../../../types/select-option";
import { loadStaySelectOptions } from "../../../../utils/select-options-storage";

type Stay = {
  id: number;
  schedule_id: number;
  check_in: string;
  check_out: string;
  hotel_name: string;
  website?: string | null;
  fee: number;
  breakfast_flag: boolean;
  deadline?: string | null;
  penalty?: number | null;
  status: string;
};

export default function SharedStayDetailScreen() {
  const { share_id, stayId } = useLocalSearchParams<{ share_id: string; stayId: string }>();
  const router = useRouter();
  const [stay, setStay] = useState<Stay | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [websiteOptions, setWebsiteOptions] = useState<SelectOption[]>([]);

  const fetchStay = async () => {
    if (!stayId || !share_id) return;
    
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(getApiUrl(`/share/${share_id}/stay/${stayId}`));
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Stay not found");
        }
        throw new Error(`status: ${res.status}`);
      }
      const data: Stay = await res.json();
      setStay(data);
      
      // スケジュール情報を取得
      if (data.schedule_id) {
        try {
          const scheduleRes = await fetch(getApiUrl(`/share/${share_id}/schedules/${data.schedule_id}`));
          if (scheduleRes.ok) {
            const scheduleData: Schedule = await scheduleRes.json();
            setSchedule(scheduleData);
          }
        } catch (e) {
          console.error("[SharedStayDetail] Failed to fetch schedule:", e);
        }
      }
      
      // Website選択肢を取得（共有用エンドポイントを使用）
      try {
        const websiteData = await loadStaySelectOptions("WEBSITE", share_id);
        console.log("[SharedStayDetail] Website options loaded:", websiteData);
        console.log("[SharedStayDetail] Stay website value:", data.website);
        setWebsiteOptions(websiteData);
      } catch (e) {
        console.error("[SharedStayDetail] Failed to load website options:", e);
      }
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStay();
  }, [stayId, share_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchStay();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#333333" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>エラー: {error}</Text>
      </View>
    );
  }

  if (!stay) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Stay not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader scheduleTitle={schedule?.title || null} showBackButton={true} homePath={`/share/${share_id}`} />
      <ScrollView 
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
        scrollEventThrottle={16}
      >
        {/* タイトル */}
        <View style={styles.titleHeader}>
          <Text style={styles.mainTitle}>
            {maskHotelName(stay.hotel_name, false)}
          </Text>
        </View>

        {/* [Stay Info] */}
        <NotionPropertyBlock title="宿泊情報">
          <NotionProperty
            label="チェックイン"
            value={stay.check_in}
          />
          <NotionProperty
            label="チェックアウト"
            value={stay.check_out}
          />
          <NotionProperty label="予約サイト">
            {stay.website ? (() => {
              const websiteOption = websiteOptions.find(opt => opt.label === stay.website);
              console.log("[SharedStayDetail] Rendering Website:", {
                stayWebsite: stay.website,
                websiteOptions: websiteOptions,
                foundOption: websiteOption,
                color: websiteOption?.color || "#E5E7EB"
              });
              return (
                <NotionTag
                  label={stay.website}
                  color={websiteOption?.color || "#E5E7EB"}
                />
              );
            })() : undefined}
          </NotionProperty>
          <NotionProperty
            label="宿泊費"
            value={formatCurrency(stay.fee)}
          />
          <NotionProperty
            label="朝食"
            value={stay.breakfast_flag ? "あり" : "なし"}
          />
          <NotionProperty
            label="取消料発生日時"
            value={
              stay.deadline && stay.deadline.trim().length > 0
                ? stay.deadline
                : undefined
            }
          />
          <NotionProperty
            label="取消料"
            value={
              stay.penalty !== null && stay.penalty !== undefined
                ? `${stay.penalty}%`
                : undefined
            }
          />
          <NotionProperty
            label="ステータス"
            value={stay.status}
          />
        </NotionPropertyBlock>
      </ScrollView>
    </View>
  );
}

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 32,
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
    flexGrow: 1,
    minHeight: '100%',
  },
  titleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    gap: 16,
  },
  mainTitle: {
    fontSize: 40,
    fontWeight: "700",
    color: "#37352f",
    lineHeight: 48,
    flex: 1,
  },
  errorText: {
    color: "#d93025",
    marginVertical: 8,
    fontSize: 14,
  },
});

