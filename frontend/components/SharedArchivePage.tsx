import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Schedule } from "../app/HomeScreen";
import { AppHeader, PublicFooter, PublicHeader, brand } from "./GenBGTBrand";
import { AppTabBar } from "./AppTabBar";
import { NotionTag } from "./notion-tag";
import { getOptionColorSync, preloadOptionColors } from "../utils/get-option-color";
import { fetchAreaColors } from "../utils/fetch-area-colors";
import { isJapaneseHolidayDate } from "./ScheduleCalendar";
import { groupSchedulesNested, type GroupingField, type MainGroupingField, type SubGroupingField } from "../utils/group-schedules";
import { loadSelectOptionsMap } from "../utils/load-select-options-map";
import { loadSelectOptions, loadStaySelectOptions } from "../utils/select-options-storage";
import { fetchTrafficBySchedule } from "../utils/fetch-traffic-by-schedule";
import { calculateTotalCostWithReturnFlag, type TrafficBySchedule } from "../utils/calculate-total-cost";
import { fetchReadings, compareByReading } from "../utils/kana-reading";

type Props = {
  shareId?: string;
  authenticated?: boolean;
  initialYear: string;
  fetchSchedules: (year: string) => Promise<Schedule[]>;
  fetchStays?: (year: string) => Promise<StaySummary[]>;
  fetchAvailableYears: () => Promise<number[]>;
  onSelectYear: (year: string) => void;
  onSchedulePress: (id: number) => void;
  onStayPress?: (id: number) => void;
  // グループ化機能が使えるか（プレミアムプラン限定機能。無料プランは並び順のみ）
  // 省略時はtrue（共有/公開ページは所有者が有料プランでない限り公開できないため常にフル機能）
  canUseGrouping?: boolean;
};

type StaySummary = {
  id: number;
  check_in: string;
  check_out: string;
  hotel_name: string;
  website?: string | null;
  fee: number;
  breakfast_flag: boolean;
  status: string;
};

const shadow = Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(46,16,101,0.08)" } as any) : {};
const deferredCardRendering = Platform.OS === "web" ? ({ contentVisibility: "auto", containIntrinsicSize: "108px" } as any) : {};
type SortOrder = "asc" | "desc";
type MainSortMode = "default" | "kana";

// メイン・サブどちらのグルーピングでも同じ選択肢を使えるようにする
const GROUPING_FIELD_OPTIONS: [GroupingField, string][] = [
  ["none", "なし"],
  ["group", "グループ"],
  ["category", "カテゴリ"],
  ["area", "エリア"],
  ["target", "お目当て"],
  ["lineup", "出演者"],
  ["seller", "販売元"],
  ["status", "ステータス"],
];
const STAY_GROUPING_OPTIONS: [string, string][] = [["none", "なし"], ["website", "予約サイト"], ["status", "ステータス"]];

// メイン/サブの一方で選択されている項目は、もう一方では選べないようにする
// （同じ項目の重複選択に加え、お目当て⇄出演者の組み合わせも禁止）
const isGroupingOptionDisabled = (value: GroupingField, other: GroupingField) =>
  value !== "none" &&
  (value === other || (value === "target" && other === "lineup") || (value === "lineup" && other === "target"));

// グループ化のチップ行。選択肢が幅に収まらない場合は折り返さず横スクロールで1行に収める
function GroupingChipsRow({ label, options, selected, onSelect, isDisabled }: {
  label?: string;
  options: [string, string][];
  selected: string;
  onSelect: (value: string) => void;
  isDisabled?: (value: string) => boolean;
}) {
  const chips = options.map(([value, text]) => {
    const disabled = isDisabled?.(value) ?? false;
    return (
      <TouchableOpacity
        key={value}
        disabled={disabled}
        style={[styles.groupingButton, selected === value && styles.groupingButtonActive, disabled && styles.groupingButtonDisabled]}
        onPress={() => onSelect(value)}
      >
        <Text style={[styles.groupingButtonText, selected === value && styles.groupingButtonTextActive, disabled && styles.groupingButtonTextDisabled]}>{text}</Text>
      </TouchableOpacity>
    );
  });
  return (
    <View style={styles.groupingRow}>
      {label && <Text style={styles.groupingLabel}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupingChipsScroll} contentContainerStyle={styles.groupingChipsScrollContent}>
        {chips}
      </ScrollView>
    </View>
  );
}

function scheduleDate(schedule: Schedule) {
  return schedule.datetime || schedule.date || "";
}

function compareSchedules(a: Schedule, b: Schedule, order: SortOrder) {
  const comparison = scheduleDate(a).localeCompare(scheduleDate(b));
  return order === "asc" ? comparison : -comparison;
}

function groupBoundary(schedules: Schedule[], order: SortOrder) {
  let boundary = "";
  schedules.forEach((schedule) => {
    const value = scheduleDate(schedule);
    if (!boundary || (order === "asc" ? value < boundary : value > boundary)) boundary = value;
  });
  return boundary;
}

