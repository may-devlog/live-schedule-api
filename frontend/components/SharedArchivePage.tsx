import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Schedule } from "../app/HomeScreen";
import { AppHeader, PublicFooter, PublicHeader, brand } from "./GenBGTBrand";
import { NotionTag } from "./notion-tag";
import { getOptionColorSync, preloadOptionColors } from "../utils/get-option-color";
import { fetchAreaColors } from "../utils/fetch-area-colors";
import { isJapaneseHolidayDate } from "./ScheduleCalendar";
import { groupSchedulesNested, type MainGroupingField, type SubGroupingField } from "../utils/group-schedules";
import { loadSelectOptionsMap } from "../utils/load-select-options-map";
import { loadSelectOptions, loadStaySelectOptions } from "../utils/select-options-storage";
import { fetchTrafficBySchedule } from "../utils/fetch-traffic-by-schedule";
import { calculateTotalCostWithReturnFlag, type TrafficBySchedule } from "../utils/calculate-total-cost";

type Props = {
  shareId?: string;
  authenticated?: boolean;
  initialYear: string;
  fetchSchedules: (year: string) => Promise<Schedule[]>;
  fetchStays?: (year: string) => Promise<StaySummary[]>;
  fetchAvailableYears: () => Promise<number[]>;
  onBack: () => void;
  onSelectYear: (year: string) => void;
  onSchedulePress: (id: number) => void;
  onStayPress?: (id: number) => void;
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
type SortOrder = "asc" | "desc";
type MainSortMode = "default" | "kana";

function scheduleDate(schedule: Schedule) {
  return schedule.datetime || schedule.date || "";
}

function compareSchedules(a: Schedule, b: Schedule, order: SortOrder) {
  const comparison = scheduleDate(a).localeCompare(scheduleDate(b));
  return order === "asc" ? comparison : -comparison;
}

function groupBoundary(schedules: Schedule[], order: SortOrder) {
  const timestamps = schedules.map(scheduleDate).sort();
  return order === "asc" ? timestamps[0] ?? "" : timestamps[timestamps.length - 1] ?? "";
}

function dateParts(raw: string) {
  const [year, month, day] = raw.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  const tone = date.getDay() === 6 ? "sat" : (date.getDay() === 0 || isJapaneseHolidayDate(raw)) ? "holiday" : "normal";
  return { month, day: String(day).padStart(2, "0"), weekday, tone };
}

export function SharedArchivePage({ shareId, authenticated = false, initialYear, fetchSchedules, fetchStays, fetchAvailableYears, onBack, onSelectYear, onSchedulePress, onStayPress }: Props) {
  const { width } = useWindowDimensions();
  const mobile = width < 720;
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
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [mainSortMenuOpen, setMainSortMenuOpen] = useState(false);
  const [mainGrouping, setMainGrouping] = useState<MainGroupingField>("none");
  const [subGrouping, setSubGrouping] = useState<SubGroupingField>("none");
  const [archiveType, setArchiveType] = useState<"event" | "stay">("event");
  const [stayGrouping, setStayGrouping] = useState<"none" | "website" | "status">("none");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [mainSortMode, setMainSortMode] = useState<MainSortMode>("default");

  useEffect(() => { setYear(initialYear); }, [initialYear]);

  useEffect(() => {
    let active = true;
    const optionOwner = authenticated ? undefined : shareId;
    Promise.all([fetchAvailableYears(), fetchSchedules(year), fetchStays ? fetchStays(year) : Promise.resolve([]), loadSelectOptionsMap(optionOwner)])
      .then(async ([available, data, stayData, optionMaps]) => {
        if (!active) return;
        const sorted = [...data].sort((a, b) => compareSchedules(a, b, "asc"));
        const [colors, trafficMap] = await Promise.all([
          Promise.all([
            loadSelectOptions("TARGETS", optionOwner).then((options) => preloadOptionColors(options, "TARGETS")),
            loadSelectOptions("GROUPS", optionOwner).then((options) => preloadOptionColors(options, "GROUPS")),
            loadSelectOptions("CATEGORIES", optionOwner).then((options) => preloadOptionColors(options, "CATEGORIES")),
            loadSelectOptions("AREAS", optionOwner).then((options) => preloadOptionColors(options, "AREAS")),
            loadSelectOptions("SELLERS", optionOwner).then((options) => preloadOptionColors(options, "SELLERS")),
            loadSelectOptions("STATUSES", optionOwner).then((options) => preloadOptionColors(options, "STATUSES")),
            loadStaySelectOptions("WEBSITE", optionOwner).then((options) => preloadOptionColors(options, "WEBSITE")),
            loadStaySelectOptions("STATUS", optionOwner).then((options) => preloadOptionColors(options, "STAY_STATUS")),
          ]),
          fetchTrafficBySchedule(sorted, authenticated, shareId),
        ]);
        void colors;
        if (!active) return;
        setYears(available);
        setSchedules(sorted);
        setStays(stayData);
        setSelectOptionsMap(optionMaps.orderMap);
        setTrafficBySchedule(trafficMap);
        setAreaColors(await fetchAreaColors(sorted));
        setError(null);
      })
      .catch((e) => active && setError(e.message ?? "アーカイブを取得できませんでした"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [year, shareId, authenticated, fetchAvailableYears, fetchSchedules, fetchStays]);

  const visibleSchedules = useMemo(() => {
    const visible = subGrouping === "status" ? schedules : schedules.filter((item) => item.status !== "Canceled");
    return [...visible].sort((a, b) => compareSchedules(a, b, sortOrder));
  }, [schedules, subGrouping, sortOrder]);

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

    if (mainSortMode === "kana" && (mainGrouping === "target" || mainGrouping === "lineup")) {
      return sorted.sort((a, b) => {
        if (a.title === "未設定") return 1;
        if (b.title === "未設定") return -1;
        return a.title.localeCompare(b.title, "ja");
      });
    }
    return sorted;
  }, [visibleSchedules, mainGrouping, subGrouping, selectOptionsMap, sortOrder, mainSortMode]);

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

  const totalCost = (schedule: Schedule) => calculateTotalCostWithReturnFlag(schedule, trafficBySchedule) ?? 0;

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
          {mobile && <View style={styles.mobileDateRow}><Text style={styles.mobileDate}>{String(parts.month).padStart(2, "0")}.{parts.day}</Text><Text style={[styles.mobileWeekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text></View>}
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.archiveTags}>
            {!!item.area && subGrouping !== "area" && <NotionTag label={item.area} color={areaColors.get(item.id) || getOptionColorSync(item.area, "AREAS")} />}
            {!!item.status && subGrouping !== "status" && <NotionTag label={item.status} color={getOptionColorSync(item.status, "STATUSES")} />}
          </View>
          {!!item.venue && <Text style={styles.venue} numberOfLines={1}>{item.venue}</Text>}
        </View>
        {cost > 0 && mainGrouping !== "lineup" && <Text style={styles.cardCost}>¥{cost.toLocaleString()}</Text>}
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
          {mobile && <View style={styles.mobileDateRow}><Text style={styles.mobileDate}>{String(parts.month).padStart(2, "0")}.{parts.day}</Text><Text style={[styles.mobileWeekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text></View>}
          <Text style={styles.cardTitle} numberOfLines={2}>{stay.hotel_name}</Text>
          <View style={styles.archiveTags}>
            {!!stay.website && stayGrouping !== "website" && <NotionTag label={stay.website} color={getOptionColorSync(stay.website, "WEBSITE")} />}
            <Text style={[styles.breakfastLabel, !stay.breakfast_flag && styles.breakfastLabelOff]}>{stay.breakfast_flag ? "朝食あり" : "朝食なし"}</Text>
            {!!stay.status && stayGrouping !== "status" && <NotionTag label={stay.status} color={getOptionColorSync(stay.status, "STAY_STATUS")} />}
          </View>
          <Text style={styles.venue}>{stay.check_in.replace(/-/g, ".")} → {stay.check_out.replace(/-/g, ".")}</Text>
        </View>
        <Text style={styles.cardCost}>¥{stay.fee.toLocaleString()}</Text>
        <Ionicons name="chevron-forward" size={24} color={brand.violet} />
      </TouchableOpacity>
    );
  };

  const selectYear = (next: string) => {
    setLoading(true);
    setYear(next);
    onSelectYear(next);
  };

  return (
    <View style={styles.page}>
      {authenticated ? <AppHeader active="archive" /> : <PublicHeader active="archive" />}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.main, mobile && styles.mainMobile]}>
          <TouchableOpacity style={styles.back} onPress={onBack}>
            <Ionicons name="arrow-back" size={18} color={brand.violet} />
            <Text style={styles.backText}>スケジュールに戻る</Text>
          </TouchableOpacity>
          <Text style={[styles.title, mobile && styles.titleMobile]}>{year} ARCHIVE</Text>
          {!!fetchStays && <View style={styles.archiveTabs}>
            <TouchableOpacity style={[styles.archiveTab, archiveType === "event" && styles.archiveTabActive]} onPress={() => setArchiveType("event")}><Text style={[styles.archiveTabText, archiveType === "event" && styles.archiveTabTextActive]}>イベント</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.archiveTab, archiveType === "stay" && styles.archiveTabActive]} onPress={() => setArchiveType("stay")}><Text style={[styles.archiveTabText, archiveType === "stay" && styles.archiveTabTextActive]}>宿泊</Text></TouchableOpacity>
          </View>}
          <View style={styles.yearSelectorWrap}>
            <TouchableOpacity style={styles.yearSelector} onPress={() => setYearMenuOpen((open) => !open)}>
              <Text style={styles.yearSelectorText}>{year}</Text>
              <Ionicons name={yearMenuOpen ? "chevron-up" : "chevron-down"} size={18} color={brand.muted} />
            </TouchableOpacity>
            {yearMenuOpen && <View style={styles.yearMenu}>
              {["ALL", ...years.map(String)].map((item) => <TouchableOpacity key={item} style={styles.yearOption} onPress={() => { setYearMenuOpen(false); selectYear(item); }}><Text style={[styles.yearOptionText, item === year && styles.yearOptionTextActive]}>{item}</Text></TouchableOpacity>)}
            </View>}
          </View>

          <View style={[styles.archiveControls, mobile && styles.archiveControlsMobile]}>
            {archiveType === "event" ? <View style={styles.groupingPanel}>
              <View style={styles.groupingRow}><Text style={styles.groupingLabel}>メイン</Text><View style={styles.groupingButtons}>{([['none','なし'],['target','お目当て'],['lineup','出演者']] as const).map(([value,label]) => <TouchableOpacity key={value} style={[styles.groupingButton, mainGrouping === value && styles.groupingButtonActive]} onPress={() => setMainGrouping(value)}><Text style={[styles.groupingButtonText, mainGrouping === value && styles.groupingButtonTextActive]}>{label}</Text></TouchableOpacity>)}</View></View>
              <View style={styles.groupingRow}><Text style={styles.groupingLabel}>サブ</Text><View style={styles.groupingButtons}>{([['none','なし'],['group','グループ'],['category','カテゴリ'],['area','エリア'],['seller','販売元'],['status','ステータス']] as const).map(([value,label]) => <TouchableOpacity key={value} style={[styles.groupingButton, subGrouping === value && styles.groupingButtonActive]} onPress={() => setSubGrouping(value)}><Text style={[styles.groupingButtonText, subGrouping === value && styles.groupingButtonTextActive]}>{label}</Text></TouchableOpacity>)}</View></View>
            </View> : <View style={styles.groupingPanel}>
              <View style={styles.groupingRow}><Text style={styles.groupingLabel}>分類</Text><View style={styles.groupingButtons}>{([['none','なし'],['website','予約サイト'],['status','ステータス']] as const).map(([value,label]) => <TouchableOpacity key={value} style={[styles.groupingButton, stayGrouping === value && styles.groupingButtonActive]} onPress={() => setStayGrouping(value)}><Text style={[styles.groupingButtonText, stayGrouping === value && styles.groupingButtonTextActive]}>{label}</Text></TouchableOpacity>)}</View></View>
            </View>}
            <View style={[styles.sortControls, mobile && styles.sortControlsMobile]}>
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
              const color = stayGrouping === "website" ? getOptionColorSync(title, "WEBSITE") : stayGrouping === "status" ? getOptionColorSync(title, "STAY_STATUS") : null;
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
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: brand.lavender },
  scrollContent: { flexGrow: 1 },
  main: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 48, paddingTop: 34, paddingBottom: 54 },
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
  yearSelectorWrap: { position: "relative", marginTop: 22, marginBottom: 16, zIndex: 5 },
  yearSelector: { minHeight: 46, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  yearSelectorText: { color: brand.ink, fontSize: 14, fontWeight: "500" },
  yearMenu: { position: "absolute", top: 50, left: 0, right: 0, borderWidth: 1, borderColor: brand.border, borderRadius: 8, backgroundColor: "#FFFFFF", padding: 5, ...shadow },
  yearOption: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 5 },
  yearOptionText: { color: brand.ink, fontSize: 14 },
  yearOptionTextActive: { color: brand.violet, fontWeight: "700" },
  archiveControls: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 28, zIndex: 4 },
  archiveControlsMobile: { flexDirection: "column", gap: 12 },
  groupingPanel: { flex: 1, gap: 10 },
  sortControls: { flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-end", gap: 10 },
  sortControlsMobile: { alignSelf: "flex-end" },
  compactSelectWrap: { position: "relative", width: 126, zIndex: 5 },
  compactSelectLabel: { color: brand.ink, fontSize: 12, fontWeight: "700", marginBottom: 5, textAlign: "right" },
  compactSelect: { minHeight: 36, paddingHorizontal: 11, borderRadius: 6, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  compactSelectText: { color: brand.ink, fontSize: 13, fontWeight: "500" },
  compactSelectMenu: { position: "absolute", top: 59, left: 0, right: 0, padding: 4, borderRadius: 6, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", ...shadow },
  compactSelectOption: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 4 },
  compactSelectOptionText: { color: brand.ink, fontSize: 13 },
  compactSelectOptionActive: { color: brand.violet, fontWeight: "700" },
  groupingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  groupingLabel: { width: 48, color: brand.ink, fontSize: 13, lineHeight: 36, fontWeight: "700" },
  groupingButtons: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  groupingButton: { minHeight: 36, paddingHorizontal: 13, borderRadius: 6, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  groupingButtonActive: { backgroundColor: brand.plum, borderColor: brand.plum },
  groupingButtonText: { color: brand.ink, fontSize: 13, fontWeight: "400" },
  groupingButtonTextActive: { color: "#FFFFFF", fontWeight: "600" },
  loader: { marginVertical: 60 },
  error: { color: "#C2414B", marginVertical: 30 },
  monthSection: { marginBottom: 28 },
  monthTitle: { color: brand.plum, fontSize: 25, lineHeight: 32, fontWeight: "800", marginBottom: 10 },
  groupSection: { marginBottom: 18, overflow: "hidden", borderRadius: 10, borderWidth: 1, borderColor: brand.border, backgroundColor: "#F9F7FC" },
  groupHeader: { minHeight: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: brand.border, backgroundColor: "#F9F7FC" },
  subGroupHeader: { paddingLeft: 32, minHeight: 48, backgroundColor: "#FCFBFD" },
  groupChevron: { width: 26 },
  groupTagWrap: { alignSelf: "center", justifyContent: "center" },
  groupTitle: { color: brand.ink, fontSize: 16, fontWeight: "700" },
  subGroupTitle: { color: brand.ink, fontSize: 14, fontWeight: "600" },
  groupCount: { marginLeft: 8, color: brand.muted, fontSize: 12 },
  groupTotal: { paddingLeft: 42, paddingRight: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: brand.border, backgroundColor: "#F9F7FC" },
  subGroupTotal: { paddingLeft: 58, backgroundColor: "#FCFBFD" },
  groupTotalText: { color: brand.ink, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  cardList: { gap: 12 },
  groupCardList: { padding: 12, backgroundColor: brand.lavender },
  card: { minHeight: 108, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 22, ...shadow },
  cardMobile: { minHeight: 0, paddingHorizontal: 14, paddingVertical: 14, gap: 10, alignItems: "flex-start" },
  dateBlock: { width: 104, alignItems: "center" },
  dateBlockMobile: { width: 0, display: "none" },
  dateText: { color: brand.plum, fontSize: 29, lineHeight: 35, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dateTextMobile: { fontSize: 17, lineHeight: 22 },
  weekday: { color: brand.ink, fontSize: 15, fontWeight: "800", minWidth: 32, textAlign: "center", marginTop: 2, fontVariant: ["tabular-nums"], fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "monospace" },
  saturday: { color: "#2563EB" },
  holiday: { color: "#DC2626" },
  dateDivider: { width: 1, height: 66, backgroundColor: brand.border },
  cardBody: { flex: 1, minWidth: 0 },
  cardCost: { color: brand.ink, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right" },
  mobileDateRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 7 },
  mobileDate: { color: brand.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  mobileWeekday: { color: brand.ink, fontSize: 15, lineHeight: 20, fontWeight: "800", minWidth: 32, fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "monospace" },
  cardTitle: { color: brand.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  archiveTags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 },
  breakfastLabel: { color: brand.violetDark, backgroundColor: "#F5F3FF", borderRadius: 5, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12 },
  breakfastLabelOff: { color: brand.muted, backgroundColor: "#F0EEF2" },
  venue: { color: brand.muted, fontSize: 13, marginTop: 8 },
});
