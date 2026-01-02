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

// 祝日を判定する関数
function isHoliday(year: number, month: number, day: number): boolean {
  const date = new Date(year, month, day);
  const dayOfWeek = date.getDay();
  
  // 固定祝日
  // 元日
  if (month === 0 && day === 1) return true;
  // 建国記念の日
  if (month === 1 && day === 11) return true;
  // 昭和の日
  if (month === 3 && day === 29) return true;
  // 憲法記念日
  if (month === 4 && day === 3) return true;
  // みどりの日
  if (month === 4 && day === 4) return true;
  // こどもの日
  if (month === 4 && day === 5) return true;
  // 山の日（2020年以降）
  if (month === 7 && day === 11 && year >= 2020) return true;
  // 文化の日
  if (month === 10 && day === 3) return true;
  // 勤労感謝の日
  if (month === 10 && day === 23) return true;
  
  // 天皇誕生日（2020年以降は2月23日、それ以前は12月23日）
  if (year >= 2020 && month === 1 && day === 23) return true;
  if (year < 2020 && month === 11 && day === 23) return true;
  
  // 春分の日を計算
  const springEquinox = Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
  if (month === 2 && day === springEquinox) return true;
  
  // 秋分の日を計算
  const autumnEquinox = Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
  if (month === 8 && day === autumnEquinox) return true;
  
  // 成人の日（1月第2月曜日）
  if (month === 0) {
    const firstDayOfWeek = new Date(year, 0, 1).getDay();
    // 最初の月曜日を計算: 月曜日=1なので、1日の曜日から逆算
    const firstMonday = firstDayOfWeek === 0 ? 2 : (9 - firstDayOfWeek) % 7 || 7;
    const secondMonday = firstMonday + 7;
    if (day === secondMonday) return true;
  }
  
  // 海の日（7月第3月曜日、2020年は7月23日、2021年は7月22日）
  if (month === 6) {
    if (year === 2020 && day === 23) return true;
    if (year === 2021 && day === 22) return true;
    if (year >= 2022) {
      const firstDayOfWeek = new Date(year, 6, 1).getDay();
      const firstMonday = firstDayOfWeek === 0 ? 2 : (9 - firstDayOfWeek) % 7 || 7;
      const thirdMonday = firstMonday + 14;
      if (day === thirdMonday) return true;
    }
  }
  
  // 敬老の日（9月第3月曜日）
  if (month === 8) {
    const firstDayOfWeek = new Date(year, 8, 1).getDay();
    const firstMonday = firstDayOfWeek === 0 ? 2 : (9 - firstDayOfWeek) % 7 || 7;
    const thirdMonday = firstMonday + 14;
    if (day === thirdMonday) return true;
  }
  
  // スポーツの日（10月第2月曜日、2020年は7月24日、2021年は7月23日）
  if (year === 2020 && month === 6 && day === 24) return true;
  if (year === 2021 && month === 6 && day === 23) return true;
  if (year >= 2022 && month === 9) {
    const firstDayOfWeek = new Date(year, 9, 1).getDay();
    const firstMonday = firstDayOfWeek === 0 ? 2 : (9 - firstDayOfWeek) % 7 || 7;
    const secondMonday = firstMonday + 7;
    if (day === secondMonday) return true;
  }
  
  return false;
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
  // 月の最初の日の曜日（月曜始まり: 0=月曜日, 6=日曜日）
  // getDay()は日曜=0, 月曜=1なので、月曜=0になるように変換: (getDay() + 6) % 7
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;

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

    // スケジュールがある場合はモーダルでリストを表示（1件でも複数件でも）
    if (daySchedules.length > 0) {
      setSelectedDateSchedules(daySchedules);
      setSelectedDate(dateString);
      setShowScheduleModal(true);
    } else {
      // スケジュールがない場合は新規作成画面に遷移（日付を設定）
      router.push(`/new?date=${dateString}`);
    }
  };

  // スケジュールを選択したときの処理
  const handleSelectSchedule = (scheduleId: number) => {
    setShowScheduleModal(false);
    router.push(`/live/${scheduleId}`);
  };

  // 新規作成ボタンをクリックしたときの処理
  const handleNewSchedule = () => {
    setShowScheduleModal(false);
    router.push(`/new?date=${selectedDate}`);
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
        {["月", "火", "水", "木", "金", "土", "日"].map((day, index) => (
          <View key={index} style={styles.weekday}>
            <Text
              style={[
                styles.weekdayText,
                index === 5 && styles.saturdayText,
                index === 6 && styles.sundayText,
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
          const isHolidayDay = isHoliday(year, month, day);

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
                  index % 7 === 5 && styles.saturdayText,
                  (index % 7 === 6 || isHolidayDay) && styles.sundayText,
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

            {/* 新規作成ボタン */}
            <TouchableOpacity
              style={styles.newScheduleButton}
              onPress={handleNewSchedule}
            >
              <Text style={styles.newScheduleButtonText}>➕ New Live</Text>
            </TouchableOpacity>

            <View style={styles.scheduleListSeparator} />

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
  newScheduleButton: {
    marginHorizontal: 20,
    marginVertical: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  newScheduleButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  scheduleListSeparator: {
    height: 1,
    backgroundColor: "#e9e9e7",
    marginHorizontal: 20,
    marginVertical: 8,
  },
});

