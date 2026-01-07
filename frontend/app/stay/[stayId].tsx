// app/stay/[stayId].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl, Platform, Alert, useWindowDimensions } from "react-native";

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

import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../components/notion-property";
import { NotionTag } from "../../components/notion-tag";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import type { Schedule } from "../HomeScreen";
import { maskHotelName } from "../../utils/mask-hotel-name";
import { NotionRelation } from "../../components/notion-relation";
import type { SelectOption } from "../../types/select-option";

export default function StayDetailScreen() {
  const { stayId } = useLocalSearchParams<{ stayId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [stay, setStay] = useState<Stay | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [websiteOptions, setWebsiteOptions] = useState<SelectOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<SelectOption[]>([]);

  const handleEdit = () => {
    router.push(`/stay/${stayId}/edit`);
  };

  const handleDuplicate = () => {
    // 複製時はscheduleIdをコピーせず、空にする（後で選択可能）
    if (!stay) return;
    router.push(`/stay/new?copyFrom=${stayId}`);
  };

  const handleDelete = () => {
    const performDelete = async () => {
      try {
        console.log("[DELETE] Attempting to delete stay:", stayId);
        const res = await authenticatedFetch(getApiUrl(`/stay/${stayId}`), {
          method: "DELETE",
        });
        console.log("[DELETE] Response status:", res.status);
        console.log("[DELETE] Response ok:", res.ok);
        
        if (!res.ok) {
          let errorMessage = "削除に失敗しました";
          try {
            const text = await res.text();
            if (text) {
              try {
                const error = JSON.parse(text);
                errorMessage = error.error || errorMessage;
              } catch {
                // JSONパースに失敗した場合は、テキストをそのまま使用
                errorMessage = text || errorMessage;
              }
            }
          } catch {
            // レスポンスの読み取りに失敗した場合は、ステータスコードを使用
            errorMessage = `削除に失敗しました (${res.status})`;
          }
          if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
            window.alert(`エラー: ${errorMessage}`);
          } else {
            Alert.alert("エラー", errorMessage);
          }
          return;
        }
        
        // 削除成功メッセージを表示
        const successMessage = "宿泊情報を削除しました";
        if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
          window.alert(successMessage);
          // 少し待ってから遷移（アラートが閉じるのを待つ）
          setTimeout(() => {
            router.replace("/");
          }, 100);
        } else {
          Alert.alert("削除完了", successMessage, [
            {
              text: "OK",
              onPress: () => {
                router.replace("/");
              },
            },
          ]);
        }
      } catch (error: any) {
        const errorMessage = error.message || "削除に失敗しました";
        if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
          window.alert(`エラー: ${errorMessage}`);
        } else {
          Alert.alert("エラー", errorMessage);
        }
      }
    };

    if (Platform.OS === "web" && typeof window !== "undefined" && window.confirm) {
      if (window.confirm("この宿泊情報を削除しますか？この操作は取り消せません。")) {
        performDelete();
      }
    } else {
      Alert.alert(
        "削除確認",
        "この宿泊情報を削除しますか？この操作は取り消せません。",
        [
          {
            text: "キャンセル",
            style: "cancel",
          },
          {
            text: "削除",
            style: "destructive",
            onPress: performDelete,
          },
        ]
      );
    }
  };

  const fetchStay = async () => {
    if (!stayId) return;
    
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
      console.log("[StayDetail] Fetched stay data:", data);
      console.log("[StayDetail] Website value:", data.website);
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
      
      // Website選択肢を取得
      try {
        const websiteRes = await authenticatedFetch(getApiUrl("/stay-select-options/website"));
        if (websiteRes.ok) {
          const websiteData: SelectOption[] = await websiteRes.json();
          setWebsiteOptions(websiteData);
        }
      } catch (e) {
        console.error("[StayDetail] Failed to fetch website options:", e);
      }
      
      // ステータス選択肢を取得（動的インポートで循環依存を回避）
      try {
        const AsyncStorage = require("@react-native-async-storage/async-storage").default;
        const stored = await AsyncStorage.getItem("@select_options:stay_statuses");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (typeof parsed[0] === "string") {
              setStatusOptions(parsed.map((str: string) => ({ label: str })));
            } else {
              setStatusOptions(parsed as SelectOption[]);
            }
          } else {
            setStatusOptions(["Canceled", "Keep", "Done"].map((str) => ({ label: str })));
          }
        } else {
          setStatusOptions(["Canceled", "Keep", "Done"].map((str) => ({ label: str })));
        }
      } catch (e) {
        console.error("[StayDetail] Failed to load status options:", e);
        setStatusOptions(["Canceled", "Keep", "Done"].map((str) => ({ label: str })));
      }
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStay();
  }, [stayId]);

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
        <Text style={styles.title}>Stay Detail</Text>
        <Text style={styles.errorText}>エラー: {error}</Text>
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
      <PageHeader scheduleTitle={schedule?.title || null} homePath="/" />
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
            {maskHotelName(stay.hotel_name, isAuthenticated)}
          </Text>
          {isAuthenticated && (
            <View style={[styles.actionButtons, { flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-end" : "flex-start" }]}>
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
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
              >
                <Text style={styles.deleteButtonText}>削除</Text>
              </TouchableOpacity>
            </View>
          )}
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
          <NotionProperty label="ステータス">
            {stay.status ? (() => {
              // ステータス色を取得（Canceled: グレー、Keep: 青、Done: 緑）
              const STATUS_COLORS: Record<string, string> = {
                Canceled: "#E5E7EB", // gray
                Keep: "#BFDBFE",     // blue
                Done: "#D1FAE5",     // green
              };
              const statusColor = STATUS_COLORS[stay.status] || "#E5E7EB";
              return (
                <NotionTag
                  label={stay.status}
                  color={statusColor}
                />
              );
            })() : undefined}
          </NotionProperty>
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
                        website: stay.website,
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
    gap: 8,
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
  deleteButton: {
    backgroundColor: "#d93025",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 3,
  },
  deleteButtonText: {
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