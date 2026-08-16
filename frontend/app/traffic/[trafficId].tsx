// app/traffic/[trafficId].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl, Platform, Alert, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
import { AppHeader, PublicFooter } from "../../components/GenBGTBrand";
import { AppTabBar } from "../../components/AppTabBar";
import type { Schedule } from "../HomeScreen";
import { NotionRelation } from "../../components/notion-relation";
import { BooleanSelectDisplay } from "../../components/boolean-select-display";

export default function TrafficDetailScreen() {
  const { trafficId } = useLocalSearchParams<{ trafficId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
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

  const handleDelete = () => {
    const performDelete = async () => {
      try {
        console.log("[DELETE] Attempting to delete traffic:", trafficId);
        const res = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`), {
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
        const successMessage = "交通情報を削除しました";
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
      if (window.confirm("この交通情報を削除しますか？この操作は取り消せません。")) {
        performDelete();
      }
    } else {
      Alert.alert(
        "削除確認",
        "この交通情報を削除しますか？この操作は取り消せません。",
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
        
        // 全スケジュール一覧を取得（スケジュール選択用、親スケジュール情報の解決にも使う）
        let schedulesData: Schedule[] = [];
        try {
          const schedulesRes = await authenticatedFetch(getApiUrl("/schedules"));
          if (schedulesRes.ok) {
            schedulesData = await schedulesRes.json();
            setAllSchedules(schedulesData);
          }
        } catch (e) {
          console.error("[TrafficDetail] Failed to fetch schedules:", e);
        }

        // スケジュール情報を取得
        // /public/schedules/:id はpublic_id（推測困難なランダムID）を要求するため、
        // 認証済みユーザーの内部idであるtraffic.schedule_idでは解決できない。
        // 取得済みの一覧（内部idベース）から該当スケジュールを探す。
        if (data.schedule_id) {
          const matched = schedulesData.find((s) => s.id === data.schedule_id);
          if (matched) {
            setSchedule(matched);
            console.log("[TrafficDetail] Schedule loaded:", matched.title);
          } else {
            console.error("[TrafficDetail] Schedule not found in list for id:", data.schedule_id);
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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchTraffic();
    } finally {
      setRefreshing(false);
    }
  };

  const renderStatePage = (content: React.ReactNode) => (
    <View style={styles.container}>
      <AppHeader active="schedule" />
      <ScrollView contentContainerStyle={styles.stateScroll}>
        <View style={styles.stateContent}>{content}</View>
        <PublicFooter />
      </ScrollView>
      <AppTabBar active="schedule" homePath="/" schedulePath="/" archivePath={`/year/${new Date().getFullYear()}`} />
    </View>
  );

  if (loading) {
    return renderStatePage(<ActivityIndicator color="#7C3AED" size="large" />);
  }

  if (error) {
    return renderStatePage(<>
        <Text style={styles.title}>Traffic Detail</Text>
        <Text style={styles.errorText}>エラー: {error}</Text>
      </>);
  }

  if (!traffic) {
    return renderStatePage(<>
        <Text style={styles.title}>Traffic Detail</Text>
        <Text style={styles.errorText}>Traffic not found</Text>
      </>);
  }

  const title = traffic.return_flag
    ? `${traffic.from} ↔︎ ${traffic.to}`
    : `${traffic.from} ⇨ ${traffic.to}`;

  return (
    <View style={styles.container}>
      <AppHeader active="schedule" />
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
        <View style={styles.detailContent}>
        {/* タイトル */}
        <View style={styles.titleHeader}>
          <Text style={styles.mainTitle}>
            {title}
          </Text>
          {isAuthenticated && (
            <View style={[styles.actionButtons, { flexDirection: isMobile ? "column" : "row" }]}>
              <TouchableOpacity
                style={styles.duplicateButton}
                onPress={handleDuplicate}
              >
                <Ionicons name="copy-outline" size={17} color="#5B21B6" />
                <Text style={styles.duplicateButtonText}>複製</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEdit}
              >
                <Ionicons name="create-outline" size={17} color="#FFFFFF" />
                <Text style={styles.editButtonText}>編集</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={17} color="#DC2626" />
                <Text style={styles.deleteButtonText}>削除</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* [Traffic Info] */}
        <NotionPropertyBlock title="交通情報" collapsibleOnMobile={false}>
          <NotionProperty
            label="利用日"
            value={formatDateValue(traffic.date)}
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
          <NotionProperty label="往復フラグ">
            <BooleanSelectDisplay value={traffic.return_flag} />
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
              confirmChangeMessage="紐づくスケジュールを変更しますか？この交通情報が別のスケジュールに移動します。"
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
                      // スケジュール情報を更新（内部idベースの一覧から解決）
                      if (newScheduleId) {
                        const matched = allSchedules.find((s) => s.id === newScheduleId);
                        setSchedule(matched ?? null);
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
              changeButtonLabel="↻ 親スケジュールを変更"
              hideSelectedCards={false}
            />
          </View>
        )}
        </View>
        <PublicFooter />
      </ScrollView>
      <AppTabBar active="schedule" homePath="/" schedulePath="/" archivePath={`/year/${new Date().getFullYear()}`} />
    </View>
  );
}

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatDateValue(value: string): string {
  return value.replace(/^(\d{4})-(\d{2})-(\d{2})/, "$1.$2.$3");
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  stateScroll: { flexGrow: 1 },
  stateContent: { minHeight: 420, padding: 24, alignItems: "center", justifyContent: "center" },
  scrollContent: {
    flexGrow: 1,
  },
  detailContent: {
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
    gap: 8,
  },
  duplicateButton: {
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#C4B5FD",
    paddingHorizontal: 16,
    minHeight: 42,
    borderRadius: 9,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  duplicateButtonText: {
    color: "#5B21B6",
    fontSize: 14,
    fontWeight: "600",
  },
  editButton: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 16,
    minHeight: 42,
    borderRadius: 9,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  editButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 16,
    minHeight: 42,
    borderRadius: 9,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  deleteButtonText: {
    color: "#DC2626",
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
