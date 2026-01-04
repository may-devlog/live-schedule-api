// app/share/[share_id]/schedules/[id].tsx - 共有ページ用の詳細画面（閲覧専用）
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import { getApiUrl } from "../../../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../../../components/notion-property";
import { NotionTag } from "../../../../components/notion-tag";
import { getOptionColor } from "../../../../utils/get-option-color";
import { loadSelectOptions } from "../../../../utils/select-options-storage";
import type { Schedule } from "../../../HomeScreen";
import { maskHotelName } from "../../../../utils/mask-hotel-name";
import { PageHeader } from "../../../../components/PageHeader";

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

export default function SharedScheduleDetailScreen() {
  const { share_id, id } = useLocalSearchParams<{ share_id: string; id: string }>();
  const router = useRouter();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [trafficSummaries, setTrafficSummaries] = useState<TrafficSummary[]>([]);
  const [staySummaries, setStaySummaries] = useState<StaySummary[]>([]);
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
    if (!share_id || !id) return;
    
    try {
      setLoading(true);
      setError(null);

      // 共有スケジュールを取得
      const res = await fetch(getApiUrl(`/share/${share_id}/schedules/${id}`));
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("スケジュールが見つかりません");
        }
        throw new Error(`status: ${res.status}`);
      }
      const found: Schedule = await res.json();
      setSchedule(found);

      // 全スケジュールを取得（関連スケジュール表示用）
      const allRes = await fetch(getApiUrl(`/share/${share_id}`));
      if (allRes.ok) {
        const allData: Schedule[] = await allRes.json();
        setAllSchedules(allData);
      }

      await fetchTrafficAndStay(found.id);
      
      // TargetとLineupの選択肢を読み込んでフィルタリング
      const targets = await loadSelectOptions("TARGETS", share_id);
      const targetOptionLabels = targets.map(opt => opt.label);
      
      // Target: 選択肢に存在する場合のみ表示
      let targetColor: string = "#E5E7EB"; // デフォルト色
      if (found.target && targetOptionLabels.includes(found.target)) {
        const targetOption = targets.find(opt => opt.label === found.target);
        if (targetOption) {
          targetColor = targetOption.color || "#E5E7EB";
        }
      }
      setTargetColor(targetColor);
      setFilteredTarget(found.target && targetOptionLabels.includes(found.target) ? found.target : null);
      
      // Lineup: 選択肢に存在する場合のみ表示
      const lineupOptions: Array<{ label: string; color: string }> = [];
      if (found.lineup) {
        const lineupValues = found.lineup.split(',').map(v => v.trim()).filter(v => v);
        for (const lineupValue of lineupValues) {
          if (targetOptionLabels.includes(lineupValue)) {
            const lineupOption = targets.find(opt => opt.label === lineupValue);
            lineupOptions.push({
              label: lineupValue,
              color: lineupOption?.color || "#E5E7EB"
            });
          }
        }
      }
      setFilteredLineupOptions(lineupOptions);
      setFilteredLineup(lineupOptions.length > 0 ? lineupOptions.map(opt => opt.label).join(", ") : null);
      
      // 選択肢の色情報を取得
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
  }, [share_id, id]);

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
    // Traffic 一覧（公開APIを使用）
    try {
      const res = await fetch(getApiUrl(`/public/traffic?schedule_id=${scheduleId}`));
      if (res.ok) {
        const list: TrafficSummary[] = await res.json();
        list.sort((a, b) => {
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          return a.order - b.order;
        });
        setTrafficSummaries(list);
      }
    } catch {
      // とりあえず無視
    }

    // Stay 一覧（公開APIを使用）
    try {
      const res = await fetch(getApiUrl(`/public/stay?schedule_id=${scheduleId}`));
      if (res.ok) {
        const list: StaySummary[] = await res.json();
        setStaySummaries(list);
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
        <Text style={styles.errorText}>Error: {error}</Text>
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

  const relatedIds = schedule.related_schedule_ids ?? [];

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

  return (
    <View style={styles.container}>
      <PageHeader showBackButton={true} homePath={`/share/${share_id}`} />
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
        </View>

        {/* [Event Info] */}
        <NotionPropertyBlock title="Event Info">
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
        <NotionPropertyBlock title="Cost">
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
            <Text style={styles.sectionTitle}>Related Schedules</Text>
          </View>
          {relatedIds.length === 0 ? (
            <Text style={styles.emptyValue}>No related schedules</Text>
          ) : (
            <View style={styles.relationContainer}>
              {relatedIds.map((rid) => {
                const related = allSchedules.find((s) => s.id === rid);
                if (!related) {
                  return (
                    <TouchableOpacity
                      key={rid}
                      onPress={() => router.push(`/share/${share_id}/schedules/${rid}`)}
                    >
                      <Text style={styles.relationLink}>Live #${rid}</Text>
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity
                    key={rid}
                    onPress={() => router.push(`/share/${share_id}/schedules/${rid}`)}
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
        </View>

        {/* [Traffic] */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Traffic</Text>
          </View>
          {trafficSummaries.length === 0 ? (
            <Text style={styles.emptyValue}>No traffic information</Text>
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
                  onPress={() => router.push(`/share/${share_id}/traffic/${traffic.id}`)}
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
        </View>

        {/* [Stay] */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Stay</Text>
          </View>
          {staySummaries.length === 0 ? (
            <Text style={styles.emptyValue}>No stay information</Text>
          ) : (
            staySummaries.map((stay) => {
              // チェックイン/チェックアウトの日時をフォーマット
              const formatDateTime = (dateTimeStr: string) => {
                return dateTimeStr.replace(/-/g, "/");
              };
              const checkInFormatted = formatDateTime(stay.check_in);
              const checkOutFormatted = formatDateTime(stay.check_out);
              const dateTimeText = `${checkInFormatted} → ${checkOutFormatted}`;
              
              return (
                <TouchableOpacity
                  key={stay.id}
                  style={styles.stayCard}
                  onPress={() => router.push(`/share/${share_id}/stay/${stay.id}`)}
                >
                  <View style={styles.cardRow}>
                    <Text style={styles.cardDateTime}>{dateTimeText}</Text>
                    <Text style={styles.cardPrice}>{formatCurrency(stay.fee)}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardDetail}>{maskHotelName(stay.hotel_name, false)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    marginTop: 24,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  relationLink: {
    fontSize: 14,
    color: "#37352f",
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
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
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
  cardDetail: {
    fontSize: 14,
    color: "#37352f",
    marginLeft: 6,
    flex: 1,
  },
});
