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
  Alert,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authenticatedFetch, getApiUrl } from "../../../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../../../components/notion-property";
import { NotionTag } from "../../../../components/notion-tag";
import { getOptionColor } from "../../../../utils/get-option-color";
import { loadSelectOptions } from "../../../../utils/select-options-storage";
import type { Schedule } from "../../../HomeScreen";
import { CollapsibleDetailSection } from "../../../../components/CollapsibleDetailSection";
import { AppHeader, PublicFooter, PublicHeader } from "../../../../components/GenBGTBrand";
import { useTheme, type ThemeColors } from "../../../../contexts/ThemeContext";
import { AppTabBar } from "../../../../components/AppTabBar";
import { isJapaneseHolidayDate } from "../../../../components/ScheduleCalendar";

// 本人認証時（内部数値id）と共有・公開時（推測困難なpublic_id文字列）の両方をこの画面で扱うため、
// id系のフィールドは string | number として扱う
type ScheduleLike = Omit<Schedule, "id" | "related_schedule_ids"> & {
  id: string | number;
  related_schedule_ids?: (string | number)[];
};

type TrafficSummary = {
  id: string | number;
  schedule_id: string | number;
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
  id: string | number;
  schedule_id: string | number;
  check_in: string;
  check_out: string;
  hotel_name: string;
  fee: number;
  breakfast_flag: boolean;
  deadline?: string | null;
  penalty?: number | null;
  status: string;
};

type DetailScreenProps = { authenticated?: boolean; scheduleId?: string };

