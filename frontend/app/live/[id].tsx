// app/live/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  RefreshControl,
} from "react-native";
import type { Schedule } from "../HomeScreen";
import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../components/notion-property";
import { NotionTag } from "../../components/notion-tag";
import { NotionRelation } from "../../components/notion-relation";
import { NotionTrafficRelation } from "../../components/notion-traffic-relation";
import { NotionStayRelation } from "../../components/notion-stay-relation";
import { getOptionColor } from "../../utils/get-option-color";
// アイコンは絵文字を使用（フォントに依存しない）
import { loadSelectOptions } from "../../utils/select-options-storage";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { maskHotelName } from "../../utils/mask-hotel-name";

type TrafficSummary = {
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

type StaySummary = {
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

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [trafficSummaries, setTrafficSummaries] = useState<TrafficSummary[]>([]);
  const [staySummaries, setStaySummaries] = useState<StaySummary[]>([]);
  const [selectedTrafficIds, setSelectedTrafficIds] = useState<number[]>([]);
  const [selectedStayIds, setSelectedStayIds] = useState<number[]>([]);
  // Traffic/Stayの元のschedule_idを保存（選択解除時に元に戻すため）
  const [trafficOriginalScheduleIds, setTrafficOriginalScheduleIds] = useState<Map<number, number>>(new Map());
  const [stayOriginalScheduleIds, setStayOriginalScheduleIds] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  
  // 選択肢の色情報
  const [categoryColor, setCategoryColor] = useState<string | null>(null);
  const [areaColor, setAreaColor] = useState<string | null>(null);
  const [targetColor, setTargetColor] = useState<string | null>(null);
  const [sellerColor, setSellerColor] = useState<string | null>(null);
  const [statusColor, setStatusColor] = useState<string | null>(null);
  
  // フィルタリング後のTargetとLineup
  const [filteredTarget, setFilteredTarget] = useState<string | null>(null);
  const [filteredLineup, setFilteredLineup] = useState<string | null>(null);
  const [filteredLineupOptions, setFilteredLineupOptions] = useState<Array<{ label: string; color: string }>>([]);
  
  // Related SchedulesのArea色情報
  const [relatedAreaColors, setRelatedAreaColors] = useState<Map<number, string>>(new Map());
  
  // TrafficのTransportation色情報
  const [transportationColors, setTransportationColors] = useState<Map<number, string>>(new Map());

  const fetchDetail = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      setError(null);

      // 全 Schedule 取得
      const res = await authenticatedFetch(getApiUrl("/schedules"));
      if (!res.ok) throw new Error(`status: ${res.status}`);
      const data: Schedule[] = await res.json();
      setAllSchedules(data);

      const found = data.find((s) => s.id.toString() === id);
      if (!found) {
        throw new Error("Schedule not found");
      }
      
      // TargetとLineupの選択肢を読み込んでフィルタリング
      // データベースから選択肢を読み込む（認証されていない場合でも試行）
      let targets: Array<{ label: string; color: string }> = [];
      try {
        const res = await authenticatedFetch(getApiUrl("/select-options/targets"));
        if (res.ok) {
          const options: Array<{ label: string; color: string }> = await res.json();
          targets = options;
        }
      } catch (error) {
        console.log("[LiveDetail] Failed to load select options from database, trying local storage:", error);
        // データベースから読み込めない場合は、ローカルストレージから読み込む
        const localTargets = await loadSelectOptions("TARGETS");
        targets = localTargets.map(opt => ({ label: opt.label, color: opt.color || "#E5E7EB" }));
      }
      
      const targetOptionLabels = targets.map(opt => opt.label);
      console.log("Target options:", targetOptionLabels);
      console.log("Found target:", found.target);
      
      // Target: データベースに保存されている値があれば表示（選択肢に存在しない場合でも表示）
      let validTarget: string | null = null;
      let targetColor: string = "#E5E7EB"; // デフォルト色
      if (found.target) {
        // 選択肢に存在する場合は色情報を取得
        const targetOption = targets.find(opt => opt.label === found.target);
        if (targetOption) {
          targetColor = targetOption.color || "#E5E7EB";
        }
        validTarget = found.target;
      }
      console.log("Valid target:", validTarget);
      setFilteredTarget(validTarget);
      setTargetColor(targetColor);
      
      // Lineup: データベースに保存されている値があれば表示（選択肢に存在しない場合でも表示）
      const lineupOptionLabels = targets.map(opt => opt.label); // LineupもTargetと同じ選択肢を使用
      let validLineup: string | null = null;
      let validLineupOptions: Array<{ label: string; color: string }> = [];
      if (found.lineup) {
        const lineupValues = found.lineup.split(",").map(v => v.trim()).filter(v => v);
        console.log("Lineup values:", lineupValues);
        console.log("Lineup options:", lineupOptionLabels);
        
        // データベースに保存されている値すべてを表示（選択肢に存在しない場合でも表示）
        validLineupOptions = lineupValues.map((label) => {
          // 選択肢に存在する場合は色情報を取得
          const option = targets.find(opt => opt.label === label);
          return {
            label,
            color: option?.color || "#E5E7EB"
          };
        });
        console.log("Valid lineup values:", validLineupOptions);
        if (validLineupOptions.length > 0) {
          validLineup = validLineupOptions.map(opt => opt.label).join(", ");
        }
      }
      setFilteredLineup(validLineup);
      setFilteredLineupOptions(validLineupOptions);
      
      setSchedule(found);

      await fetchTrafficAndStay(found.id);
      
      // 選択肢の色情報を取得
      if (validTarget) {
        const color = await getOptionColor(validTarget, "TARGETS");
        setTargetColor(color);
      }
      if (found.category) {
        const color = await getOptionColor(found.category, "CATEGORIES");
        setCategoryColor(color);
      }
      if (found.area) {
        const color = await getOptionColor(found.area, "AREAS");
        setAreaColor(color);
      }
      if (found.seller) {
        const color = await getOptionColor(found.seller, "SELLERS");
        setSellerColor(color);
      }
      if (found.status) {
        const color = await getOptionColor(found.status, "STATUSES");
        setStatusColor(color);
      }
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchDetail();
    } finally {
      setRefreshing(false);
    }
  };

  // Related SchedulesのArea色情報を取得
  useEffect(() => {
    if (!schedule || !allSchedules.length) return;
    
    const relatedIds = schedule.related_schedule_ids ?? [];
    if (relatedIds.length === 0) return;
    
    const fetchRelatedAreaColors = async () => {
      const colorMap = new Map<number, string>();
      for (const rid of relatedIds) {
        const related = allSchedules.find((s) => s.id === rid);
        if (related && related.area) {
          const color = await getOptionColor(related.area, "AREAS");
          colorMap.set(rid, color);
        }
      }
      setRelatedAreaColors(colorMap);
    };
    
    fetchRelatedAreaColors();
  }, [schedule, allSchedules]);

  // TrafficのTransportation色情報を取得
  useEffect(() => {
    if (trafficSummaries.length === 0) return;
    
    const fetchTransportationColors = async () => {
      const colorMap = new Map<number, string>();
      for (const traffic of trafficSummaries) {
        if (traffic.transportation) {
          const color = await getOptionColor(traffic.transportation, "TRANSPORTATIONS");
          colorMap.set(traffic.id, color);
        }
      }
      setTransportationColors(colorMap);
    };
    
    fetchTransportationColors();
  }, [trafficSummaries]);

  const fetchTrafficAndStay = async (scheduleId: number) => {
    // Traffic 一覧（schedule_id ごと）
    try {
      const res = await authenticatedFetch(getApiUrl(`/traffic?schedule_id=${scheduleId}`));
      if (res.ok) {
        const list: TrafficSummary[] = await res.json();
        // DateとOrderでソート
        list.sort((a, b) => {
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          return a.order - b.order;
        });
        setTrafficSummaries(list);
        const ids = list.map((t) => t.id);
        setSelectedTrafficIds(ids);
        // 元のschedule_idを保存
        const originalIds = new Map<number, number>();
        list.forEach((t) => {
          originalIds.set(t.id, t.schedule_id);
        });
        setTrafficOriginalScheduleIds(originalIds);
      }
    } catch {
      // とりあえず無視
    }

    // Stay 一覧（schedule_id ごと）
    try {
      const res = await authenticatedFetch(getApiUrl(`/stay?schedule_id=${scheduleId}`));
      if (res.ok) {
        const list: StaySummary[] = await res.json();
        setStaySummaries(list);
        const ids = list.map((s) => s.id);
        setSelectedStayIds(ids);
        // 元のschedule_idを保存
        const originalIds = new Map<number, number>();
        list.forEach((s) => {
          originalIds.set(s.id, s.schedule_id);
        });
        setStayOriginalScheduleIds(originalIds);
      }
    } catch {
      // 無視
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

  if (!schedule) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Schedule not found</Text>
      </View>
    );
  }

  const trafficIds = trafficSummaries.map((t) => t.id);
  const stayIds = staySummaries.map((s) => s.id);
  const relatedIds = schedule.related_schedule_ids ?? [];

  const handleAddTraffic = () => {
    router.push(`/traffic/new?scheduleId=${schedule.id}`);
  };

  const handleAddStay = () => {
    router.push(`/stay/new?scheduleId=${schedule.id}`);
  };

  const handleLinkTraffics = async (trafficIds: number[]) => {
    if (!schedule) return;
    
    // 以前選択されていたが、今は選択されていないTrafficを特定（状態更新前に計算）
    const removedIds = selectedTrafficIds.filter((id) => !trafficIds.includes(id));
    // 新しく選択されたTrafficを特定（状態更新前に計算）
    const newIds = trafficIds.filter((id) => !selectedTrafficIds.includes(id));
    
    // まず選択状態を即座に更新（UIの応答性を向上）
    setSelectedTrafficIds(trafficIds);
    
    // 画面表示を即座に更新（選択解除されたアイテムを削除）
    setTrafficSummaries((prev) => prev.filter((t) => trafficIds.includes(t.id)));
    
    try {
      // 選択解除されたTrafficのschedule_idを元のスケジュールに戻す（または0に設定）
      const unlinkPromises = removedIds.map(async (trafficId) => {
        const getRes = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`));
        if (!getRes.ok) return;
        const traffic = await getRes.json();

        // 元のschedule_idを取得（保存されていない場合は0に設定）
        const originalScheduleId = trafficOriginalScheduleIds.get(trafficId) ?? 0;

        // schedule_idを元のスケジュールに戻す（または0に設定）
        const updateRes = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule_id: originalScheduleId,
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

        if (!updateRes.ok) {
          console.error(`Failed to unlink traffic ${trafficId}`);
        }
      });

      // 新しく選択されたTrafficのschedule_idを更新
      // 他のスケジュールに紐づいている場合でも、現在のスケジュールに移動させる
      const linkPromises = newIds.map(async (trafficId) => {
        const getRes = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`));
        if (!getRes.ok) {
          console.error(`Failed to get traffic ${trafficId}`);
          return;
        }
        const traffic = await getRes.json();

        // 元のschedule_idを保存（選択解除時に元のスケジュールに戻すため）
        // 他のスケジュールに紐づいている場合、そのschedule_idが保存される
        setTrafficOriginalScheduleIds((prev) => {
          const newMap = new Map(prev);
          newMap.set(trafficId, traffic.schedule_id);
          return newMap;
        });

        // schedule_idを現在のスケジュールに更新（他のスケジュールから移動）
        const updateRes = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule_id: schedule.id, // 現在のスケジュールに紐づける
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

        if (!updateRes.ok) {
          console.error(`Failed to update traffic ${trafficId}`);
        }
      });

      // すべての更新が完了するのを待つ
      await Promise.all([...unlinkPromises, ...linkPromises]);

      // Traffic一覧を再取得（現在のスケジュールに紐づいているもののみ）
      const listRes = await authenticatedFetch(getApiUrl(`/traffic?schedule_id=${schedule.id}`));
      if (listRes.ok) {
        const list: TrafficSummary[] = await listRes.json();
        list.sort((a, b) => {
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          return a.order - b.order;
        });
        // 再取得したデータで完全に置き換え（ユーザーが選択したIDのみを表示）
        const linkedIds = list.map((t) => t.id);
        const finalSelectedIds = trafficIds.filter((id) => linkedIds.includes(id));
        // ユーザーが選択したIDに含まれるもののみを表示
        const filteredList = list.filter((t) => trafficIds.includes(t.id));
        setTrafficSummaries(filteredList);
        setSelectedTrafficIds(finalSelectedIds);
      }
    } catch (error) {
      console.error("Error linking traffics:", error);
    }
  };

  const handleLinkStays = async (stayIds: number[]) => {
    if (!schedule) return;
    
    // 以前選択されていたが、今は選択されていないStayを特定（状態更新前に計算）
    const removedIds = selectedStayIds.filter((id) => !stayIds.includes(id));
    // 新しく選択されたStayを特定（状態更新前に計算）
    const newIds = stayIds.filter((id) => !selectedStayIds.includes(id));
    
    // まず選択状態を即座に更新（UIの応答性を向上）
    setSelectedStayIds(stayIds);
    
    // 画面表示を即座に更新（選択解除されたアイテムを削除）
    setStaySummaries((prev) => prev.filter((s) => stayIds.includes(s.id)));
    
    try {
      // 選択解除されたStayのschedule_idを元のスケジュールに戻す（または0に設定）
      const unlinkPromises = removedIds.map(async (stayId) => {
        const getRes = await authenticatedFetch(getApiUrl(`/stay/${stayId}`));
        if (!getRes.ok) return;
        const stay = await getRes.json();

        // 元のschedule_idを取得（保存されていない場合は0に設定）
        const originalScheduleId = stayOriginalScheduleIds.get(stayId) ?? 0;

        // schedule_idを元のスケジュールに戻す（または0に設定）
        const updateRes = await authenticatedFetch(getApiUrl(`/stay/${stayId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule_id: originalScheduleId,
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

        if (!updateRes.ok) {
          console.error(`Failed to unlink stay ${stayId}`);
        }
      });

      // 新しく選択されたStayのschedule_idを更新
      // 他のスケジュールに紐づいている場合でも、現在のスケジュールに移動させる
      const linkPromises = newIds.map(async (stayId) => {
        const getRes = await authenticatedFetch(getApiUrl(`/stay/${stayId}`));
        if (!getRes.ok) {
          console.error(`Failed to get stay ${stayId}`);
          return;
        }
        const stay = await getRes.json();

        // 元のschedule_idを保存（選択解除時に元のスケジュールに戻すため）
        // 他のスケジュールに紐づいている場合、そのschedule_idが保存される
        setStayOriginalScheduleIds((prev) => {
          const newMap = new Map(prev);
          newMap.set(stayId, stay.schedule_id);
          return newMap;
        });

        // schedule_idを現在のスケジュールに更新（他のスケジュールから移動）
        const updateRes = await authenticatedFetch(getApiUrl(`/stay/${stayId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule_id: schedule.id, // 現在のスケジュールに紐づける
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

        if (!updateRes.ok) {
          console.error(`Failed to update stay ${stayId}`);
        }
      });

      // すべての更新が完了するのを待つ
      await Promise.all([...unlinkPromises, ...linkPromises]);

      // Stay一覧を再取得（現在のスケジュールに紐づいているもののみ）
      const listRes = await authenticatedFetch(getApiUrl(`/stay?schedule_id=${schedule.id}`));
      if (listRes.ok) {
        const list: StaySummary[] = await listRes.json();
        // 再取得したデータで完全に置き換え（ユーザーが選択したIDのみを表示）
        const linkedIds = list.map((s) => s.id);
        const finalSelectedIds = stayIds.filter((id) => linkedIds.includes(id));
        // ユーザーが選択したIDに含まれるもののみを表示
        const filteredList = list.filter((s) => stayIds.includes(s.id));
        setStaySummaries(filteredList);
        setSelectedStayIds(finalSelectedIds);
      }
    } catch (error) {
      console.error("Error linking stays:", error);
    }
  };

  const handleLinkRelatedSchedule = async (newRelatedIds: number[]) => {
    if (!schedule) return;
    
    try {
      const res = await authenticatedFetch(getApiUrl(`/schedules/${schedule.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: schedule.title,
          group: schedule.group,
          date: schedule.date,
          open: schedule.open,
          start: schedule.start,
          end: schedule.end,
          notes: schedule.notes,
          category: schedule.category,
          area: schedule.area,
          venue: schedule.venue,
          target: schedule.target,
          lineup: schedule.lineup,
          seller: schedule.seller,
          ticket_fee: schedule.ticket_fee,
          drink_fee: schedule.drink_fee,
          status: schedule.status,
          related_schedule_ids: newRelatedIds,
          is_public: schedule.is_public,
        }),
      });

      if (!res.ok) {
        console.error("Failed to update related schedules");
        return;
      }

      // スケジュールを再取得
      const updatedSchedule: Schedule = await res.json();
      setSchedule(updatedSchedule);
      // モーダルを閉じる（必要に応じて実装）
    } catch (error) {
      console.error("Error updating related schedules:", error);
    }
  };

  const handleEdit = () => {
    router.push(`/live/${id}/edit`);
  };

  const handleDuplicate = () => {
    router.push(`/new?copyFrom=${id}`);
  };

  const handleDelete = () => {
    const performDelete = async () => {
      try {
        console.log("[DELETE] Attempting to delete schedule:", id);
        const res = await authenticatedFetch(getApiUrl(`/schedules/${id}`), {
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
        const successMessage = "スケジュールを削除しました";
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
      if (window.confirm("このスケジュールを削除しますか？この操作は取り消せません。")) {
        performDelete();
      }
    } else {
      Alert.alert(
        "削除確認",
        "このスケジュールを削除しますか？この操作は取り消せません。",
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

  return (
    <View style={styles.container}>
      <PageHeader showBackButton={true} />
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
        onScroll={(e) => {
          const { contentOffset } = e.nativeEvent;
          if (contentOffset.y === 0 && pullDistance > 100 && !refreshing) {
            onRefresh();
          }
        }}
        scrollEventThrottle={16}
      >
        {/* タイトル */}
        <View style={styles.titleHeader}>
        <Text style={styles.mainTitle}>
          {schedule.title}
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
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
              >
                <Text style={styles.deleteButtonText}>削除</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* [Event Info] */}
        <NotionPropertyBlock title="イベント情報">
          <NotionProperty label="グループ" value={schedule.group || "-"} />
          <NotionProperty
            label="日付"
            value={schedule.date ?? formatDateTimeUTC(schedule.datetime)}
          />
          <NotionProperty label="開場" value={schedule.open} />
          <NotionProperty label="開演" value={schedule.start} />
          <NotionProperty label="終演" value={schedule.end} />
          <NotionProperty
            label="備考"
            value={
              schedule.notes && schedule.notes.trim().length > 0
                ? schedule.notes
                : undefined
            }
          />
          <NotionProperty label="カテゴリ">
            {schedule.category ? (
              <NotionTag label={schedule.category} color={categoryColor || undefined} />
            ) : (
              <Text style={styles.emptyValue}>-</Text>
            )}
          </NotionProperty>
          <NotionProperty label="エリア">
            {schedule.area ? (
              <NotionTag label={schedule.area} color={areaColor || undefined} />
            ) : (
              <Text style={styles.emptyValue}>-</Text>
            )}
          </NotionProperty>
          <NotionProperty label="会場" value={schedule.venue} />
          <NotionProperty label="出演者">
            {filteredLineupOptions.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {filteredLineupOptions.map((opt) => (
                  <NotionTag key={opt.label} label={opt.label} color={opt.color} />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyValue}>-</Text>
            )}
          </NotionProperty>
          <NotionProperty label="お目当て">
            {filteredTarget ? (
              <NotionTag label={filteredTarget} color={targetColor || undefined} />
            ) : (
              <Text style={styles.emptyValue}>-</Text>
            )}
          </NotionProperty>
        </NotionPropertyBlock>

        {/* [Cost] */}
        <NotionPropertyBlock title="費用">
          <NotionProperty label="販売元">
            {schedule.seller ? (
              <NotionTag label={schedule.seller} color={sellerColor || undefined} />
            ) : (
              <Text style={styles.emptyValue}>-</Text>
            )}
          </NotionProperty>
          <NotionProperty
            label="チケット代"
            value={formatCurrency(schedule.ticket_fee)}
          />
          <NotionProperty
            label="ドリンク代"
            value={formatCurrency(schedule.drink_fee)}
          />
          <NotionProperty
            label="交通費合計"
            value={formatCurrency(schedule.total_fare)}
          />
          <NotionProperty
            label="宿泊費合計"
            value={formatCurrency(schedule.stay_fee)}
          />
          <NotionProperty
            label="遠征費合計"
            value={formatCurrency(schedule.travel_cost)}
          />
          <NotionProperty
            label="総費用"
            value={formatCurrency(schedule.total_cost)}
          />
          <NotionProperty label="ステータス">
          {schedule.status ? (
              <NotionTag label={schedule.status} color={statusColor || undefined} />
          ) : (
              <Text style={styles.emptyValue}>-</Text>
          )}
          </NotionProperty>
        </NotionPropertyBlock>

        {/* [Relation] Live */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>関連スケジュール</Text>
          </View>
          {relatedIds.length === 0 ? (
            <Text style={styles.emptyValue}>関連スケジュールがありません</Text>
          ) : (
            <View style={styles.relationContainer}>
        {relatedIds.map((rid) => {
          const related = allSchedules.find((s) => s.id === rid);
                if (!related) {
                  return (
                    <TouchableOpacity
                      key={rid}
                      onPress={() => router.push(`/live/${rid}`)}
                    >
                      <Text style={styles.relationLink}>Live #${rid}</Text>
                    </TouchableOpacity>
                  );
                }

          return (
            <TouchableOpacity
              key={rid}
              onPress={() => router.push(`/live/${rid}`)}
                    style={styles.relationCard}
                  >
                    <View style={styles.relationCardContent}>
                      {related.date && (
                        <Text style={styles.relationDate}>{related.date}</Text>
                      )}
                      <Text style={styles.relationTitle} numberOfLines={1}>
                        {related.title}
                      </Text>
                      {related.area && (
                        <NotionTag
                          label={related.area}
                          color={relatedAreaColors.get(rid) || undefined}
                        />
                      )}
                    </View>
            </TouchableOpacity>
          );
        })}
            </View>
          )}
          {isAuthenticated && (
            <View style={styles.addLinksContainer}>
              <TouchableOpacity
                style={styles.addLink}
                onPress={() => router.push(`/new?copyFrom=${id}`)}
              >
                <Text style={styles.addLinkText}>+ 新規ページを追加</Text>
              </TouchableOpacity>
              <View style={styles.relationLinkButton}>
                <NotionRelation
                  label=""
                  value={relatedIds}
                  onValueChange={handleLinkRelatedSchedule}
                  currentScheduleId={schedule?.id}
                  placeholder="↗ 既存データにリンク"
                  hideSelectedCards={true}
                />
              </View>
            </View>
          )}
        </View>

        {/* [Traffic] */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>交通</Text>
          </View>
          {trafficSummaries.length === 0 ? (
            <Text style={styles.emptyValue}>交通情報がありません</Text>
          ) : (
            trafficSummaries.map((traffic) => {
              const detailText = traffic.return_flag
                ? `${traffic.from} ⇔ ${traffic.to}`
                : `${traffic.from} → ${traffic.to}`;
              const detailWithNotes = traffic.notes
                ? `${detailText} (${traffic.notes})`
                : detailText;
              
          return (
            <TouchableOpacity
                  key={traffic.id}
                  style={styles.trafficCard}
                  onPress={() => router.push(`/traffic/${traffic.id}`)}
            >
                  <View style={styles.cardRow}>
                    <Text style={styles.cardDate}>{traffic.date}</Text>
                    <Text style={styles.cardPrice}>{formatCurrency(traffic.fare)}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    {traffic.transportation && (
                      <NotionTag
                        label={traffic.transportation}
                        color={transportationColors.get(traffic.id) || undefined}
                      />
                    )}
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardDetail}>{detailWithNotes}</Text>
                  </View>
            </TouchableOpacity>
          );
            })
          )}
          {isAuthenticated && (
            <View style={styles.addLinksContainer}>
              <TouchableOpacity
                style={styles.addLink}
                onPress={handleAddTraffic}
              >
                <Text style={styles.addLinkText}>+ 新規ページを追加</Text>
              </TouchableOpacity>
              <View style={styles.relationLinkButton}>
                <NotionTrafficRelation
                  label=""
                  placeholder="↗ 既存データにリンク"
                  currentScheduleId={schedule?.id || 0}
                  value={selectedTrafficIds}
                  onValueChange={handleLinkTraffics}
                  hideSelectedCards={true}
                />
              </View>
            </View>
          )}
        </View>

        {/* [Stay] */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>宿泊</Text>
          </View>
          {staySummaries.length === 0 ? (
            <Text style={styles.emptyValue}>宿泊情報がありません</Text>
          ) : (
            staySummaries.map((stay) => {
              // チェックイン/チェックアウトの日時をフォーマット
              const formatDateTime = (dateTimeStr: string) => {
                // "2025-11-08 15:00" 形式を "2025/11/08 15:00" に変換
                return dateTimeStr.replace(/-/g, "/");
              };
              const checkInFormatted = formatDateTime(stay.check_in);
              const checkOutFormatted = formatDateTime(stay.check_out);
              const dateTimeText = `${checkInFormatted} → ${checkOutFormatted}`;
              
              return (
                <TouchableOpacity
                  key={stay.id}
                  style={styles.stayCard}
                  onPress={() => router.push(`/stay/${stay.id}`)}
                >
                  <View style={styles.cardRow}>
                    <Text style={styles.cardDateTime}>{dateTimeText}</Text>
                    <Text style={styles.cardPrice}>{formatCurrency(stay.fee)}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardDetail}>{maskHotelName(stay.hotel_name, isAuthenticated)}</Text>
                  </View>
        </TouchableOpacity>
              );
            })
        )}
          {isAuthenticated && (
            <View style={styles.addLinksContainer}>
          <TouchableOpacity
                style={styles.addLink}
                onPress={handleAddStay}
          >
                <Text style={styles.addLinkText}>+ 新規ページを追加</Text>
          </TouchableOpacity>
              <View style={styles.relationLinkButton}>
                <NotionStayRelation
                  label=""
                  placeholder="↗ 既存データにリンク"
                  currentScheduleId={schedule?.id || 0}
                  value={selectedStayIds}
                  onValueChange={handleLinkStays}
                  hideSelectedCards={true}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// UTC そのまま表示
function formatDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 金額フォーマット
function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return "-";
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
    flexGrow: 1,
    minHeight: '100%',
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
    fontSize: 28,
    fontWeight: "700",
    color: "#37352f",
    lineHeight: 36,
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#37352f",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f7f6f3",
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#37352f",
    letterSpacing: 0.3,
  },
  relationContainer: {
    gap: 8,
  },
  relationCard: {
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    padding: 12,
    marginBottom: 8,
  },
  relationCardContent: {
    gap: 4,
  },
  relationDate: {
    fontSize: 11,
    color: "#9b9a97",
    marginBottom: 2,
  },
  relationTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#37352f",
    marginBottom: 2,
  },
  relationArea: {
    fontSize: 12,
    color: "#9b9a97",
  },
  relationLink: {
    fontSize: 14,
    color: "#37352f",
    textDecorationLine: "underline",
  },
  emptyRelation: {
    fontSize: 14,
    color: "#787774",
    fontStyle: "italic",
    paddingVertical: 8,
  },
  relationRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  relationText: {
    fontSize: 14,
    color: "#0b70e0",
    textDecorationLine: "underline",
  },
  errorText: {
    color: "#d93025",
    marginVertical: 8,
    fontSize: 14,
  },
  emptyValue: {
    fontSize: 14,
    color: "#9b9a97",
  },
  relationContainer: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  trafficCard: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
  },
  stayCard: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 14,
    color: "#37352f",
    flex: 1,
  },
  cardDateTime: {
    fontSize: 14,
    color: "#37352f",
    flex: 1,
  },
  cardPrice: {
    fontSize: 14,
    color: "#37352f",
    fontWeight: "500",
    textAlign: "right",
  },
  transportationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  transportationText: {
    fontSize: 14,
    color: "#37352f",
  },
  cardDetail: {
    fontSize: 14,
    color: "#37352f",
    marginLeft: 6,
    flex: 1,
  },
  addLinksContainer: {
    marginTop: 8,
    gap: 4,
  },
  addLink: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  addLinkText: {
    fontSize: 14,
    color: "#787774",
  },
  relationLinkButton: {
    flex: 1,
  },
});