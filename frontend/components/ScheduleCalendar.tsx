import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import type { Schedule } from "../app/HomeScreen";

// カレンダーの幅計算はスタイル内で行う

interface ScheduleCalendarProps {
  schedules: Schedule[];
}

export function ScheduleCalendar({ schedules }: ScheduleCalendarProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());

  // 現在の月の最初の日と最後の日を取得
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 月の最初の日（1日）
  const firstDay = new Date(year, month, 1);
  // 月の最後の日
  const lastDay = new Date(year, month + 1, 0);
  // 月の最初の日の曜日（0=日曜日, 6=土曜日）
  const startDayOfWeek = firstDay.getDay();

  // カレンダーに表示する日付の配列を生成
  const daysInMonth = lastDay.getDate();
  const calendarDays: (number | null)[] = [];

  // 前月の空白日を追加
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarDays.push(null);
  }

  // 今月の日付を追加
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  // 日付ごとにスケジュールをグループ化
  const schedulesByDate = useMemo(() => {
    const grouped: Record<string, Schedule[]> = {};

    schedules.forEach((schedule) => {
      if (!schedule.date) return;

      const dateKey = schedule.date; // "YYYY-MM-DD"形式
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(schedule);
    });

    return grouped;
  }, [schedules]);

  // 日付文字列を生成（YYYY-MM-DD形式）
  const getDateString = (day: number): string => {
    const monthStr = String(month + 1).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    return `${year}-${monthStr}-${dayStr}`;
  };

  // 日付をクリックしたときの処理
  const handleDatePress = (day: number) => {
    const dateString = getDateString(day);
    const daySchedules = schedulesByDate[dateString] || [];

    if (daySchedules.length > 0) {
      // その日にスケジュールがある場合、最初のスケジュールの詳細ページに遷移
      // 複数のスケジュールがある場合は最初のものに遷移
      router.push(`/live/${daySchedules[0].id}`);
    }
  };

  // 前の月に移動
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  // 次の月に移動
  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // 今日の日付を取得
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDay = isCurrentMonth ? today.getDate() : null;

  // 月名と年の表示
  const monthNames = [
    "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月",
  ];

  return (
    <View style={styles.container}>
      {/* ヘッダー（月と年、前後の月へのナビゲーション） */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthYear}>
          {year}年 {monthNames[month]}
        </Text>
        <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 曜日ヘッダー */}
      <View style={styles.weekdayHeader}>
        {["日", "月", "火", "水", "木", "金", "土"].map((day, index) => (
          <View key={index} style={styles.weekday}>
            <Text
              style={[
                styles.weekdayText,
                index === 0 && styles.sundayText,
                index === 6 && styles.saturdayText,
              ]}
            >
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* カレンダーグリッド */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <View key={index} style={styles.dayCell} />;
          }

          const dateString = getDateString(day);
          const daySchedules = schedulesByDate[dateString] || [];
          const isToday = todayDay === day;
          const hasSchedule = daySchedules.length > 0;

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayCell,
                isToday && styles.todayCell,
                hasSchedule && styles.hasScheduleCell,
              ]}
              onPress={() => handleDatePress(day)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayText,
                  isToday && styles.todayText,
                  index % 7 === 0 && styles.sundayText,
                  index % 7 === 6 && styles.saturdayText,
                  hasSchedule && styles.hasScheduleText,
                ]}
              >
                {day}
              </Text>
              {hasSchedule && (
                <View style={styles.scheduleIndicator}>
                  <View style={styles.scheduleDot} />
                  {daySchedules.length > 1 && (
                    <Text style={styles.scheduleCount}>
                      {daySchedules.length}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
  },
  navButtonText: {
    fontSize: 24,
    color: "#333",
    fontWeight: "bold",
  },
  monthYear: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  weekdayHeader: {
    flexDirection: "row",
    marginBottom: 8,
    width: "100%",
  },
  weekday: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  sundayText: {
    color: "#e53935",
  },
  saturdayText: {
    color: "#1976d2",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
  },
  dayCell: {
    width: "14.285%", // 100% / 7 ≈ 14.285%
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    position: "relative",
    minHeight: 50,
  },
  todayCell: {
    backgroundColor: "#e3f2fd",
    borderRadius: 25, // 円形にするための固定値
  },
  hasScheduleCell: {
    backgroundColor: "#f5f5f5",
  },
  dayText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  todayText: {
    color: "#1976d2",
    fontWeight: "bold",
  },
  hasScheduleText: {
    fontWeight: "600",
  },
  scheduleIndicator: {
    position: "absolute",
    bottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1976d2",
  },
  scheduleCount: {
    fontSize: 8,
    color: "#1976d2",
    fontWeight: "bold",
    marginLeft: 2,
  },
});