export default function SharedScheduleDetailScreen({ authenticated = false, scheduleId }: DetailScreenProps = {}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isMobile = width < 600;
  const isNarrowMobile = width < 390;
  const params = useLocalSearchParams<{ share_id?: string; id?: string }>();
  const share_id = params.share_id;
  const id = scheduleId ?? params.id;
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleLike | null>(null);
  const [allSchedules, setAllSchedules] = useState<ScheduleLike[]>([]);
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
  const [groupColor, setGroupColor] = useState<string | null>(null);
  
  // フィルタリング後のTargetとLineup
  const [filteredTarget, setFilteredTarget] = useState<string | null>(null);
  const [filteredLineup, setFilteredLineup] = useState<string | null>(null);
  const [filteredLineupOptions, setFilteredLineupOptions] = useState<Array<{ label: string; color: string }>>([]);
  
  // Related SchedulesのArea色情報
  const [relatedAreaColors, setRelatedAreaColors] = useState<Map<string | number, string>>(new Map());
  const [relatedStatusColors, setRelatedStatusColors] = useState<Map<string | number, string>>(new Map());

  // TrafficのTransportation色情報
  const [transportationColors, setTransportationColors] = useState<Map<string | number, string>>(new Map());

  const fetchDetail = async () => {
    if ((!authenticated && !share_id) || !id) return;
    
    try {
      setLoading(true);
      setError(null);

      let found: ScheduleLike;
      if (authenticated) {
        const res = await authenticatedFetch(getApiUrl('/schedules?include_canceled=true'));
        if (!res.ok) throw new Error(`status: ${res.status}`);
        const allData: Schedule[] = await res.json();
        const matched = allData.find((item) => item.id === Number(id));
        if (!matched) {
          throw new Error("スケジュールが見つかりません");
        }
        found = matched;
        setAllSchedules(allData);
      } else {
        const res = await fetch(getApiUrl(`/share/${share_id}/schedules/${id}`));
        if (!res.ok) {
          if (res.status === 404) throw new Error("スケジュールが見つかりません");
          throw new Error(`status: ${res.status}`);
        }
        found = await res.json();
      }
      setSchedule(found);

      // 全スケジュールを取得（関連スケジュール表示用）
      if (!authenticated) {
        const allRes = await fetch(getApiUrl(`/share/${share_id}`));
        if (allRes.ok) {
        const allData: ScheduleLike[] = await allRes.json();
        setAllSchedules(allData);
        }
      }

      await fetchTrafficAndStay(found.id);
      
      // TargetとLineupの選択肢を読み込んでフィルタリング
      const targets = await loadSelectOptions("TARGETS", authenticated ? undefined : share_id);
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
      // 選択順序を保持するため、ソートは行わない
      const lineupOptions: Array<{ label: string; color: string }> = [];
      if (found.lineup) {
        const lineupValues = found.lineup.split(',').map(v => v.trim()).filter(v => v);
        // 選択順序を保持するため、splitした順序のまま使用
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
      if (found.group) {
        const color = await getOptionColor(found.group, "GROUPS");
        setGroupColor(color);
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
  }, [share_id, id, authenticated]);

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
      const colorMap = new Map<string | number, string>();
      const statusColorMap = new Map<string | number, string>();
      for (const rid of relatedIds) {
        const related = allSchedules.find((s) => s.id === rid);
        if (related && related.area) {
          const color = await getOptionColor(related.area, "AREAS");
          colorMap.set(rid, color);
        }
        if (related?.status) {
          const color = await getOptionColor(related.status, "STATUSES");
          statusColorMap.set(rid, color);
        }
      }
      setRelatedAreaColors(colorMap);
      setRelatedStatusColors(statusColorMap);
    };
    
    fetchRelatedAreaColors();
  }, [schedule, allSchedules]);

  // TrafficのTransportation色情報を取得
  useEffect(() => {
    if (trafficSummaries.length === 0) return;
    
    const fetchTransportationColors = async () => {
      const colorMap = new Map<string | number, string>();
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

  const fetchTrafficAndStay = async (scheduleId: string | number) => {
    try {
      const res = authenticated
        ? await authenticatedFetch(getApiUrl(`/traffic?schedule_id=${scheduleId}`))
        : await fetch(getApiUrl(`/public/traffic?schedule_id=${scheduleId}`));
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

    try {
      const res = authenticated
        ? await authenticatedFetch(getApiUrl(`/stay?schedule_id=${scheduleId}`))
        : await fetch(getApiUrl(`/public/stay?schedule_id=${scheduleId}`));
      if (res.ok) {
        const list: StaySummary[] = await res.json();
        setStaySummaries(list);
      }
    } catch {
      // 無視
    }
  };

  const handleDelete = async () => {
    if (!authenticated || !id) return;
    const warning = "このイベントに紐づく交通情報と宿泊情報もすべて削除されます。\nこの操作は取り消せません。削除しますか？";
    const performDelete = async () => {
      const response = await authenticatedFetch(getApiUrl(`/schedules/${id}`), { method: "DELETE" });
      if (response.ok) router.replace("/");
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(warning)) await performDelete();
      return;
    }

    Alert.alert("イベントを削除", warning, [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: () => void performDelete() },
    ]);
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

  function dateDisplay(raw?: string | null) {
    if (!raw) return { date: "-", weekday: "", tone: "normal" as const };
    const datePart = raw.slice(0, 10);
    const [year, month, day] = datePart.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const holiday = isJapaneseHolidayDate(datePart);
    const weekday = `${["日", "月", "火", "水", "木", "金", "土"][date.getDay()] ?? ""}${holiday ? "・祝" : ""}`;
    const tone = date.getDay() === 6 ? "saturday" as const : (date.getDay() === 0 || holiday) ? "holiday" as const : "normal" as const;
    return { date: datePart.replace(/-/g, "."), weekday, tone };
  }

  const scheduleDateDisplay = dateDisplay(schedule.date ?? schedule.datetime);

  // PCではイベント情報→交通→宿泊、費用→関連スケジュールをそれぞれ独立した縦の列として
  // 積み上げたいので、各セクションを変数化して2カラムレイアウトとモバイルの縦積みで
  // 同じ内容を並び替えて使う
  const eventInfoBlock = (
    <NotionPropertyBlock title="イベント情報" iconName="people">
      <NotionProperty label="グループ">
        {schedule.group ? (
          <NotionTag label={schedule.group} color={groupColor || undefined} />
        ) : (
          <Text style={styles.emptyValue}>-</Text>
        )}
      </NotionProperty>
      <NotionProperty label="カテゴリ">
        {schedule.category ? (
          <NotionTag label={schedule.category} color={categoryColor || undefined} />
        ) : (
          <Text style={styles.emptyValue}>-</Text>
        )}
      </NotionProperty>
      <NotionProperty label="出演者">
        {filteredLineupOptions.length > 0 ? (
          <View
            style={{
              width: "100%",
              minWidth: 0,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
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
      <NotionProperty
        label="備考"
        value={
          schedule.notes && schedule.notes.trim().length > 0
            ? schedule.notes
            : undefined
        }
      />
    </NotionPropertyBlock>
  );

  const costBlock = (
    <NotionPropertyBlock title="費用" iconName="wallet">
      <NotionProperty label="販売元" alignValue="right">
        {schedule.seller ? (
          <NotionTag label={schedule.seller} color={sellerColor || undefined} align="end" />
        ) : (
          <Text style={styles.emptyValue}>-</Text>
        )}
      </NotionProperty>
      <NotionProperty
        label="チケット代"
        value={formatCurrency(schedule.ticket_fee)}
        alignValue="right"
      />
      <NotionProperty
        label="ドリンク代"
        value={formatCurrency(schedule.drink_fee)}
        alignValue="right"
      />
      <NotionProperty
        label="交通費合計"
        alignValue="right"
        value={formatCurrency(
          trafficSummaries.reduce((sum, traffic) => {
            // 往復フラグがある場合は金額を2倍
            return sum + (traffic.return_flag ? traffic.fare * 2 : traffic.fare);
          }, 0)
        )}
      />
      {trafficSummaries.some(t => t.miles !== null && t.miles !== undefined) && (
        <NotionProperty
          label="消費マイル合計"
          alignValue="right"
          value={
            trafficSummaries.reduce((sum, traffic) => {
              if (traffic.miles === null || traffic.miles === undefined) return sum;
              // 往復フラグがある場合はマイルを2倍
              return sum + (traffic.return_flag ? traffic.miles * 2 : traffic.miles);
            }, 0).toString()
          }
        />
      )}
      <NotionProperty
        label="宿泊費合計"
        value={formatCurrency(schedule.stay_fee)}
        alignValue="right"
      />
      <NotionProperty
        label="遠征費合計"
        alignValue="right"
        value={formatCurrency(
          // 交通費合計（往復フラグ考慮済み）+ 宿泊費合計
          trafficSummaries.reduce((sum, traffic) => {
            return sum + (traffic.return_flag ? traffic.fare * 2 : traffic.fare);
          }, 0) + (schedule.stay_fee || 0)
        )}
      />
      <NotionProperty
        label="総費用"
        alignValue="right"
        isLast={false}
      >
        <Text style={styles.totalCostText}>{formatCurrency(
          // チケット代 + ドリンク代 + 遠征費合計（往復フラグ考慮済み）
          (schedule.ticket_fee || 0) +
          (schedule.drink_fee || 0) +
          trafficSummaries.reduce((sum, traffic) => {
            return sum + (traffic.return_flag ? traffic.fare * 2 : traffic.fare);
          }, 0) + (schedule.stay_fee || 0)
        )}</Text>
      </NotionProperty>
    </NotionPropertyBlock>
  );

  const relatedBlock = (
    <CollapsibleDetailSection title="関連スケジュール" iconName="calendar">
      {relatedIds.length === 0 ? (
        <Text style={styles.emptyValue}>関連スケジュールはありません</Text>
      ) : (
        <View style={styles.relationContainer}>
          {relatedIds.map((rid) => {
            const related = allSchedules.find((s) => s.id === rid);
            if (!related) {
              return (
                <TouchableOpacity
                  key={rid}
                  onPress={() => router.push(authenticated ? `/live/${rid}` : `/share/${share_id}/schedules/${rid}`)}
                >
                  <Text style={styles.relationLink}>Live #${rid}</Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={rid}
                onPress={() => router.push(authenticated ? `/live/${rid}` : `/share/${share_id}/schedules/${rid}`)}
                style={styles.relationCard}
              >
                <View style={styles.relationCardContent}>
                  {related.date && (
                    <Text style={styles.relationDate}>{dateDisplay(related.date).date} <Text style={[styles.weekdayText, dateDisplay(related.date).tone === "saturday" && styles.saturdayText, dateDisplay(related.date).tone === "holiday" && styles.holidayText]}>{dateDisplay(related.date).weekday}</Text></Text>
                  )}
                  <View style={styles.relationScheduleRow}>
                    {!!related.start && <Text style={styles.relationTime}>{related.start}</Text>}
                    <Text style={styles.relationTitle} numberOfLines={2}>{related.title}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </View>
                  {(related.area || related.status) && (
                    <View style={styles.relationArea}>
                      {!!related.area && <NotionTag label={related.area} color={relatedAreaColors.get(rid) || undefined} />}
                      {!!related.status && <NotionTag label={related.status} color={relatedStatusColors.get(rid) || undefined} />}
                    </View>
                  )}
                  {!!related.venue && <Text style={styles.relationVenue}>{related.venue}</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </CollapsibleDetailSection>
  );

  const trafficBlock = (
    <CollapsibleDetailSection title="交通" iconName="train">
      {trafficSummaries.length === 0 ? (
        <Text style={styles.emptyValue}>交通情報はありません</Text>
      ) : (
        trafficSummaries.map((traffic) => {
          const detailText = traffic.return_flag
            ? `${traffic.from} ⇔ ${traffic.to}`
            : `${traffic.from} → ${traffic.to}`;
          const detailWithNotes = traffic.notes
            ? `${detailText} (${traffic.notes})`
            : detailText;
          // 往復フラグがある場合は金額を2倍
          const displayFare = traffic.return_flag ? traffic.fare * 2 : traffic.fare;
          // 往復フラグがある場合はマイルを2倍
          const displayMiles = traffic.return_flag && traffic.miles
            ? traffic.miles * 2
            : traffic.miles;

          return (
            <TouchableOpacity
              key={traffic.id}
              style={[styles.trafficCard, isMobile && styles.transportCardMobile]}
              onPress={() => router.push(authenticated ? `/traffic/${traffic.id}` : `/share/${share_id}/traffic/${traffic.id}`)}
            >
              {traffic.transportation && (
                <View style={[styles.trafficTag, isMobile && styles.trafficTagMobile]}>
                  <NotionTag label={traffic.transportation} color={transportationColors.get(traffic.id) || undefined} />
                </View>
              )}
              <View style={[styles.cardMain, isMobile && styles.cardMainMobile]}>
                <Text style={styles.cardRouteBold}>{detailWithNotes}</Text>
                <View style={styles.cardSubRow}>
                  <Ionicons name="calendar-outline" size={15} color={colors.accent} />
                  <View style={styles.datePartsRow}>
                    <Text style={styles.dateValue}>{dateDisplay(traffic.date).date}</Text>
                    <Text style={[styles.weekdayText, dateDisplay(traffic.date).tone === "saturday" && styles.saturdayText, dateDisplay(traffic.date).tone === "holiday" && styles.holidayText]}>{dateDisplay(traffic.date).weekday}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.cardPriceContainer, isMobile && styles.cardPriceMobile]}>
                <Text style={styles.cardPrice}>{formatCurrency(displayFare)}</Text>
                {displayMiles !== null && displayMiles !== undefined && <Text style={styles.cardMiles}>{displayMiles}マイル</Text>}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} style={isMobile ? styles.cardChevronMobile : undefined} />
            </TouchableOpacity>
          );
        })
      )}
      {authenticated && <TouchableOpacity style={styles.addAction} onPress={() => router.push(`/traffic/new?scheduleId=${schedule.id}`)}><Text style={styles.addActionText}>＋ 交通を追加</Text></TouchableOpacity>}
    </CollapsibleDetailSection>
  );

  const stayBlock = (
    <CollapsibleDetailSection title="宿泊" iconName="bed">
      {staySummaries.length === 0 ? (
        <Text style={styles.emptyValue}>宿泊情報はありません</Text>
      ) : (
        staySummaries.map((stay) => {
          // チェックイン/チェックアウトの日時をフォーマット
          const formatDateTime = (dateTimeStr: string) => {
            const display = dateDisplay(dateTimeStr);
            const time = dateTimeStr.includes(" ") ? dateTimeStr.split(" ")[1] : "";
            return { ...display, time };
          };
          const checkInFormatted = formatDateTime(stay.check_in);
          const checkOutFormatted = formatDateTime(stay.check_out);
          return (
            <TouchableOpacity
              key={stay.id}
              style={[styles.stayCard, isMobile && styles.stayCardMobile]}
              onPress={() => router.push(authenticated ? `/stay/${stay.id}` : `/share/${share_id}/stay/${stay.id}`)}
            >
              {authenticated && isDesktop && <View style={styles.stayIcon}>
                <Ionicons name="bed" size={28} color="#FFFFFF" />
              </View>}
              <View style={[styles.cardMain, isMobile && styles.stayMainMobile]}>
                {authenticated && <Text style={styles.cardRouteBold}>{stay.hotel_name}</Text>}
                <View style={styles.cardSubRow}>
                  {!isNarrowMobile && <Ionicons name="calendar-outline" size={15} color={colors.accent} />}
                  <Text style={[styles.stayDateLabel, isMobile && styles.stayDateLabelMobile, isNarrowMobile && styles.stayDateLabelNarrow]}>チェックイン</Text>
                  <View style={[styles.datePartsRow, isMobile && styles.stayDatePartsMobile, isNarrowMobile && styles.stayDatePartsNarrow]}>
                    <Text style={styles.dateValue}>{checkInFormatted.date}</Text>
                    <Text style={[styles.weekdayText, styles.stayWeekdayText, isMobile && styles.stayWeekdayTextMobile, isNarrowMobile && styles.stayWeekdayTextNarrow, checkInFormatted.tone === "saturday" && styles.saturdayText, checkInFormatted.tone === "holiday" && styles.holidayText]}>{checkInFormatted.weekday}</Text>
                    {!!checkInFormatted.time && <Text style={styles.timeValue}>{checkInFormatted.time}</Text>}
                  </View>
                </View>
                <View style={styles.cardSubRow}>
                  {!isNarrowMobile && <Ionicons name="calendar-outline" size={15} color={colors.accent} />}
                  <Text style={[styles.stayDateLabel, isMobile && styles.stayDateLabelMobile, isNarrowMobile && styles.stayDateLabelNarrow]}>チェックアウト</Text>
                  <View style={[styles.datePartsRow, isMobile && styles.stayDatePartsMobile, isNarrowMobile && styles.stayDatePartsNarrow]}>
                    <Text style={styles.dateValue}>{checkOutFormatted.date}</Text>
                    <Text style={[styles.weekdayText, styles.stayWeekdayText, isMobile && styles.stayWeekdayTextMobile, isNarrowMobile && styles.stayWeekdayTextNarrow, checkOutFormatted.tone === "saturday" && styles.saturdayText, checkOutFormatted.tone === "holiday" && styles.holidayText]}>{checkOutFormatted.weekday}</Text>
                    {!!checkOutFormatted.time && <Text style={styles.timeValue}>{checkOutFormatted.time}</Text>}
                  </View>
                </View>
              </View>
              <View style={[styles.stayCardActions, isMobile && styles.stayCardActionsMobile]}>
                <Text style={[styles.breakfastTag, !stay.breakfast_flag && styles.breakfastTagOff]}>
                  {stay.breakfast_flag ? "朝食あり" : "朝食なし"}
                </Text>
                <Text style={styles.cardPrice}>{formatCurrency(stay.fee)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} style={isMobile ? styles.cardChevronMobile : undefined} />
            </TouchableOpacity>
          );
        })
      )}
      {authenticated && <TouchableOpacity style={styles.addAction} onPress={() => router.push(`/stay/new?scheduleId=${schedule.id}`)}><Text style={styles.addActionText}>＋ 宿泊を追加</Text></TouchableOpacity>}
    </CollapsibleDetailSection>
  );

  return (
    <View style={styles.container}>
      {authenticated ? <AppHeader active="archive" /> : <PublicHeader active="archive" homePath={`/share/${share_id}`} archivePath={`/share/${share_id}/year/${new Date().getFullYear()}`} />}
      <ScrollView
        contentContainerStyle={styles.scrollPage}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={Platform.OS === 'ios' ? '#37352f' : undefined}
              colors={Platform.OS === 'android' ? ['#37352f'] : undefined}
            />
          ) : undefined
        }
        scrollEnabled={true}
        nestedScrollEnabled={Platform.OS === 'web'}
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
        <View style={styles.scrollContent}>

        {/* イベント概要 */}
        <View style={[styles.heroCard, isMobile && styles.heroCardMobile]}>
          <View style={styles.heroCopy}>
            <Text style={styles.mainTitle}>{schedule.title}</Text>
            <View style={styles.heroBadges}>
              {!!schedule.area && <NotionTag label={schedule.area} color={areaColor || undefined} />}
              {!!schedule.status && <NotionTag label={schedule.status} color={statusColor || undefined} />}
            </View>
            <View style={styles.heroMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                <View style={styles.heroDateRow}>
                  <Text style={styles.metaText}>{scheduleDateDisplay.date}</Text>
                  <Text style={[styles.weekdayText, scheduleDateDisplay.tone === "saturday" && styles.saturdayText, scheduleDateDisplay.tone === "holiday" && styles.holidayText]}>{scheduleDateDisplay.weekday}</Text>
                </View>
              </View>
              <View style={styles.timeMetaRow}>
                <Ionicons name="time-outline" size={16} color={colors.accent} />
                <Text style={styles.metaText}>
                  {[
                    schedule.open ? `開場 ${schedule.open}` : null,
                    schedule.start ? `開演 ${schedule.start}` : null,
                    schedule.end && schedule.end !== "-" ? `終演 ${schedule.end}` : null,
                  ].filter(Boolean).join("　")}
                </Text>
              </View>
              {!!schedule.venue && (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={16} color={colors.accent} />
                  <Text style={styles.metaText}>{schedule.venue}</Text>
                </View>
              )}
            </View>
            {authenticated && isMobile && <View style={styles.heroActions}>
              <TouchableOpacity style={styles.duplicateAction} onPress={() => router.push(`/new?copyFrom=${id}`)}><Ionicons name="copy-outline" size={18} color={colors.accentDark} /><Text style={styles.duplicateActionText}>複製</Text></TouchableOpacity>
              <TouchableOpacity style={styles.editAction} onPress={() => router.push(`/live/${id}/edit`)}><Ionicons name="create-outline" size={18} color={'#FFFFFF'} /><Text style={styles.editActionText}>編集</Text></TouchableOpacity>
              <TouchableOpacity style={styles.deleteAction} onPress={handleDelete}><Ionicons name="trash-outline" size={17} color="#DC2626" /><Text style={styles.deleteActionText}>削除</Text></TouchableOpacity>
            </View>}
          </View>
          {authenticated && !isMobile && <View style={[styles.heroActions, styles.heroActionsVertical]}>
            <TouchableOpacity style={styles.duplicateAction} onPress={() => router.push(`/new?copyFrom=${id}`)}><Ionicons name="copy-outline" size={18} color={colors.accentDark} /><Text style={styles.duplicateActionText}>複製</Text></TouchableOpacity>
            <TouchableOpacity style={styles.editAction} onPress={() => router.push(`/live/${id}/edit`)}><Ionicons name="create-outline" size={18} color={'#FFFFFF'} /><Text style={styles.editActionText}>編集</Text></TouchableOpacity>
            <TouchableOpacity style={styles.deleteAction} onPress={handleDelete}><Ionicons name="trash-outline" size={17} color="#DC2626" /><Text style={styles.deleteActionText}>削除</Text></TouchableOpacity>
          </View>}
        </View>

        {isDesktop ? (
          <View style={styles.detailGridDesktop}>
            <View style={styles.leftColumnDesktop}>
              {eventInfoBlock}
              {trafficBlock}
              {stayBlock}
            </View>
            <View style={styles.rightColumnDesktop}>
              {costBlock}
              {relatedBlock}
            </View>
          </View>
        ) : (
          <>
            {eventInfoBlock}
            {costBlock}
            {relatedBlock}
            {trafficBlock}
            {stayBlock}
          </>
        )}
        </View>
        <PublicFooter />
      </ScrollView>
      <AppTabBar
        active="archive"
        homePath={authenticated ? "/" : `/share/${share_id}`}
        archivePath={authenticated ? `/year/${new Date().getFullYear()}` : `/share/${share_id}/year/${new Date().getFullYear()}`}
      />
    </View>
  );
}

// PC表示のイベント情報/交通・宿泊（広い列）と費用/関連スケジュール（狭い列）で
// 幅の基準がずれないよう、両グリッドで同じ値を共有する
const DESKTOP_GRID_GAP = 20;
const DESKTOP_WIDE_COLUMN = { flex: 2 } as const;
const DESKTOP_NARROW_COLUMN = { flex: 1 } as const;

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
  },
  scrollPage: { flexGrow: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
    maxWidth: 1180,
    alignSelf: "center",
    width: "100%",
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginBottom: 18,
  },
  backLinkText: { color: colors.accent, fontSize: 14, fontWeight: "400" },
  heroCard: {
    flexDirection: "row",
    gap: 18,
    padding: 26,
    marginBottom: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...(Platform.OS === "web" ? ({ boxShadow: "0 14px 40px rgba(46,16,101,0.08)" } as any) : {}),
  },
  heroCardMobile: { padding: 18 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 16 },
  heroActionsVertical: { flexDirection: "column", alignItems: "stretch", gap: 8, marginTop: 0 },
  duplicateAction: { minHeight: 42, paddingHorizontal: 14, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: "#C4B5FD", borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  duplicateActionText: { color: colors.accentDark, fontSize: 14, fontWeight: "700" },
  editAction: { minHeight: 42, paddingHorizontal: 14, backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.accent, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  editActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: "700" },
  deleteAction: { minHeight: 42, paddingHorizontal: 14, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2", borderRadius: 9 },
  deleteActionText: { color: "#DC2626", fontSize: 14, fontWeight: "600" },
  heroBadges: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  mainTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.ink,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  heroMeta: { gap: 10, marginTop: 16 },
  timeMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  heroDateRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  metaText: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: "400", flexShrink: 1 },
  weekdayText: { color: colors.ink, fontWeight: "700", minWidth: 0, textAlign: "left", fontVariant: ["tabular-nums"], fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "monospace" },
  stayWeekdayText: { width: 52, minWidth: 52, textAlign: "left" },
  stayWeekdayTextMobile: { width: 42, minWidth: 42 },
  stayWeekdayTextNarrow: { width: 36, minWidth: 36, fontSize: 12 },
  saturdayText: { color: "#2563EB" },
  holidayText: { color: "#DC2626" },
  detailGridDesktop: { flexDirection: "row", alignItems: "flex-start", gap: DESKTOP_GRID_GAP },
  leftColumnDesktop: { ...DESKTOP_WIDE_COLUMN, minWidth: 0 },
  rightColumnDesktop: { ...DESKTOP_NARROW_COLUMN, minWidth: 0 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#37352f",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#37352f",
    letterSpacing: 0.3,
    alignSelf: "stretch",
  },
  relationContainer: {
    gap: 8,
  },
  relationCard: {
    backgroundColor: "#FAF9FF",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  relationCardContent: {
    gap: 4,
  },
  relationDate: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: "400",
    fontVariant: ["tabular-nums"],
    marginBottom: 6,
  },
  relationScheduleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  relationTime: { fontSize: 13, lineHeight: 20, color: colors.muted, fontVariant: ["tabular-nums"] },
  relationTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  relationArea: { alignSelf: "flex-start", marginLeft: 48, marginTop: 4, flexDirection: "row", gap: 7 },
  relationVenue: { marginLeft: 48, marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18 },
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
    flexDirection: "column",
    alignItems: "stretch",
    marginTop: 24,
    marginBottom: 12,
    width: "100%",
  },
  trafficCard: {
    marginBottom: 12,
    padding: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  stayCard: {
    marginBottom: 12,
    padding: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  trafficTag: { width: 82, alignItems: "flex-start" },
  trafficTagMobile: { width: 82 },
  stayIcon: { width: 54, height: 54, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  cardMain: { flex: 1, minWidth: 0, gap: 7 },
  cardRoute: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "400" },
  cardRouteBold: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  transportCardMobile: { flexWrap: "wrap", paddingRight: 38 },
  cardMainMobile: { flexBasis: "65%", flexGrow: 1 },
  cardPriceMobile: { marginLeft: "auto" },
  stayCardMobile: { flexWrap: "wrap", paddingRight: 38 },
  stayMainMobile: { flexBasis: "72%", flexGrow: 1 },
  stayCardActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  stayCardActionsMobile: { flexBasis: "100%", justifyContent: "flex-end", paddingRight: 2 },
  cardSubRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stayDateLabel: { width: 100, color: colors.muted, fontSize: 11, fontWeight: "400" },
  stayDateLabelMobile: { width: 82, flexShrink: 0 },
  stayDateLabelNarrow: { width: 72, fontSize: 10 },
  stayDatePartsMobile: { flexWrap: "nowrap", columnGap: 6 },
  stayDatePartsNarrow: { columnGap: 3 },
  cardChevronMobile: { position: "absolute", right: 12, top: "50%" },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  datePartsRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6, rowGap: 2 },
  dateValue: { fontSize: 14, color: "#37352f", fontVariant: ["tabular-nums"] },
  timeValue: { fontSize: 14, color: "#37352f", fontVariant: ["tabular-nums"] },
  cardPriceContainer: {
    alignItems: "flex-end",
  },
  cardPrice: {
    fontSize: 14,
    color: "#37352f",
    fontWeight: "700",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  totalCostText: { color: colors.accent, fontSize: 20, lineHeight: 26, fontWeight: "800", fontVariant: ["tabular-nums"], textAlign: "right" },
  cardMiles: {
    fontSize: 12,
    color: "#787774",
    marginTop: 2,
  },
  cardDetail: {
    fontSize: 14,
    color: "#37352f",
    marginLeft: 6,
    flex: 1,
  },
  breakfastTag: {
    color: "#6D28D9",
    backgroundColor: "#F5F3FF",
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "400",
  },
  breakfastTagOff: { color: "#77717F", backgroundColor: "#F0EEF2" },
  addAction: { alignSelf: "center", paddingHorizontal: 18, paddingVertical: 8 },
  addActionText: { color: colors.accent, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
