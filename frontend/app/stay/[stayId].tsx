// app/stay/[stayId].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";

type Stay = {
  id: number;
  schedule_id: number;
  check_in: string;
  check_out: string;
  hotel_name: string;
  fee: number;
  breakfast_flag: boolean;
  deadline?: string | null;
  penalty?: number | null;
  status: string;
};

import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../components/notion-property";
import { NotionTag } from "../../components/notion-tag";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import type { Schedule } from "../HomeScreen";
import { maskHotelName } from "../../utils/mask-hotel-name";
import { NotionRelation } from "../../components/notion-relation";

export default function StayDetailScreen() {
  const { stayId } = useLocalSearchParams<{ stayId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [stay, setStay] = useState<Stay | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

  const handleEdit = () => {
    router.push(`/stay/${stayId}/edit`);
  };

  const handleDuplicate = () => {
    // 複製時はscheduleIdをコピーせず、空にする（後で選択可能）
    if (!stay) return;
    router.push(`/stay/new?copyFrom=${stayId}`);
  };

  useEffect(() => {
    if (!stayId) return;

    const fetchStay = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await authenticatedFetch(getApiUrl(`/stay/${stayId}`));
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Stay not found");
          }
          throw new Error(`status: ${res.status}`);
        }
        const data: Stay = await res.json();
        setStay(data);
        setSelectedScheduleId(data.schedule_id || null);
        
        // 全スケジュール一覧を取得（スケジュール選択用）
        try {
          const schedulesRes = await authenticatedFetch(getApiUrl("/schedules"));
          if (schedulesRes.ok) {
            const schedulesData: Schedule[] = await schedulesRes.json();
            setAllSchedules(schedulesData);
          }
        } catch (e) {
          console.error("[StayDetail] Failed to fetch schedules:", e);
        }
        
        // スケジュール情報を取得
        if (data.schedule_id) {
          try {
            // 公開APIを使用（認証不要）
            const scheduleRes = await fetch(getApiUrl(`/public/schedules/${data.schedule_id}`));
            if (scheduleRes.ok) {
              const scheduleData: Schedule = await scheduleRes.json();
              setSchedule(scheduleData);
              console.log("[StayDetail] Schedule loaded:", scheduleData.title);
            } else {
              console.error("[StayDetail] Failed to fetch schedule, status:", scheduleRes.status);
            }
          } catch (e) {
            console.error("[StayDetail] Failed to fetch schedule:", e);
          }
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
        <Text style={styles.title}>Stay Detail</Text>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  if (!stay) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Stay Detail</Text>
        <Text style={styles.errorText}>Stay not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader scheduleTitle={schedule?.title || null} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* タイトル */}
        <View style={styles.titleHeader}>
          <Text style={styles.mainTitle} numberOfLines={2}>
            {maskHotelName(stay.hotel_name, isAuthenticated)}
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

        {/* [Stay Info] */}
        <NotionPropertyBlock title="Stay Info">
          <NotionProperty
            label="Check In"
            value={stay.check_in}
          />
          <NotionProperty
            label="Check Out"
            value={stay.check_out}
          />
          <NotionProperty
            label="Fee"
            value={formatCurrency(stay.fee)}
          />
          <NotionProperty
            label="Breakfast"
            value={stay.breakfast_flag ? "Yes" : "No"}
          />
          <NotionProperty
            label="Deadline"
            value={
              stay.deadline && stay.deadline.trim().length > 0
                ? stay.deadline
                : undefined
            }
          />
          <NotionProperty
            label="Penalty"
            value={
              stay.penalty !== null && stay.penalty !== undefined
                ? `${stay.penalty}%`
                : undefined
            }
          />
          <NotionProperty
            label="Status"
            value={stay.status}
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
                if (stay) {
                  try {
                    const updateRes = await authenticatedFetch(getApiUrl(`/stay/${stayId}`), {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        schedule_id: newScheduleId || 0,
                        check_in: stay.check_in,
                        check_out: stay.check_out,
                        hotel_name: stay.hotel_name,
                        fee: stay.fee,
                        breakfast_flag: stay.breakfast_flag,
                        deadline: stay.deadline,
                        penalty: stay.penalty,
                        status: stay.status,
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
                          console.error("[StayDetail] Failed to fetch schedule:", e);
                          setSchedule(null);
                        }
                      } else {
                        setSchedule(null);
                      }
                    }
                  } catch (e) {
                    console.error("[StayDetail] Failed to update schedule link:", e);
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