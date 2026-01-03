// app/traffic/[trafficId].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";

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

import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { NotionTag } from "../../components/notion-tag";
import { NotionProperty, NotionPropertyBlock } from "../../components/notion-property";
import { getOptionColor } from "../../utils/get-option-color";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import type { Schedule } from "../HomeScreen";

export default function TrafficDetailScreen() {
  const { trafficId } = useLocalSearchParams<{ trafficId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transportationColor, setTransportationColor] = useState<string | null>(null);

  const handleEdit = () => {
    router.push(`/traffic/${trafficId}/edit`);
  };

  const handleDuplicate = () => {
    // 複製時はscheduleIdをコピーせず、空にする（後で選択可能）
    if (!traffic) return;
    router.push(`/traffic/new?copyFrom=${trafficId}`);
  };

  useEffect(() => {
    if (!trafficId) return;

    const fetchTraffic = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`));
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
            // 公開APIを使用（認証不要）
            const scheduleRes = await fetch(getApiUrl(`/public/schedules/${data.schedule_id}`));
            if (scheduleRes.ok) {
              const scheduleData: Schedule = await scheduleRes.json();
              setSchedule(scheduleData);
              console.log("[TrafficDetail] Schedule loaded:", scheduleData.title);
            } else {
              console.error("[TrafficDetail] Failed to fetch schedule, status:", scheduleRes.status);
            }
          } catch (e) {
            console.error("[TrafficDetail] Failed to fetch schedule:", e);
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

    fetchTraffic();
  }, [trafficId]);

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
        <Text style={styles.title}>Traffic Detail</Text>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  if (!traffic) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Traffic Detail</Text>
        <Text style={styles.errorText}>Traffic not found</Text>
      </View>
    );
  }

  const title = traffic.return_flag
    ? `${traffic.from} ↔︎ ${traffic.to}`
    : `${traffic.from} ⇨ ${traffic.to}`;

  return (
    <View style={styles.container}>
      <PageHeader scheduleTitle={schedule?.title || null} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* タイトル */}
        <View style={styles.titleHeader}>
          <Text style={styles.mainTitle} numberOfLines={2}>
            {title}
          </Text>
          {isAuthenticated && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.duplicateButton}
                onPress={handleDuplicate}
              >
                <Text style={styles.duplicateButtonText}>複製</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEdit}
              >
                <Text style={styles.editButtonText}>編集</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* [Traffic Info] */}
        <NotionPropertyBlock title="Traffic Info">
          <NotionProperty
            label="Date"
            value={traffic.date}
          />
          <NotionProperty
            label="Order"
            value={traffic.order.toString()}
          />
          <NotionProperty label="Transportation">
            {traffic.transportation ? (
              <NotionTag label={traffic.transportation} color={transportationColor || undefined} />
            ) : (
              <Text style={styles.emptyValue}>-</Text>
            )}
          </NotionProperty>
          <NotionProperty
            label="From"
            value={traffic.from}
          />
          <NotionProperty
            label="To"
            value={traffic.to}
          />
          <NotionProperty
            label="Notes"
            value={
              traffic.notes && traffic.notes.trim().length > 0
                ? traffic.notes
                : undefined
            }
          />
          <NotionProperty
            label="Fare"
            value={formatCurrency(traffic.fare)}
          />
          <NotionProperty
            label="Miles"
            value={
              traffic.miles !== null && traffic.miles !== undefined
                ? traffic.miles.toString()
                : undefined
            }
          />
          <NotionProperty
            label="Return"
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
  actionButtons: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-start",
  },
  duplicateButton: {
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 3,
  },
  duplicateButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "600",
  },
  editButton: {
    backgroundColor: "#37352f",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 3,
  },
  editButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
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