// app/traffic/[trafficId].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl, Platform } from "react-native";

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
import { NotionRelation } from "../../components/notion-relation";

export default function TrafficDetailScreen() {
  const { trafficId } = useLocalSearchParams<{ trafficId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [transportationColor, setTransportationColor] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

  const handleEdit = () => {
    router.push(`/traffic/${trafficId}/edit`);
  };

  const handleDuplicate = () => {
    // 複製時はscheduleIdをコピーせず、空にする（後で選択可能）
    if (!traffic) return;
    router.push(`/traffic/new?copyFrom=${trafficId}`);
  };

  const fetchTraffic = async () => {
    if (!trafficId) return;
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
        setSelectedScheduleId(data.schedule_id || null);
        
        // 全スケジュール一覧を取得（スケジュール選択用）
        try {
          const schedulesRes = await authenticatedFetch(getApiUrl("/schedules"));
          if (schedulesRes.ok) {
            const schedulesData: Schedule[] = await schedulesRes.json();
            setAllSchedules(schedulesData);
          }
        } catch (e) {
          console.error("[TrafficDetail] Failed to fetch schedules:", e);
        }
        
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

  useEffect(() => {
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

        {/* [Schedule Link] */}
        {isAuthenticated && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Schedule</Text>
            </View>
            <NotionRelation
              label=""
              value={selectedScheduleId ? [selectedScheduleId] : []}
              onValueChange={async (ids) => {
                const newScheduleId = ids.length > 0 ? ids[0] : null;
                setSelectedScheduleId(newScheduleId);
                
                // バックエンドに更新
                if (traffic) {
                  try {
                    const updateRes = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`), {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        schedule_id: newScheduleId || 0,
                        date: traffic.date,
                        order: traffic.order,
                        transportation: traffic.transportation,
                        from: traffic.from,
                        to: traffic.to,
                        notes: traffic.notes,
                        fare: traffic.fare,
                        miles: traffic.miles,
                        return_flag: traffic.return_flag,
                      }),
                    });
                    
                    if (updateRes.ok) {
                      // スケジュール情報を更新
                      if (newScheduleId) {
                        try {
                          const scheduleRes = await fetch(getApiUrl(`/public/schedules/${newScheduleId}`));
                          if (scheduleRes.ok) {
                            const scheduleData: Schedule = await scheduleRes.json();
                            setSchedule(scheduleData);
                          } else {
                            setSchedule(null);
                          }
                        } catch (e) {
                          console.error("[TrafficDetail] Failed to fetch schedule:", e);
                          setSchedule(null);
                        }
                      } else {
                        setSchedule(null);
                      }
                    }
                  } catch (e) {
                    console.error("[TrafficDetail] Failed to update schedule link:", e);
                  }
                }
              }}
              placeholder="↗ スケジュールにリンク"
              hideSelectedCards={false}
            />
          </View>
        )}
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
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});