import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Schedule } from "../app/HomeScreen";
import { PublicFooter, PublicHeader, brand } from "./GenBGTBrand";
import { NotionTag } from "./notion-tag";
import { fetchAreaColors } from "../utils/fetch-area-colors";
import { getOptionColorSync } from "../utils/get-option-color";
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
const monoFont = Platform.OS === "web" ? "SFMono-Regular, Menlo, Consolas, monospace" : "monospace";

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
    const map = new Map<number, Schedule[]>();
    schedules.forEach((item) => {
      const month = Number((item.date ?? item.datetime).slice(5, 7));
      map.set(month, [...(map.get(month) ?? []), item]);
    });
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [schedules]);

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
          <View style={styles.yearTabs}>
            {years.map((item) => (
              <TouchableOpacity key={item} style={[styles.yearTab, String(item) === year && styles.yearTabActive]} onPress={() => selectYear(item)}>
                <Text style={[styles.yearTabText, String(item) === year && styles.yearTabTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? <ActivityIndicator color={brand.violet} style={styles.loader} /> : error ? <Text style={styles.error}>{error}</Text> : groups.map(([month, items]) => (
            <View key={month} style={styles.monthSection}>
              <Text style={styles.monthTitle}>{month}月</Text>
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
                        {mobile && <Text style={styles.mobileDate}>{String(parts.month).padStart(2, "0")}.{parts.day} <Text style={[styles.weekday, parts.tone === "sat" && styles.saturday, parts.tone === "holiday" && styles.holiday]}>{parts.weekday}</Text></Text>}
                        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.venueRow}>
                          {!!item.area && <NotionTag label={item.area} color={areaColors.get(item.id) || getOptionColorSync(item.area, "AREAS")} />}
                          {!!item.venue && <Text style={styles.venue} numberOfLines={1}>{item.venue}</Text>}
                        </View>
                        {mobile && <View style={styles.mobileTags}>
                          {!!item.category && <NotionTag label={item.category} color={getOptionColorSync(item.category, "CATEGORIES")} />}
                          {!!item.status && <NotionTag label={item.status} color={getOptionColorSync(item.status, "STATUSES")} />}
                        </View>}
                      </View>
                      {!mobile && <View style={styles.sideTags}>
                        {!!item.category && <NotionTag label={item.category} color={getOptionColorSync(item.category, "CATEGORIES")} />}
                        {!!item.status && <NotionTag label={item.status} color={getOptionColorSync(item.status, "STATUSES")} />}
                      </View>}
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
  yearTabs: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 22, marginBottom: 28 },
  yearTab: { minWidth: 82, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", alignItems: "center" },
  yearTabActive: { backgroundColor: brand.violet, borderColor: brand.violet },
  yearTabText: { color: brand.plum, fontSize: 14, fontWeight: "700" },
  yearTabTextActive: { color: "#FFFFFF" },
  loader: { marginVertical: 60 },
  error: { color: "#C2414B", marginVertical: 30 },
  monthSection: { marginBottom: 28 },
  monthTitle: { color: brand.plum, fontSize: 25, lineHeight: 32, fontWeight: "800", marginBottom: 10 },
  cardList: { gap: 12 },
  card: { minHeight: 108, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 22, ...shadow },
  cardMobile: { minHeight: 0, paddingHorizontal: 14, paddingVertical: 14, gap: 10, alignItems: "flex-start" },
  dateBlock: { width: 104, alignItems: "center" },
  dateBlockMobile: { width: 0, display: "none" },
  dateText: { color: brand.plum, fontSize: 29, lineHeight: 35, fontWeight: "800", fontVariant: ["tabular-nums"], fontFamily: monoFont },
  dateTextMobile: { fontSize: 17, lineHeight: 22 },
  weekday: { color: brand.violet, fontSize: 15, fontWeight: "800", marginTop: 2, fontFamily: monoFont },
  saturday: { color: "#2563EB" },
  holiday: { color: "#DC2626" },
  dateDivider: { width: 1, height: 66, backgroundColor: brand.border },
  cardBody: { flex: 1, minWidth: 0 },
  mobileDate: { color: brand.violet, fontSize: 17, lineHeight: 22, fontWeight: "800", marginBottom: 7, fontVariant: ["tabular-nums"], fontFamily: monoFont },
  cardTitle: { color: brand.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  venueRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  venue: { flex: 1, color: brand.muted, fontSize: 13 },
  sideTags: { width: 150, gap: 8, alignItems: "flex-start" },
  mobileTags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
});
