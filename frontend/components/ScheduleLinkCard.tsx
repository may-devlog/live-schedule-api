// 交通・宿泊の詳細画面で「紐づく親スケジュール」を表示するためのカード。
// NEXT LIVE（app/share/[share_id].tsx）と同じ見た目に合わせている。
// NotionRelationの選択済みカード表示と、共有/公開ページの読み取り専用表示の両方で使う。
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NotionTag } from "./notion-tag";
import { getOptionColor, getOptionColorSync } from "../utils/get-option-color";
import { isJapaneseHolidayDate } from "./ScheduleCalendar";
import { useTheme, type ThemeColors } from "../contexts/ThemeContext";

type ScheduleLinkCardProps = {
  date?: string | null;
  title: string;
  area?: string | null;
  onPress?: () => void;
  onRemove?: () => void;
};

function formatDateWithWeekday(raw?: string | null) {
  if (!raw) return null;
  const datePart = raw.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  const holiday = isJapaneseHolidayDate(datePart);
  const weekday = `${["日", "月", "火", "水", "木", "金", "土"][date.getDay()] ?? ""}${holiday ? "・祝" : ""}`;
  const tone = date.getDay() === 6 ? ("saturday" as const) : date.getDay() === 0 || holiday ? ("holiday" as const) : ("normal" as const);
  return { label: datePart.replace(/-/g, "."), weekday, tone };
}

export function ScheduleLinkCard({ date, title, area, onPress, onRemove }: ScheduleLinkCardProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [areaColor, setAreaColor] = useState<string | undefined>(() => (area ? getOptionColorSync(area, "AREAS") : undefined));

  useEffect(() => {
    let active = true;
    if (area) {
      getOptionColor(area, "AREAS").then((color) => {
        if (active) setAreaColor(color);
      });
    } else {
      setAreaColor(undefined);
    }
    return () => {
      active = false;
    };
  }, [area]);

  const dateDisplay = formatDateWithWeekday(date);
  const Wrapper: React.ElementType = onPress ? TouchableOpacity : View;

  return (
    <Wrapper style={styles.card} onPress={onPress} activeOpacity={onPress ? 0.7 : undefined}>
      <View style={styles.content}>
        {dateDisplay && (
          <View style={styles.dateRow}>
            <Text style={styles.dateText}>{dateDisplay.label}</Text>
            <Text
              style={[
                styles.weekdayText,
                dateDisplay.tone === "saturday" && styles.saturdayText,
                dateDisplay.tone === "holiday" && styles.holidayText,
              ]}
            >
              {dateDisplay.weekday}
            </Text>
          </View>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {!!area && <NotionTag label={area} color={areaColor} />}
      </View>
      {!!onPress && (
        <View style={styles.arrowButton}>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </View>
      )}
      {!!onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
          <Ionicons name="close" size={18} color={colors.muted} />
        </TouchableOpacity>
      )}
    </Wrapper>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    ...(Platform.OS === "web" ? ({ boxShadow: "0 6px 20px rgba(46,16,101,0.05)" } as any) : {}),
  },
  content: { flex: 1, gap: 6, minWidth: 0 },
  dateRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  dateText: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
  weekdayText: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  saturdayText: { color: "#2563EB" },
  holidayText: { color: "#DC2626" },
  title: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButton: {
    padding: 6,
  },
});
