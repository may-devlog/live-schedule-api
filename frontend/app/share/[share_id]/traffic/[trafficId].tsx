// app/share/[share_id]/traffic/[trafficId].tsx - 共有ページ用の交通詳細画面（閲覧専用）
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, Platform } from "react-native";
import { getApiUrl } from "../../../../utils/api";
import { NotionTag } from "../../../../components/notion-tag";
import { NotionProperty, NotionPropertyBlock } from "../../../../components/notion-property";
import { getOptionColor } from "../../../../utils/get-option-color";
import { PageHeader } from "../../../../components/PageHeader";
import type { Schedule } from "../../../HomeScreen";

type Traffic = {
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

export default function SharedTrafficDetailScreen() {
  const { share_id, trafficId } = useLocalSearchParams<{ share_id: string; trafficId: string }>();
  const router = useRouter();
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [transportationColor, setTransportationColor] = useState<string | null>(null);

  const fetchTraffic = async () => {
    if (!trafficId || !share_id) return;
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(getApiUrl(`/share/${share_id}/traffic/${trafficId}`));
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Traffic not found");
          }
          throw new Error(`status: ${res.status}`);
        }
        const data: Traffic = await res.json();
        setTraffic(data);
        
        // スケジュール情報を取得
        if (data.schedule_id) {
          try {
            const scheduleRes = await fetch(getApiUrl(`/share/${share_id}/schedules/${data.schedule_id}`));
            if (scheduleRes.ok) {
              const scheduleData: Schedule = await scheduleRes.json();
              setSchedule(scheduleData);
            }
          } catch (e) {
            console.error("[SharedTrafficDetail] Failed to fetch schedule:", e);
          }
        }
        
        // Transportationの色情報を取得
        if (data.transportation) {
          const color = await getOptionColor(data.transportation, "TRANSPORTATIONS");
          setTransportationColor(color);
        }
      } catch (e: any) {
        setError(e.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    fetchTraffic();
  }, [trafficId, share_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchTraffic();
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
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  if (!traffic) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Traffic not found</Text>
      </View>
    );
  }

  const title = traffic.return_flag
    ? `${traffic.from} ↔︎ ${traffic.to}`
    : `${traffic.from} ⇨ ${traffic.to}`;

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
          <Text style={styles.mainTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>

        {/* [Traffic Info] */}
        <NotionPropertyBlock title="Traffic Info">
          <NotionProperty
            label="利用日"
            value={traffic.date}
          />
          <NotionProperty
            label="利用順"
            value={traffic.order.toString()}
          />
          <NotionProperty label="交通手段">
            {traffic.transportation ? (
              <NotionTag label={traffic.transportation} color={transportationColor || undefined} />
            ) : (
              <Text style={styles.emptyValue}>-</Text>
            )}
          </NotionProperty>
          <NotionProperty
            label="出発地"
            value={traffic.from}
          />
          <NotionProperty
            label="到着地"
            value={traffic.to}
          />
          <NotionProperty
            label="備考"
            value={
              traffic.notes && traffic.notes.trim().length > 0
                ? traffic.notes
                : undefined
            }
          />
          <NotionProperty
            label="運賃"
            value={formatCurrency(traffic.fare)}
          />
          <NotionProperty
            label="消費マイル"
            value={
              traffic.miles !== null && traffic.miles !== undefined
                ? traffic.miles.toString()
                : undefined
            }
          />
          <NotionProperty
            label="往復フラグ"
            value={traffic.return_flag ? "Yes" : "No"}
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
  emptyValue: {
    fontSize: 14,
    color: "#9b9a97",
  },
  errorText: {
    color: "#d93025",
    marginVertical: 8,
    fontSize: 14,
  },
});

