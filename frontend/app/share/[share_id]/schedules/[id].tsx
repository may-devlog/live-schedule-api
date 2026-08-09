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
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiUrl } from "../../../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../../../components/notion-property";
import { NotionTag } from "../../../../components/notion-tag";
import { getOptionColor } from "../../../../utils/get-option-color";
import { loadSelectOptions } from "../../../../utils/select-options-storage";
import type { Schedule } from "../../../HomeScreen";
import { maskHotelName } from "../../../../utils/mask-hotel-name";
import { CollapsibleDetailSection } from "../../../../components/CollapsibleDetailSection";
import { PublicFooter, PublicHeader, brand } from "../../../../components/GenBGTBrand";
import { isJapaneseHolidayDate } from "../../../../components/ScheduleCalendar";

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
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isMobile = width < 600;
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
  const [groupColor, setGroupColor] = useState<string | null>(null);
  
  // フィルタリング後のTargetとLineup
  const [filteredTarget, setFilteredTarget] = useState<string | null>(null);
  const [filteredLineup, setFilteredLineup] = useState<string | null>(null);
  const [filteredLineupOptions, setFilteredLineupOptions] = useState<Array<{ label: string; color: string }>>([]);
  
  // Related SchedulesのArea色情報
  const [relatedAreaColors, setRelatedAreaColors] = useState<Map<number, string>>(new Map());
  const [relatedStatusColors, setRelatedStatusColors] = useState<Map<number, string>>(new Map());
  
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
      const statusColorMap = new Map<number, string>();
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
    const weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()] ?? "";
    const tone = date.getDay() === 6 ? "saturday" as const : (date.getDay() === 0 || isJapaneseHolidayDate(datePart)) ? "holiday" as const : "normal" as const;
    return { date: datePart.replace(/-/g, "."), weekday, tone };
  }

  const scheduleDateDisplay = dateDisplay(schedule.date ?? schedule.datetime);

  return (
    <View style={styles.container}>
      <PublicHeader active="none" />
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
        <TouchableOpacity style={styles.backLink} onPress={() => router.push(`/share/${share_id}`)}>
          <Ionicons name="arrow-back" size={18} color={brand.violet} />
          <Text style={styles.backLinkText}>スケジュールに戻る</Text>
        </TouchableOpacity>

        {/* イベント概要 */}
        <View style={styles.heroCard}>
          <View style={styles.heroCopy}>
            <Text style={styles.mainTitle}>{schedule.title}</Text>
            <View style={styles.heroBadges}>
              {!!schedule.area && <NotionTag label={schedule.area} color={areaColor || undefined} />}
              {!!schedule.status && <NotionTag label={schedule.status} color={statusColor || undefined} />}
            </View>
            <View style={styles.heroMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={16} color={brand.violet} />
                <Text style={styles.metaText}>{scheduleDateDisplay.date} <Text style={[styles.weekdayText, scheduleDateDisplay.tone === "saturday" && styles.saturdayText, scheduleDateDisplay.tone === "holiday" && styles.holidayText]}>{scheduleDateDisplay.weekday}</Text></Text>
              </View>
              <View style={styles.timeMetaRow}>
                <Ionicons name="time-outline" size={16} color={brand.violet} />
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
                  <Ionicons name="location-outline" size={16} color={brand.violet} />
                  <Text style={styles.metaText}>{schedule.venue}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={[styles.primaryGrid, isDesktop && styles.primaryGridDesktop]}>
        <View style={[styles.primaryColumn, isDesktop && styles.eventColumnDesktop]}>
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
        </View>

        <View style={[styles.primaryColumn, isDesktop && styles.costColumnDesktop]}>
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
            value={formatCurrency(
              // チケット代 + ドリンク代 + 遠征費合計（往復フラグ考慮済み）
              (schedule.ticket_fee || 0) + 
              (schedule.drink_fee || 0) + 
              trafficSummaries.reduce((sum, traffic) => {
                return sum + (traffic.return_flag ? traffic.fare * 2 : traffic.fare);
              }, 0) + (schedule.stay_fee || 0)
            )}
            isLast={false}
          />
          </NotionPropertyBlock>
        </View>
        </View>

        <View style={[styles.secondaryGrid, isDesktop && styles.secondaryGridDesktop]}>
        <View style={[styles.secondaryColumn, isDesktop && styles.relatedColumnDesktop]}>
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
                        <Text style={styles.relationDate}>{dateDisplay(related.date).date} <Text style={[styles.weekdayText, dateDisplay(related.date).tone === "saturday" && styles.saturdayText, dateDisplay(related.date).tone === "holiday" && styles.holidayText]}>{dateDisplay(related.date).weekday}</Text></Text>
                      )}
                      <View style={styles.relationScheduleRow}>
                        {!!related.start && <Text style={styles.relationTime}>{related.start}</Text>}
                        <Text style={styles.relationTitle} numberOfLines={2}>{related.title}</Text>
                        <Ionicons name="chevron-forward" size={18} color={brand.muted} />
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
        </View>

        <View style={[styles.secondaryColumn, isDesktop && styles.trafficColumnDesktop]}>
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
                  onPress={() => router.push(`/share/${share_id}/traffic/${traffic.id}`)}
                >
                  {traffic.transportation && (
                    <View style={[styles.trafficTag, isMobile && styles.trafficTagMobile]}>
                      <NotionTag label={traffic.transportation} color={transportationColors.get(traffic.id) || undefined} />
                    </View>
                  )}
                  <View style={[styles.cardMain, isMobile && styles.cardMainMobile]}>
                    <Text style={styles.cardRouteBold}>{detailWithNotes}</Text>
                    <View style={styles.cardSubRow}>
                      <Ionicons name="calendar-outline" size={15} color={brand.violet} />
                      <Text style={styles.cardDate}>{dateDisplay(traffic.date).date} <Text style={[styles.weekdayText, dateDisplay(traffic.date).tone === "saturday" && styles.saturdayText, dateDisplay(traffic.date).tone === "holiday" && styles.holidayText]}>{dateDisplay(traffic.date).weekday}</Text></Text>
                    </View>
                  </View>
                  <View style={[styles.cardPriceContainer, isMobile && styles.cardPriceMobile]}>
                    <Text style={styles.cardPrice}>{formatCurrency(displayFare)}</Text>
                    {displayMiles !== null && displayMiles !== undefined && <Text style={styles.cardMiles}>{displayMiles}マイル</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={brand.muted} style={isMobile ? styles.cardChevronMobile : undefined} />
                </TouchableOpacity>
              );
            })
          )}
        </CollapsibleDetailSection>
        </View>

        <View style={[styles.secondaryColumn, isDesktop && styles.stayColumnDesktop]}>
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
                  onPress={() => router.push(`/share/${share_id}/stay/${stay.id}`)}
                >
                  <View style={[styles.stayIcon, isMobile && styles.stayIconMobile]}>
                    <Ionicons name="bed" size={28} color="#FFFFFF" />
                  </View>
                  <View style={[styles.cardMain, isMobile && styles.stayMainMobile]}>
                    <Text style={styles.cardRoute}>{maskHotelName(stay.hotel_name, false)}</Text>
                    <View style={styles.cardSubRow}>
                      <Ionicons name="calendar-outline" size={15} color={brand.violet} />
                      <Text style={styles.stayDateLabel}>チェックイン</Text>
                      <Text style={styles.cardDateTime}>{checkInFormatted.date} <Text style={[styles.weekdayText, checkInFormatted.tone === "saturday" && styles.saturdayText, checkInFormatted.tone === "holiday" && styles.holidayText]}>{checkInFormatted.weekday}</Text>{checkInFormatted.time ? ` ${checkInFormatted.time}` : ""}</Text>
                    </View>
                    <View style={styles.cardSubRow}>
                      <Ionicons name="calendar-outline" size={15} color={brand.violet} />
                      <Text style={styles.stayDateLabel}>チェックアウト</Text>
                      <Text style={styles.cardDateTime}>{checkOutFormatted.date} <Text style={[styles.weekdayText, checkOutFormatted.tone === "saturday" && styles.saturdayText, checkOutFormatted.tone === "holiday" && styles.holidayText]}>{checkOutFormatted.weekday}</Text>{checkOutFormatted.time ? ` ${checkOutFormatted.time}` : ""}</Text>
                    </View>
                  </View>
                  <Text style={[styles.breakfastTag, !stay.breakfast_flag && styles.breakfastTagOff]}>
                    {stay.breakfast_flag ? "朝食あり" : "朝食なし"}
                  </Text>
                  <Text style={styles.cardPrice}>{formatCurrency(stay.fee)}</Text>
                  <Ionicons name="chevron-forward" size={20} color={brand.muted} style={isMobile ? styles.cardChevronMobile : undefined} />
                </TouchableOpacity>
              );
            })
          )}
        </CollapsibleDetailSection>
        </View>
        </View>
        </View>
        <PublicFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.lavender,
  },
  scrollPage: { flexGrow: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
    maxWidth: 1180,
    flexGrow: 1,
    minHeight: '100%',
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
  backLinkText: { color: brand.violet, fontSize: 14, fontWeight: "400" },
  heroCard: {
    flexDirection: "row",
    gap: 18,
    padding: 26,
    marginBottom: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    ...(Platform.OS === "web" ? ({ boxShadow: "0 14px 40px rgba(46,16,101,0.08)" } as any) : {}),
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroBadges: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  mainTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: brand.ink,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  heroMeta: { gap: 10, marginTop: 16 },
  timeMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  metaText: { color: brand.ink, fontSize: 14, lineHeight: 21, fontWeight: "400", flexShrink: 1 },
  weekdayText: { color: brand.ink, fontWeight: "700", minWidth: 30, textAlign: "center", fontVariant: ["tabular-nums"], fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "monospace" },
  saturdayText: { color: "#2563EB" },
  holidayText: { color: "#DC2626" },
  primaryGrid: { gap: 20 },
  primaryGridDesktop: { flexDirection: "row", alignItems: "flex-start" },
  primaryColumn: { minWidth: 0 },
  eventColumnDesktop: { flex: 2 },
  costColumnDesktop: { flex: 1 },
  secondaryGrid: { gap: 20 },
  secondaryGridDesktop: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" },
  secondaryColumn: { minWidth: 0 },
  trafficColumnDesktop: { order: 1, flexGrow: 0, flexBasis: "66%", marginTop: -92 },
  relatedColumnDesktop: { order: 2, flexGrow: 1, flexBasis: "30%" },
  stayColumnDesktop: { order: 3, flexGrow: 0, flexBasis: "66%" },
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
    color: brand.ink,
    fontWeight: "400",
    fontVariant: ["tabular-nums"],
    marginBottom: 6,
  },
  relationScheduleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  relationTime: { fontSize: 13, lineHeight: 20, color: brand.muted, fontVariant: ["tabular-nums"] },
  relationTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: brand.ink,
  },
  relationArea: { alignSelf: "flex-start", marginLeft: 48, marginTop: 4, flexDirection: "row", gap: 7 },
  relationVenue: { marginLeft: 48, marginTop: 4, color: brand.muted, fontSize: 12, lineHeight: 18 },
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
  stayIcon: { width: 54, height: 54, borderRadius: 8, backgroundColor: brand.violet, alignItems: "center", justifyContent: "center" },
  cardMain: { flex: 1, minWidth: 0, gap: 7 },
  cardRoute: { color: brand.ink, fontSize: 14, lineHeight: 20, fontWeight: "400" },
  cardRouteBold: { color: brand.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  transportCardMobile: { flexWrap: "wrap", paddingRight: 38 },
  cardMainMobile: { flexBasis: "65%", flexGrow: 1 },
  cardPriceMobile: { marginLeft: "auto" },
  stayCardMobile: { flexWrap: "wrap", paddingRight: 38 },
  stayIconMobile: { width: 44, height: 44 },
  stayMainMobile: { flexBasis: "72%", flexGrow: 1 },
  cardSubRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stayDateLabel: { width: 100, color: brand.muted, fontSize: 11, fontWeight: "400" },
  cardChevronMobile: { position: "absolute", right: 12, top: "50%" },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 14,
    color: "#37352f",
    flex: 1,
    fontVariant: ["tabular-nums"],
  },
  cardDateTime: {
    fontSize: 14,
    color: "#37352f",
    flex: 1,
    fontVariant: ["tabular-nums"],
  },
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
});
