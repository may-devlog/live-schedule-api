// app/public/stay/[stayId].tsx - 公開ページ用の宿泊詳細画面（閲覧専用）
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { getApiUrl } from "../../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../../components/notion-property";
import { NotionTag } from "../../../components/notion-tag";
import { PageHeader } from "../../../components/PageHeader";
import type { Schedule } from "../../HomeScreen";
import { maskHotelName } from "../../../utils/mask-hotel-name";
import type { SelectOption } from "../../../types/select-option";

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

export default function PublicStayDetailScreen() {
  const { stayId } = useLocalSearchParams<{ stayId: string }>();
  const router = useRouter();
  const [stay, setStay] = useState<Stay | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [websiteOptions, setWebsiteOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    if (!stayId) return;

    const fetchStay = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(getApiUrl(`/public/stay/${stayId}`));
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
            const scheduleRes = await fetch(getApiUrl(`/public/schedules/${data.schedule_id}`));
            if (scheduleRes.ok) {
              const scheduleData: Schedule = await scheduleRes.json();
              setSchedule(scheduleData);
            }
          } catch (e) {
            console.error("[PublicStayDetail] Failed to fetch schedule:", e);
          }
        }
        
        // Website選択肢を取得（認証不要のエンドポイントを使用）
        try {
          const websiteRes = await fetch(getApiUrl("/stay-select-options/website"));
          if (websiteRes.ok) {
            const websiteData: SelectOption[] = await websiteRes.json();
            setWebsiteOptions(websiteData);
          }
        } catch (e) {
          console.error("[PublicStayDetail] Failed to fetch website options:", e);
        }
      } catch (e: any) {
        setError(e.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchStay();
  }, [stayId]);

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
      <PageHeader scheduleTitle={schedule?.title || null} showBackButton={true} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* タイトル */}
        <View style={styles.titleHeader}>
          <Text style={styles.mainTitle} numberOfLines={2}>
            {maskHotelName(stay.hotel_name, false)}
          </Text>
        </View>

        {/* [Stay Info] */}
        <NotionPropertyBlock title="Stay Info">
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

