import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Schedule } from "../app/HomeScreen";
import { PublicFooter, PublicHeader, brand } from "./GenBGTBrand";
import { NotionTag } from "./notion-tag";
import { getOptionColorSync } from "../utils/get-option-color";
import { fetchAreaColors } from "../utils/fetch-area-colors";
import { isJapaneseHolidayDate } from "./ScheduleCalendar";

type Props = {
  initialYear: string;
  fetchSchedules: (year: string) => Promise<Schedule[]>;
  fetchAvailableYears: () => Promise<number[]>;
  onBack: () => void;
  onSelectYear: (year: number) => void;
  onSchedulePress: (id: number) => void;
};

const shadow = Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(46,16,101,0.08)" } as any) : {};

function dateParts(raw: string) {
  const [year, month, day] = raw.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()];
  const tone = date.getDay() === 6 ? "sat" : (date.getDay() === 0 || isJapaneseHolidayDate(raw)) ? "holiday" : "normal";
  return { month, day: String(day).padStart(2, "0"), weekday, tone };
}

export function SharedArchivePage({ initialYear, fetchSchedules, fetchAvailableYears, onBack, onSelectYear, onSchedulePress }: Props) {
  const { width } = useWindowDimensions();
  const mobile = width < 720;
  const [year, setYear] = useState(initialYear);
  const [years, setYears] = useState<number[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [mainGrouping, setMainGrouping] = useState<"none" | "target" | "lineup">("none");
  const [subGrouping, setSubGrouping] = useState<"none" | "group" | "category" | "area" | "seller" | "status">("none");

  useEffect(() => { setYear(initialYear); }, [initialYear]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAvailableYears(), fetchSchedules(year)])
      .then(async ([available, data]) => {
        if (!active) return;
        const visible = data.filter((item) => item.status !== "Canceled").sort((a, b) => (b.date ?? b.datetime).localeCompare(a.date ?? a.datetime));
        setYears(available);
        setSchedules(visible);
        setAreaColors(await fetchAreaColors(visible));
        setError(null);
      })
      .catch((e) => active && setError(e.message ?? "アーカイブを取得できませんでした"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [year, fetchAvailableYears, fetchSchedules]);

  const groups = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    schedules.forEach((item) => {
      const month = Number((item.date ?? item.datetime).slice(5, 7));
      const mainValue = mainGrouping === "target" ? (item.target || "未設定") : mainGrouping === "lineup" ? (item.lineup || "未設定") : "";
      const subValue = subGrouping === "none" ? "" : String(item[subGrouping] || "未設定");
      const key = mainValue || subValue ? [mainValue, subValue].filter(Boolean).join(" / ") : `${month}月`;
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return Array.from(map.entries());
  }, [schedules, mainGrouping, subGrouping]);

  const selectYear = (next: number) => {
    setLoading(true);
    setYear(String(next));
    onSelectYear(next);
  };

  return (
    <View style={styles.page}>
      <PublicHeader active="archive" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.main, mobile && styles.mainMobile]}>
          <TouchableOpacity style={styles.back} onPress={onBack}>
            <Ionicons name="arrow-back" size={18} color={brand.violet} />
            <Text style={styles.backText}>スケジュールに戻る</Text>
          </TouchableOpacity>
          <Text style={[styles.title, mobile && styles.titleMobile]}>{year} ARCHIVE</Text>
          <View style={styles.yearSelectorWrap}>
            <TouchableOpacity style={styles.yearSelector} onPress={() => setYearMenuOpen((open) => !open)}>
              <Text style={styles.yearSelectorText}>{year}</Text>
              <Ionicons name={yearMenuOpen ? "chevron-up" : "chevron-down"} size={18} color={brand.muted} />
            </TouchableOpacity>
            {yearMenuOpen && <View style={styles.yearMenu}>
              {years.map((item) => <TouchableOpacity key={item} style={styles.yearOption} onPress={() => { setYearMenuOpen(false); selectYear(item); }}><Text style={[styles.yearOptionText, String(item) === year && styles.yearOptionTextActive]}>{item}</Text></TouchableOpacity>)}
            </View>}
          </View>

          <View style={styles.groupingPanel}>
            <View style={styles.groupingRow}><Text style={styles.groupingLabel}>メイン</Text><View style={styles.groupingButtons}>{([['none','なし'],['target','お目当て'],['lineup','出演者']] as const).map(([value,label]) => <TouchableOpacity key={value} style={[styles.groupingButton, mainGrouping === value && styles.groupingButtonActive]} onPress={() => setMainGrouping(value)}><Text style={[styles.groupingButtonText, mainGrouping === value && styles.groupingButtonTextActive]}>{label}</Text></TouchableOpacity>)}</View></View>
            <View style={styles.groupingRow}><Text style={styles.groupingLabel}>サブ</Text><View style={styles.groupingButtons}>{([['none','なし'],['group','グループ'],['category','カテゴリ'],['area','エリア'],['seller','販売元'],['status','ステータス']] as const).map(([value,label]) => <TouchableOpacity key={value} style={[styles.groupingButton, subGrouping === value && styles.groupingButtonActive]} onPress={() => setSubGrouping(value)}><Text style={[styles.groupingButtonText, subGrouping === value && styles.groupingButtonTextActive]}>{label}</Text></TouchableOpacity>)}</View></View>
          </View>

          {loading ? <ActivityIndicator color={brand.violet} style={styles.loader} /> : error ? <Text style={styles.error}>{error}</Text> : groups.map(([groupTitle, items]) => (
            <View key={groupTitle} style={styles.monthSection}>
              <Text style={styles.monthTitle}>{groupTitle}</Text>
              <View style={styles.cardList}>
                {items.map((item) => {
                  const parts = dateParts(item.date ?? item.datetime);
                  return (
                    <TouchableOpacity key={item.id} style={[styles.card, mobile && styles.cardMobile]} onPress={() => onSchedulePress(item.id)}>
                      <View style={[styles.dateBlock, mobile && styles.dateBlockMobile]}>
                        <Text style={[styles.dateText, mobile && styles.dateTextMobile]}>{mobile ? `${String(parts.month).padStart(2, "0")}.${parts.day}` : `${String(parts.month).padStart(2, "0")}.${parts.day}`}</Text>
                        <Text style={[styles.weekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text>
                      </View>
                      {!mobile && <View style={styles.dateDivider} />}
                      <View style={styles.cardBody}>
                        {mobile && <View style={styles.mobileDateRow}>
                          <Text style={styles.mobileDate}>{String(parts.month).padStart(2, "0")}.{parts.day}</Text>
                          <Text style={[styles.mobileWeekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text>
                        </View>}
                        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.archiveTags}>
                          {!!item.area && subGrouping !== "area" && <NotionTag label={item.area} color={areaColors.get(item.id) || getOptionColorSync(item.area, "AREAS")} />}
                          {!!item.status && subGrouping !== "status" && <NotionTag label={item.status} color={getOptionColorSync(item.status, "STATUSES")} />}
                        </View>
                        {!!item.venue && <Text style={styles.venue} numberOfLines={1}>{item.venue}</Text>}
                      </View>
                      <Ionicons name="chevron-forward" size={24} color={brand.violet} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
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
  yearSelectorWrap: { position: "relative", marginTop: 22, marginBottom: 16, zIndex: 5 },
  yearSelector: { minHeight: 46, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  yearSelectorText: { color: brand.ink, fontSize: 14, fontWeight: "500" },
  yearMenu: { position: "absolute", top: 50, left: 0, right: 0, borderWidth: 1, borderColor: brand.border, borderRadius: 8, backgroundColor: "#FFFFFF", padding: 5, ...shadow },
  yearOption: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 5 },
  yearOptionText: { color: brand.ink, fontSize: 14 },
  yearOptionTextActive: { color: brand.violet, fontWeight: "700" },
  groupingPanel: { gap: 10, marginBottom: 28 },
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
  cardList: { gap: 12 },
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
  mobileDateRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 7 },
  mobileDate: { color: brand.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  mobileWeekday: { color: brand.ink, fontSize: 15, lineHeight: 20, fontWeight: "800", minWidth: 32, fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "monospace" },
  cardTitle: { color: brand.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  archiveTags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 },
  venue: { color: brand.muted, fontSize: 13, marginTop: 8 },
});