type ArchiveDateParts = { month: number; day: string; weekday: string; tone: "sat" | "holiday" | "normal" };
const datePartsCache = new Map<string, ArchiveDateParts>();

function dateParts(raw: string): ArchiveDateParts {
  const key = raw.slice(0, 10);
  const cached = datePartsCache.get(key);
  if (cached) return cached;
  const [year, month, day] = raw.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const holiday = isJapaneseHolidayDate(raw);
  const weekday = `${["日", "月", "火", "水", "木", "金", "土"][date.getDay()]}${holiday ? "・祝" : ""}`;
  const tone = date.getDay() === 6 ? "sat" : (date.getDay() === 0 || holiday) ? "holiday" : "normal";
  const result: ArchiveDateParts = { month, day: String(day).padStart(2, "0"), weekday, tone };
  datePartsCache.set(key, result);
  return result;
}

export function SharedArchivePage({ shareId, authenticated = false, initialYear, fetchSchedules, fetchStays, fetchAvailableYears, onSelectYear, onSchedulePress, onStayPress, canUseGrouping = true }: Props) {
  const { width } = useWindowDimensions();
  const mobile = width < 720;
  // グループ化チップ行と並び順コントロールを横並びにすると、この間の幅では
  // チップ側が窮屈になり並び順と衝突して見えるため、その帯ではモバイルと同じ縦積みにする
  const stackedControls = width < 1180;
  const [year, setYear] = useState(initialYear);
  const [years, setYears] = useState<number[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [stays, setStays] = useState<StaySummary[]>([]);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  const [trafficBySchedule, setTrafficBySchedule] = useState<TrafficBySchedule>(new Map());
  const [selectOptionsMap, setSelectOptionsMap] = useState<Map<string, Map<string, number>>>(new Map());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setColorsVersion] = useState(0);
  const [websiteColorMap, setWebsiteColorMap] = useState<Map<string, string>>(new Map());
  const [stayStatusColorMap, setStayStatusColorMap] = useState<Map<string, string>>(new Map());
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [mainSortMenuOpen, setMainSortMenuOpen] = useState(false);
  const [mainGrouping, setMainGrouping] = useState<MainGroupingField>("none");
  const [subGrouping, setSubGrouping] = useState<SubGroupingField>("none");
  const [archiveType, setArchiveType] = useState<"event" | "stay">("event");
  const [stayGrouping, setStayGrouping] = useState<"none" | "website" | "status">("none");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [mainSortMode, setMainSortMode] = useState<MainSortMode>("default");
  const [kanaReadings, setKanaReadings] = useState<Map<string, string>>(new Map());

  useEffect(() => { setYear(initialYear); }, [initialYear]);

  useEffect(() => {
    let active = true;
    const optionOwner = authenticated ? undefined : shareId;
    Promise.all([fetchAvailableYears(), fetchSchedules(year), fetchStays ? fetchStays(year) : Promise.resolve([])])
      .then(([available, data, stayData]) => {
        if (!active) return;
        const sorted = [...data].sort((a, b) => compareSchedules(a, b, "asc"));
        setYears(available);
        setSchedules(sorted);
        setStays(stayData);
        setTrafficBySchedule(new Map());
        setAreaColors(new Map());
        setError(null);
        setLoading(false);

        // Totals, option ordering and colors enrich the cards but are not
        // required to show the archive. Load them without blocking year changes.
        loadSelectOptionsMap(optionOwner).then((optionMaps) => {
          if (active) setSelectOptionsMap(optionMaps.orderMap);
        }).catch(() => undefined);
        Promise.all([
          Promise.all([
            loadSelectOptions("TARGETS", optionOwner).then((options) => preloadOptionColors(options, "TARGETS")),
            loadSelectOptions("GROUPS", optionOwner).then((options) => preloadOptionColors(options, "GROUPS")),
            loadSelectOptions("CATEGORIES", optionOwner).then((options) => preloadOptionColors(options, "CATEGORIES")),
            loadSelectOptions("AREAS", optionOwner).then((options) => preloadOptionColors(options, "AREAS")),
            loadSelectOptions("SELLERS", optionOwner).then((options) => preloadOptionColors(options, "SELLERS")),
            loadSelectOptions("STATUSES", optionOwner).then((options) => preloadOptionColors(options, "STATUSES")),
            loadStaySelectOptions("WEBSITE", optionOwner).then((options) => {
              preloadOptionColors(options, "WEBSITE");
              if (active) {
                const map = new Map<string, string>();
                options.forEach((opt) => map.set(opt.label, getOptionColorSync(opt.label, "WEBSITE")));
                setWebsiteColorMap(map);
              }
            }),
            loadStaySelectOptions("STATUS", optionOwner).then((options) => {
              preloadOptionColors(options, "STAY_STATUS");
              if (active) {
                const map = new Map<string, string>();
                options.forEach((opt) => map.set(opt.label, getOptionColorSync(opt.label, "STAY_STATUS")));
                setStayStatusColorMap(map);
              }
            }),
          ]),
          fetchTrafficBySchedule(sorted, authenticated, shareId),
          fetchAreaColors(sorted),
        ]).then(([, trafficMap, colors]) => {
          if (!active) return;
          setTrafficBySchedule(trafficMap);
          setAreaColors(colors);
          setColorsVersion((v) => v + 1);
        }).catch(() => undefined);
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message ?? "アーカイブを取得できませんでした");
        setLoading(false);
      });
    return () => { active = false; };
  }, [year, shareId, authenticated, fetchAvailableYears, fetchSchedules, fetchStays]);

  const visibleSchedules = useMemo(() => {
    const visible = subGrouping === "status" ? schedules : schedules.filter((item) => item.status !== "Canceled");
    return [...visible].sort((a, b) => compareSchedules(a, b, sortOrder));
  }, [schedules, subGrouping, sortOrder]);

  // 年チップの直接表示分（本年+前年の2年分と未来分）と、「…」の中に隠す過去分に分ける
  const { visibleYears, olderYears, selectedIsOlder } = useMemo(() => {
    const currentCalendarYear = new Date().getFullYear();
    const recentThreshold = currentCalendarYear - 1;
    const sorted = [...years].sort((a, b) => b - a);
    const future = sorted.filter((y) => y > currentCalendarYear);
    const recent = sorted.filter((y) => y <= currentCalendarYear && y >= recentThreshold);
    const older = sorted.filter((y) => y < recentThreshold);
    return {
      visibleYears: [...future, ...recent],
      olderYears: older,
      selectedIsOlder: year !== "ALL" && older.includes(Number(year)),
    };
  }, [years, year]);

  const monthGroups = useMemo(() => {
    const map = new Map<string, { label: string; data: Schedule[] }>();
    visibleSchedules.forEach((item) => {
      const raw = scheduleDate(item);
      const itemYear = raw.slice(0, 4);
      const month = Number(raw.slice(5, 7));
      const key = `${itemYear}-${String(month).padStart(2, "0")}`;
      const label = year === "ALL" ? `${itemYear}年${month}月` : `${month}月`;
      const current = map.get(key)?.data ?? [];
      map.set(key, { label, data: [...current, item] });
    });
    return Array.from(map.entries())
      .sort(([keyA], [keyB]) => sortOrder === "asc" ? keyA.localeCompare(keyB) : keyB.localeCompare(keyA))
      .map(([key, value]) => ({ key, ...value }));
  }, [visibleSchedules, sortOrder, year]);

  const groupedSchedules = useMemo(() => {
    const grouped = groupSchedulesNested(visibleSchedules, mainGrouping, subGrouping, selectOptionsMap);
    const compareGroups = (a: Schedule[], b: Schedule[]) => {
      const comparison = groupBoundary(a, sortOrder).localeCompare(groupBoundary(b, sortOrder));
      return sortOrder === "asc" ? comparison : -comparison;
    };
    const sorted = grouped
      .map((mainGroup) => ({
        ...mainGroup,
        subGroups: [...mainGroup.subGroups]
          .map((subGroup) => ({ ...subGroup, data: [...subGroup.data].sort((a, b) => compareSchedules(a, b, sortOrder)) }))
          .sort((a, b) => compareGroups(a.data, b.data)),
      }))
      .sort((a, b) => compareGroups(a.subGroups.flatMap((group) => group.data), b.subGroups.flatMap((group) => group.data)));

    if (mainGrouping === "target" || mainGrouping === "lineup") {
      return sorted.sort((a, b) => {
        if (a.title === "未設定") return 1;
        if (b.title === "未設定") return -1;
        if (mainSortMode === "kana") return compareByReading(a.title, b.title, kanaReadings);

        const schedulesA = a.subGroups.flatMap((group) => group.data);
        const schedulesB = b.subGroups.flatMap((group) => group.data);
        const comparison = groupBoundary(schedulesA, "asc").localeCompare(groupBoundary(schedulesB, "asc"));
        return comparison || a.title.localeCompare(b.title, "ja");
      });
    }
    return sorted;
  }, [visibleSchedules, mainGrouping, subGrouping, selectOptionsMap, sortOrder, mainSortMode, kanaReadings]);

  // 五十音順表示のときだけ、グループ名（出演者名）の読み仮名をバックエンドから解決する
  useEffect(() => {
    if (mainSortMode !== "kana" || (mainGrouping !== "target" && mainGrouping !== "lineup")) return;
    const titles = Array.from(
      new Set(
        groupSchedulesNested(visibleSchedules, mainGrouping, subGrouping, selectOptionsMap)
          .map((group) => group.title)
          .filter((title) => title !== "未設定")
      )
    );
    if (titles.length === 0) return;
    let cancelled = false;
    fetchReadings(titles).then((readings) => {
      if (!cancelled) setKanaReadings(new Map(readings));
    });
    return () => {
      cancelled = true;
    };
  }, [mainSortMode, mainGrouping, subGrouping, visibleSchedules, selectOptionsMap]);

  const sortedStays = useMemo(
    () => [...stays].sort((a, b) => sortOrder === "asc" ? a.check_in.localeCompare(b.check_in) : b.check_in.localeCompare(a.check_in)),
    [stays, sortOrder]
  );

  const stayGroups = useMemo(() => {
    const groups = new Map<string, StaySummary[]>();
    sortedStays.forEach((stay) => {
      const stayYear = stay.check_in.slice(0, 4);
      const month = Number(stay.check_in.slice(5, 7));
      const monthLabel = year === "ALL" ? `${stayYear}年${month}月` : `${month}月`;
      const key = stayGrouping === "website" ? (stay.website || "未設定") : stayGrouping === "status" ? (stay.status || "未設定") : monthLabel;
      groups.set(key, [...(groups.get(key) ?? []), stay]);
    });
    return Array.from(groups.entries()).sort(([, itemsA], [, itemsB]) => {
      const boundary = (items: StaySummary[]) => sortOrder === "asc" ? items[0]?.check_in ?? "" : items[items.length - 1]?.check_in ?? "";
      const comparison = boundary(itemsA).localeCompare(boundary(itemsB));
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [sortedStays, stayGrouping, sortOrder, year]);

  const toggleSection = (key: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const totalCostBySchedule = useMemo(() => {
    const totals = new Map<number, number>();
    schedules.forEach((schedule) => {
      totals.set(schedule.id, calculateTotalCostWithReturnFlag(schedule, trafficBySchedule) ?? 0);
    });
    return totals;
  }, [schedules, trafficBySchedule]);

  const totalCost = (schedule: Schedule) => totalCostBySchedule.get(schedule.id) ?? 0;

  const groupColor = (field: MainGroupingField | SubGroupingField, title: string) => {
    const optionTypes = {
      target: "TARGETS",
      lineup: "TARGETS",
      group: "GROUPS",
      category: "CATEGORIES",
      area: "AREAS",
      seller: "SELLERS",
      status: "STATUSES",
    } as const;
    if (field === "none" || title === "未設定") return null;
    if (field === "group" && !selectOptionsMap.get("group")?.has(title)) return null;
    return getOptionColorSync(title, optionTypes[field]);
  };

  const renderCard = (item: Schedule) => {
    const parts = dateParts(item.date ?? item.datetime);
    const cost = totalCost(item);
    return (
      <TouchableOpacity key={item.id} style={[styles.card, mobile && styles.cardMobile]} onPress={() => onSchedulePress(item.id)}>
        <View style={[styles.dateBlock, mobile && styles.dateBlockMobile]}>
          <Text style={[styles.dateText, mobile && styles.dateTextMobile]}>{String(parts.month).padStart(2, "0")}.{parts.day}</Text>
          <Text style={[styles.weekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text>
        </View>
        {!mobile && <View style={styles.dateDivider} />}
        <View style={styles.cardBody}>
          {mobile && <View style={styles.mobileDateRow}><View style={styles.mobileDateLeft}><Text style={styles.mobileDate}>{String(parts.month).padStart(2, "0")}.{parts.day}</Text><Text style={[styles.mobileWeekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text></View>{cost > 0 && mainGrouping !== "lineup" && <Text style={styles.cardCost}>¥{cost.toLocaleString()}</Text>}</View>}
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            {!mobile && cost > 0 && mainGrouping !== "lineup" && <Text style={styles.cardCost}>¥{cost.toLocaleString()}</Text>}
          </View>
          <View style={styles.archiveTags}>
            {!!item.area && subGrouping !== "area" && <NotionTag label={item.area} color={areaColors.get(item.id) || getOptionColorSync(item.area, "AREAS")} />}
            {!!item.status && subGrouping !== "status" && <NotionTag label={item.status} color={getOptionColorSync(item.status, "STATUSES")} />}
          </View>
          {!!item.venue && <Text style={styles.venue} numberOfLines={1}>{item.venue}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={24} color={brand.violet} />
      </TouchableOpacity>
    );
  };

  const renderStayCard = (stay: StaySummary) => {
    const parts = dateParts(stay.check_in);
    return (
      <TouchableOpacity key={stay.id} style={[styles.card, mobile && styles.cardMobile]} onPress={() => onStayPress?.(stay.id)}>
        <View style={[styles.dateBlock, mobile && styles.dateBlockMobile]}>
          <Text style={styles.dateText}>{String(parts.month).padStart(2, "0")}.{parts.day}</Text>
          <Text style={[styles.weekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text>
        </View>
        {!mobile && <View style={styles.dateDivider} />}
        <View style={styles.cardBody}>
          {mobile && <View style={styles.mobileDateRow}><View style={styles.mobileDateLeft}><Text style={styles.mobileDate}>{String(parts.month).padStart(2, "0")}.{parts.day}</Text><Text style={[styles.mobileWeekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text></View><Text style={styles.cardCost}>¥{stay.fee.toLocaleString()}</Text></View>}
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={2}>{stay.hotel_name}</Text>
            {!mobile && <Text style={styles.cardCost}>¥{stay.fee.toLocaleString()}</Text>}
          </View>
          <View style={styles.archiveTags}>
            {!!stay.website && stayGrouping !== "website" && <NotionTag label={stay.website} color={websiteColorMap.get(stay.website) ?? getOptionColorSync(stay.website, "WEBSITE")} />}
            <View style={[styles.breakfastBadge, !stay.breakfast_flag && styles.breakfastBadgeOff]}>
              <Text style={[styles.breakfastLabel, !stay.breakfast_flag && styles.breakfastLabelOff]}>{stay.breakfast_flag ? "朝食あり" : "朝食なし"}</Text>
            </View>
            {!!stay.status && stayGrouping !== "status" && <NotionTag label={stay.status} color={stayStatusColorMap.get(stay.status) ?? getOptionColorSync(stay.status, "STAY_STATUS")} />}
          </View>
          <Text style={styles.venue}>{stay.check_in.replace(/-/g, ".")} → {stay.check_out.replace(/-/g, ".")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={brand.violet} />
      </TouchableOpacity>
    );
  };

  const selectYear = (next: string) => {
    setLoading(true);
    setYear(next);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const nextPath = authenticated ? `/year/${next}` : `/share/${shareId}/year/${next}`;
      const replaceState = (window as any).__genbgtReplaceState as typeof window.history.replaceState | undefined;
      (replaceState ?? window.history.replaceState.bind(window.history))(window.history.state, "", nextPath);
    } else {
      onSelectYear(next);
    }
  };

  return (
    <View style={styles.page}>
      {authenticated ? <AppHeader active="archive" /> : <PublicHeader active="archive" homePath={`/share/${shareId}`} archivePath={`/share/${shareId}/year/${year}`} />}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.main, mobile && styles.mainMobile]}>
          <Text style={[styles.title, mobile && styles.titleMobile]}>{year} ARCHIVE</Text>
          {!!fetchStays && <View style={styles.archiveTabs}>
            <TouchableOpacity style={[styles.archiveTab, archiveType === "event" && styles.archiveTabActive]} onPress={() => setArchiveType("event")}><Text style={[styles.archiveTabText, archiveType === "event" && styles.archiveTabTextActive]}>イベント</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.archiveTab, archiveType === "stay" && styles.archiveTabActive]} onPress={() => setArchiveType("stay")}><Text style={[styles.archiveTabText, archiveType === "stay" && styles.archiveTabTextActive]}>宿泊</Text></TouchableOpacity>
          </View>}
          <View style={styles.yearChipsRow}>
            <TouchableOpacity style={[styles.yearChip, year === "ALL" && styles.yearChipActive]} onPress={() => selectYear("ALL")}>
              <Text style={[styles.yearChipText, year === "ALL" && styles.yearChipTextActive]}>ALL</Text>
            </TouchableOpacity>
            {visibleYears.map((y) => (
              <TouchableOpacity key={y} style={[styles.yearChip, String(y) === year && styles.yearChipActive]} onPress={() => selectYear(String(y))}>
                <Text style={[styles.yearChipText, String(y) === year && styles.yearChipTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
            {olderYears.length > 0 && (
              <View style={styles.yearMoreWrap}>
                <TouchableOpacity style={[styles.yearChip, selectedIsOlder && styles.yearChipActive]} onPress={() => setYearMenuOpen((open) => !open)}>
                  <Text style={[styles.yearChipText, selectedIsOlder && styles.yearChipTextActive]}>{selectedIsOlder ? year : "…"}</Text>
                </TouchableOpacity>
                {yearMenuOpen && <View style={styles.yearMenu}>
                  {olderYears.map((y) => <TouchableOpacity key={y} style={styles.yearOption} onPress={() => { setYearMenuOpen(false); selectYear(String(y)); }}><Text style={[styles.yearOptionText, String(y) === year && styles.yearOptionTextActive]}>{y}</Text></TouchableOpacity>)}
                </View>}
              </View>
            )}
          </View>

          <View style={[styles.archiveControls, stackedControls && styles.archiveControlsMobile]}>
            {canUseGrouping && (archiveType === "event" ? <View style={styles.groupingPanel}>
              <GroupingChipsRow label="メイン" options={GROUPING_FIELD_OPTIONS} selected={mainGrouping} onSelect={(value) => setMainGrouping(value as MainGroupingField)} isDisabled={(value) => isGroupingOptionDisabled(value as GroupingField, subGrouping)} />
              <GroupingChipsRow label="サブ" options={GROUPING_FIELD_OPTIONS} selected={subGrouping} onSelect={(value) => setSubGrouping(value as SubGroupingField)} isDisabled={(value) => isGroupingOptionDisabled(value as GroupingField, mainGrouping)} />
            </View> : <View style={styles.groupingPanel}>
              <GroupingChipsRow options={STAY_GROUPING_OPTIONS} selected={stayGrouping} onSelect={(value) => setStayGrouping(value as "none" | "website" | "status")} />
            </View>)}
            <View style={[styles.sortControls, stackedControls && styles.sortControlsMobile, !canUseGrouping && !stackedControls && styles.sortControlsSolo]}>
              {(mainGrouping === "target" || mainGrouping === "lineup") && archiveType === "event" && <View style={styles.compactSelectWrap}>
                <Text style={styles.compactSelectLabel}>グループ順</Text>
                <TouchableOpacity style={styles.compactSelect} onPress={() => { setMainSortMenuOpen((open) => !open); setSortMenuOpen(false); }}>
                  <Text style={styles.compactSelectText}>{mainSortMode === "default" ? "デフォルト" : "五十音順"}</Text>
                  <Ionicons name={mainSortMenuOpen ? "chevron-up" : "chevron-down"} size={16} color={brand.muted} />
                </TouchableOpacity>
                {mainSortMenuOpen && <View style={styles.compactSelectMenu}>
                  {([['default', 'デフォルト'], ['kana', '五十音順']] as const).map(([value, label]) => <TouchableOpacity key={value} style={styles.compactSelectOption} onPress={() => { setMainSortMode(value); setMainSortMenuOpen(false); }}><Text style={[styles.compactSelectOptionText, mainSortMode === value && styles.compactSelectOptionActive]}>{label}</Text></TouchableOpacity>)}
                </View>}
              </View>}
              <View style={styles.compactSelectWrap}>
                <Text style={styles.compactSelectLabel}>並び順</Text>
                <TouchableOpacity style={styles.compactSelect} onPress={() => { setSortMenuOpen((open) => !open); setMainSortMenuOpen(false); }}>
                  <Text style={styles.compactSelectText}>{sortOrder === "asc" ? "昇順" : "降順"}</Text>
                  <Ionicons name={sortMenuOpen ? "chevron-up" : "chevron-down"} size={16} color={brand.muted} />
                </TouchableOpacity>
                {sortMenuOpen && <View style={styles.compactSelectMenu}>
                  {([['asc', '昇順'], ['desc', '降順']] as const).map(([value, label]) => <TouchableOpacity key={value} style={styles.compactSelectOption} onPress={() => { setSortOrder(value); setSortMenuOpen(false); }}><Text style={[styles.compactSelectOptionText, sortOrder === value && styles.compactSelectOptionActive]}>{label}</Text></TouchableOpacity>)}
                </View>}
              </View>
            </View>
          </View>

          {loading ? <ActivityIndicator color={brand.violet} style={styles.loader} /> : error ? <Text style={styles.error}>{error}</Text> : archiveType === "stay" ? (
            stayGroups.map(([title, items]) => {
              const key = `stay-${title}`;
              const collapsed = collapsedSections.has(key);
              const color = stayGrouping === "website" ? (websiteColorMap.get(title) ?? getOptionColorSync(title, "WEBSITE")) : stayGrouping === "status" ? (stayStatusColorMap.get(title) ?? getOptionColorSync(title, "STAY_STATUS")) : null;
              return <View key={key} style={styles.monthSection}>
                {stayGrouping === "none" ? <Text style={styles.monthTitle}>{title}</Text> : <TouchableOpacity style={styles.groupHeader} onPress={() => toggleSection(key)}><Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={18} color={brand.muted} style={styles.groupChevron} />{color ? <View style={styles.groupTagWrap}><NotionTag label={title} color={color} /></View> : <Text style={styles.groupTitle}>{title}</Text>}<Text style={styles.groupCount}>({items.length})</Text></TouchableOpacity>}
                {(stayGrouping === "none" || !collapsed) && <View style={styles.cardList}>{items.map(renderStayCard)}</View>}
              </View>;
            })
          ) : (
            mainGrouping === "none" && subGrouping === "none" ? monthGroups.map((group) => (
              <View key={group.key} style={styles.monthSection}>
                <Text style={styles.monthTitle}>{group.label}</Text>
                <View style={styles.cardList}>{group.data.map(renderCard)}</View>
              </View>
            )) : groupedSchedules.map((mainGroup) => {
              const mainKey = `main-${mainGroup.title}`;
              const mainCollapsed = collapsedSections.has(mainKey);
              const mainCount = mainGroup.subGroups.reduce((sum, group) => sum + group.data.length, 0);
              const mainTotal = mainGroup.subGroups.reduce((sum, group) => sum + group.data.reduce((subSum, item) => subSum + totalCost(item), 0), 0);
              const mainColor = groupColor(mainGrouping, mainGroup.title);
              return (
                <View key={mainKey} style={styles.groupSection}>
                  {!!mainGroup.title && <>
                    <TouchableOpacity style={styles.groupHeader} onPress={() => toggleSection(mainKey)}>
                      <Ionicons name={mainCollapsed ? "chevron-forward" : "chevron-down"} size={18} color={brand.muted} style={styles.groupChevron} />
                      {mainColor ? <View style={styles.groupTagWrap}><NotionTag label={mainGroup.title} color={mainColor} /></View> : <Text style={styles.groupTitle}>{mainGroup.title}</Text>}
                      <Text style={styles.groupCount}>({mainCount})</Text>
                    </TouchableOpacity>
                    {!mainCollapsed && mainTotal > 0 && mainGrouping !== "lineup" && <View style={styles.groupTotal}><Text style={styles.groupTotalText}>¥{mainTotal.toLocaleString()}</Text></View>}
                  </>}
                  {(!mainGroup.title || !mainCollapsed) && mainGroup.subGroups.map((subGroup) => {
                    const subKey = `sub-${mainGroup.title}-${subGroup.title}`;
                    const subCollapsed = collapsedSections.has(subKey);
                    const subTotal = subGroup.data.reduce((sum, item) => sum + totalCost(item), 0);
                    const subColor = groupColor(subGrouping, subGroup.title);
                    return (
                      <View key={subKey}>
                        {!!subGroup.title && <>
                          <TouchableOpacity style={[styles.groupHeader, !!mainGroup.title && styles.subGroupHeader]} onPress={() => toggleSection(subKey)}>
                            <Ionicons name={subCollapsed ? "chevron-forward" : "chevron-down"} size={16} color={brand.muted} style={styles.groupChevron} />
                            {subColor ? <View style={styles.groupTagWrap}><NotionTag label={subGroup.title} color={subColor} /></View> : <Text style={styles.subGroupTitle}>{subGroup.title}</Text>}
                            <Text style={styles.groupCount}>({subGroup.data.length})</Text>
                          </TouchableOpacity>
                          {!subCollapsed && subTotal > 0 && mainGrouping !== "lineup" && <View style={[styles.groupTotal, !!mainGroup.title && styles.subGroupTotal]}><Text style={styles.groupTotalText}>¥{subTotal.toLocaleString()}</Text></View>}
                        </>}
                        {(!subGroup.title || !subCollapsed) && <View style={[styles.cardList, styles.groupCardList]}>{subGroup.data.map(renderCard)}</View>}
                      </View>
                    );
                  })}
                </View>
              );
            })
          )}
        </View>
        <PublicFooter />
      </ScrollView>
      <AppTabBar
        active="archive"
        homePath={authenticated ? '/' : `/share/${shareId}`}
        archivePath={authenticated ? `/year/${year}` : `/share/${shareId}/year/${year}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brand.lavender },
  scrollContent: { flexGrow: 1 },
  // flexGrowで残り余白を吸収し、絞り込み結果が0件など中身が短いときにフッターが
  // 画面途中に浮き上がらず、常に最下部に収まるようにする
  main: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 48, paddingTop: 34, paddingBottom: 54, flexGrow: 1 },
  mainMobile: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 36 },
  back: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", marginBottom: 22 },
  backText: { color: brand.violet, fontSize: 14, fontWeight: "700" },
  title: { color: brand.plum, fontSize: 48, lineHeight: 56, fontWeight: "800", letterSpacing: -1.2 },
  titleMobile: { fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  archiveTabs: { marginTop: 22, flexDirection: "row", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: brand.border },
  archiveTab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  archiveTabActive: { backgroundColor: brand.plum },
  archiveTabText: { color: brand.ink, fontSize: 14, fontWeight: "500" },
  archiveTabTextActive: { color: "#FFFFFF", fontWeight: "700" },
  yearChipsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 22, marginBottom: 16, zIndex: 5 },
  yearChip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: "transparent", backgroundColor: brand.lavender, alignItems: "center", justifyContent: "center" },
  yearChipActive: { backgroundColor: "#FFFFFF", borderColor: brand.violet },
  yearChipText: { color: brand.ink, fontSize: 14, fontWeight: "600" },
  yearChipTextActive: { color: brand.violet, fontWeight: "800" },
  yearMoreWrap: { position: "relative" },
  // 他のプルダウン（白背景+枠線）とは違い、薄い背景・枠線なしの見た目にする
  yearMenu: { position: "absolute", top: 46, left: 0, minWidth: 110, borderRadius: 10, backgroundColor: "#FFFFFF", padding: 5, ...shadow },
  yearOption: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 5 },
  yearOptionText: { color: brand.ink, fontSize: 14 },
  yearOptionTextActive: { color: brand.violet, fontWeight: "700" },
  archiveControls: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 28, zIndex: 4 },
  // alignItems: flex-start のままだとgroupingPanelが中身の幅に合わせて広がり、
  // チップの横スクロール行が画面幅を超えてしまうため、モバイルでは幅いっぱいに揃える
  archiveControlsMobile: { flexDirection: "column", alignItems: "stretch", gap: 12 },
  groupingPanel: { flex: 1, gap: 10 },
  sortControls: { flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-end", gap: 10 },
  sortControlsMobile: { alignSelf: "flex-end" },
  sortControlsSolo: { marginLeft: "auto" },
  compactSelectWrap: { position: "relative", width: 126, zIndex: 5 },
  compactSelectLabel: { color: brand.ink, fontSize: 12, fontWeight: "700", marginBottom: 5, textAlign: "right" },
  compactSelect: { minHeight: 36, paddingHorizontal: 11, borderRadius: 6, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  compactSelectText: { color: brand.ink, fontSize: 13, fontWeight: "500" },
  compactSelectMenu: { position: "absolute", top: 59, left: 0, right: 0, padding: 4, borderRadius: 6, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", ...shadow },
  compactSelectOption: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 4 },
  compactSelectOptionText: { color: brand.ink, fontSize: 13 },
  compactSelectOptionActive: { color: brand.violet, fontWeight: "700" },
  compactSelectOptionDisabled: { color: "#C7C2D1" },
  // flexWrapだと選択肢が幅に収まらないときに2行になってしまうため、折り返さず横スクロールに任せる
  groupingRow: { flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap: 8 },
  groupingLabel: { width: 48, color: brand.ink, fontSize: 13, lineHeight: 36, fontWeight: "700" },
  groupingButton: { minHeight: 36, paddingHorizontal: 13, borderRadius: 6, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  groupingButtonActive: { backgroundColor: brand.plum, borderColor: brand.plum },
  groupingButtonText: { color: brand.ink, fontSize: 13, fontWeight: "400" },
  groupingButtonTextActive: { color: "#FFFFFF", fontWeight: "600" },
  // メイン/サブで自身・お目当て⇄出演者と重複するため選べない選択肢。トップページARCHIVEの非当年チップと同系色でグレーアウト
  groupingButtonDisabled: { backgroundColor: "#F5F3F7", borderColor: "#F5F3F7" },
  groupingButtonTextDisabled: { color: brand.muted },
  // モバイルではチップが折り返さず横スクロールで1行に収まるようにする
  groupingChipsScroll: { flex: 1, minWidth: 0 },
  groupingChipsScrollContent: { flexDirection: "row", gap: 8, paddingRight: 48 },
  loader: { marginVertical: 60 },
  error: { color: "#C2414B", marginVertical: 30 },
  monthSection: { marginBottom: 28 },
  monthTitle: { color: brand.plum, fontSize: 25, lineHeight: 32, fontWeight: "800", marginBottom: 10 },
  groupSection: { marginBottom: 18, overflow: "hidden", borderRadius: 10, borderWidth: 1, borderColor: brand.border, backgroundColor: "#F9F7FC" },
  groupHeader: { minHeight: 54, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: brand.border, backgroundColor: "#F9F7FC" },
  subGroupHeader: { paddingLeft: 32, minHeight: 48, backgroundColor: "#FCFBFD" },
  groupChevron: { width: 26 },
  groupTagWrap: { flex: 1, minWidth: 0, alignSelf: "center", justifyContent: "center" },
  groupTitle: { flexShrink: 1, color: brand.ink, fontSize: 16, fontWeight: "700" },
  subGroupTitle: { flexShrink: 1, color: brand.ink, fontSize: 14, fontWeight: "600" },
  groupCount: { marginLeft: 8, color: brand.muted, fontSize: 12 },
  groupTotal: { paddingLeft: 42, paddingRight: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: brand.border, backgroundColor: "#F9F7FC" },
  subGroupTotal: { paddingLeft: 58, backgroundColor: "#FCFBFD" },
  groupTotalText: { color: brand.ink, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  cardList: { gap: 12 },
  groupCardList: { padding: 12, backgroundColor: brand.lavender },
  card: { minHeight: 108, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 22, ...shadow, ...deferredCardRendering },
  cardMobile: { minHeight: 0, paddingHorizontal: 14, paddingVertical: 14, gap: 10, alignItems: "flex-start", ...(Platform.OS === "web" ? ({ boxShadow: "none" } as any) : {}) },
  dateBlock: { width: 104, alignItems: "center" },
  dateBlockMobile: { width: 0, display: "none" },
  dateText: { color: brand.plum, fontSize: 29, lineHeight: 35, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dateTextMobile: { fontSize: 17, lineHeight: 22 },
  weekday: { color: brand.ink, fontSize: 15, fontWeight: "800", minWidth: 32, textAlign: "center", marginTop: 2, fontVariant: ["tabular-nums"], fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "monospace" },
  saturday: { color: "#2563EB" },
  holiday: { color: "#DC2626" },
  dateDivider: { width: 1, height: 66, backgroundColor: brand.border },
  cardBody: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardCost: { color: brand.ink, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right" },
  mobileDateRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 7 },
  mobileDateLeft: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  mobileDate: { color: brand.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  mobileWeekday: { color: brand.ink, fontSize: 15, lineHeight: 20, fontWeight: "800", minWidth: 32, fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "monospace" },
  cardTitle: { flex: 1, color: brand.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  archiveTags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 },
  breakfastBadge: { alignSelf: "flex-start", backgroundColor: "#F5F3FF", borderRadius: 5, paddingHorizontal: 10, paddingVertical: 4 },
  breakfastBadgeOff: { backgroundColor: "#F0EEF2" },
  breakfastLabel: { color: brand.violetDark, fontSize: 12 },
  breakfastLabelOff: { color: brand.muted },
  venue: { color: brand.muted, fontSize: 13, marginTop: 8 },
});
