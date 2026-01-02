import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
  FlatList,
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
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedDateSchedules, setSelectedDateSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");

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

    if (daySchedules.length === 0) {
      // スケジュールがない場合は新規作成画面に遷移（日付を設定）
      router.push(`/new?date=${dateString}`);
      return;
    }

    if (daySchedules.length === 1) {
      // スケジュールが1件のみの場合は直接詳細ページに遷移
      router.push(`/live/${daySchedules[0].id}`);
    } else {
      // 複数のスケジュールがある場合はモーダルでリストを表示
      setSelectedDateSchedules(daySchedules);
      setSelectedDate(dateString);
      setShowScheduleModal(true);
    }
  };

  // スケジュールを選択したときの処理
  const handleSelectSchedule = (scheduleId: number) => {
    setShowScheduleModal(false);
    router.push(`/live/${scheduleId}`);
  };

  // 日付をフォーマット（表示用）
  const formatDateForDisplay = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00");
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const weekday = weekdays[date.getDay()];
    return `${month}月${day}日(${weekday})`;
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
                <View style={styles.scheduleBadge}>
                  <Text style={styles.scheduleBadgeText}>
                    {daySchedules.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 複数スケジュール選択モーダル */}
      <Modal
        visible={showScheduleModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDate && formatDateForDisplay(selectedDate)}
              </Text>
              <TouchableOpacity
                onPress={() => setShowScheduleModal(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={selectedDateSchedules}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.scheduleItem}
                  onPress={() => handleSelectSchedule(item.id)}
                >
                  <Text style={styles.scheduleItemTime}>
                    {item.start ? item.start : item.open || "時間未設定"}
                  </Text>
                  <Text style={styles.scheduleItemTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.scheduleItemVenue} numberOfLines={1}>
                    {item.area} / {item.venue}
                  </Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.scheduleItemSeparator} />}
            />
          </View>
        </View>
      </Modal>
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
    backgroundColor: "#e8f5e9", // 薄い緑色の背景
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
    color: "#2e7d32", // 緑色のテキスト
  },
  scheduleBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#4caf50", // 緑色のバッジ
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  scheduleBadgeText: {
    fontSize: 10,
    color: "#ffffff",
    fontWeight: "bold",
    lineHeight: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#37352f",
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#f5f5f5",
  },
  modalCloseButtonText: {
    fontSize: 20,
    color: "#666",
    fontWeight: "bold",
  },
  scheduleItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
  },
  scheduleItemTime: {
    fontSize: 12,
    color: "#787774",
    marginBottom: 4,
    fontWeight: "500",
  },
  scheduleItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 4,
  },
  scheduleItemVenue: {
    fontSize: 14,
    color: "#787774",
  },
  scheduleItemSeparator: {
    height: 1,
    backgroundColor: "#e9e9e7",
    marginHorizontal: 20,
  },
});

