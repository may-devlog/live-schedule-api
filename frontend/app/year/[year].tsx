// app/year/[year].tsx

import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import type { Schedule } from "../HomeScreen";
import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { HomeButton } from "../../components/HomeButton";
import { NotionTag } from "../../components/notion-tag";
import { getOptionColor, getOptionColorSync } from "../../utils/get-option-color";

export default function YearScreen() {
  const params = useLocalSearchParams<{ year: string }>();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(
    params.year ?? null
  );

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  
  // グルーピング関連
  type GroupingField = "group" | "category" | "area" | "target" | "lineup" | "seller" | "status" | "none";
  const [groupingField, setGroupingField] = useState<GroupingField>("group");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

const fetchAvailableYears = async () => {
  try {
    // 公開スケジュールAPIから全データを取得して年を抽出
    const url = getApiUrl("/public/schedules");
    const res = await fetch(url);
    if (!res.ok) return;

    const data: Schedule[] = await res.json();
    
    // データから存在する年を抽出
    const years = new Set<number>();
    data.forEach((schedule) => {
      if (schedule.date) {
        // dateは"YYYY-MM-DD"形式
        const year = parseInt(schedule.date.substring(0, 4), 10);
        if (!isNaN(year)) {
          years.add(year);
        }
      } else if (schedule.datetime) {
        // datetimeから年を抽出
        const date = new Date(schedule.datetime);
        const year = date.getUTCFullYear();
        if (!isNaN(year)) {
          years.add(year);
        }
      }
    });
    // 年を降順でソート（新しい年から）
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    setAvailableYears(sortedYears);
  } catch (e: any) {
    console.error("ERROR FETCHING AVAILABLE YEARS:", e);
  }
};

const fetchYear = async (y: string) => {
  try {
    setLoading(true);
    setError(null);

    const url = getApiUrl(`/schedules?year=${y}`);
    const res = await authenticatedFetch(url);

    if (!res.ok) throw new Error(`status: ${res.status}`);

    const data: Schedule[] = await res.json();
    console.log("YEAR SCHEDULES FROM API:", y, data);
    setSchedules(data);
  } catch (e: any) {
    console.log("ERROR FETCHING YEAR:", e);
    setError(e.message ?? "Unknown error");
  } finally {
    setLoading(false);
  }
};

  // 利用可能な年を取得
  useEffect(() => {
    fetchAvailableYears();
  }, []);

  // currentYear が変わるたびにその年を再取得
  useEffect(() => {
    if (!currentYear) return;
    fetchYear(currentYear);
  }, [currentYear]);

  // Areaの色情報を取得
  useEffect(() => {
    if (schedules.length === 0) return;
    
    const fetchAreaColors = async () => {
      const colorMap = new Map<number, string>();
      for (const schedule of schedules) {
        if (schedule.area) {
          const color = await getOptionColor(schedule.area, "AREAS");
          colorMap.set(schedule.id, color);
        }
      }
      setAreaColors(colorMap);
    };
    
    fetchAreaColors();
  }, [schedules]);

  const handleSelectYear = (y: number) => {
    const yStr = String(y);
    setCurrentYear(yStr);
    // URL も変えたいなら以下を有効化
    // router.push(`/year/${yStr}`);
  };

  const handleOpenDetail = (id: number) => {
    router.push(`/live/${id}`);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (currentYear) {
        await fetchYear(currentYear);
      }
      await fetchAvailableYears();
    } finally {
      setRefreshing(false);
    }
  };

  // グルーピングロジック
  type GroupedSchedule = {
    title: string;
    data: Schedule[];
  };

  const groupSchedules = (schedules: Schedule[], field: GroupingField): GroupedSchedule[] => {
    if (field === "none") {
      return [{ title: "", data: schedules }];
    }

    const grouped = new Map<string, Schedule[]>();

    schedules.forEach((schedule) => {
      let groupKey: string;

      switch (field) {
        case "group":
          // GroupがNULLの場合はTitleを使用
          groupKey = schedule.group || schedule.title || "未設定";
          break;
        case "category":
          groupKey = schedule.category || "未設定";
          break;
        case "area":
          groupKey = schedule.area || "未設定";
          break;
        case "target":
          groupKey = schedule.target || "未設定";
          break;
        case "lineup":
          // Lineupはカンマ区切りで複数値がある場合は双方に表示
          if (schedule.lineup) {
            const lineupValues = schedule.lineup.split(",").map(v => v.trim()).filter(v => v);
            if (lineupValues.length > 0) {
              // 各値に対してスケジュールを追加
              lineupValues.forEach((value) => {
                if (!grouped.has(value)) {
                  grouped.set(value, []);
                }
                grouped.get(value)!.push(schedule);
              });
            } else {
              groupKey = "未設定";
            }
          } else {
            groupKey = "未設定";
          }
          break;
        case "seller":
          groupKey = schedule.seller || "未設定";
          break;
        case "status":
          groupKey = schedule.status || "未設定";
          break;
        default:
          groupKey = "未設定";
      }

      // lineupの場合は既に処理済みなのでスキップ
      if (field !== "lineup") {
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, []);
        }
        grouped.get(groupKey)!.push(schedule);
      }
    });

    // グループをソート（未設定は最後に）
    const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
      if (a[0] === "未設定") return 1;
      if (b[0] === "未設定") return -1;
      return a[0].localeCompare(b[0], "ja");
    });

    return sortedGroups.map(([title, data]) => ({ title, data }));
  };

  const groupedSchedules = groupSchedules(schedules, groupingField);

  const toggleSection = (title: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(title)) {
      newCollapsed.delete(title);
    } else {
      newCollapsed.add(title);
    }
    setCollapsedSections(newCollapsed);
  };

  return (
    <View style={styles.container}>
      {/* ナビゲーションバーのタイトルを非表示 */}
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <HomeButton />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Year {currentYear}</Text>

        {/* 年ボタン */}
        <View style={styles.yearSelector}>
        {availableYears.map((y) => (
          <TouchableOpacity
            key={y}
            style={[
              styles.yearButton,
              currentYear === String(y) && styles.yearButtonActive,
            ]}
            onPress={() => handleSelectYear(y)}
          >
            <Text
              style={[
                styles.yearButtonText,
                currentYear === String(y) && styles.yearButtonTextActive,
              ]}
            >
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* グルーピングフィールド選択 */}
      <View style={styles.groupingSelector}>
        <Text style={styles.groupingLabel}>グルーピング:</Text>
        <View style={styles.groupingButtons}>
          {[
            { value: "none" as GroupingField, label: "なし" },
            { value: "group" as GroupingField, label: "グループ" },
            { value: "category" as GroupingField, label: "カテゴリ" },
            { value: "area" as GroupingField, label: "エリア" },
            { value: "target" as GroupingField, label: "お目当て" },
            { value: "lineup" as GroupingField, label: "出演者" },
            { value: "seller" as GroupingField, label: "販売元" },
            { value: "status" as GroupingField, label: "ステータス" },
          ].map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.groupingButton,
                groupingField === option.value && styles.groupingButtonActive,
              ]}
              onPress={() => setGroupingField(option.value)}
            >
              <Text
                style={[
                  styles.groupingButtonText,
                  groupingField === option.value && styles.groupingButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {groupingField === "none" ? (
        <FlatList
          data={schedules}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={Platform.OS === 'ios' ? '#37352f' : undefined}
              colors={Platform.OS === 'android' ? ['#37352f'] : undefined}
            />
          }
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
          ListHeaderComponent={
            <>
              {loading && <ActivityIndicator color="#333333" />}
              {error && <Text style={styles.errorText}>エラー: {error}</Text>}
            </>
          }
          ListEmptyComponent={
            !loading && !error ? (
              <Text style={styles.emptyText}>スケジュールはありません</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => handleOpenDetail(item.id)}
            >
              <Text style={styles.cardDate}>
                {formatDateTimeUTC(item.datetime)}
              </Text>
              {/* ツアー名 (Group) */}
              {item.group && (
                <Text style={styles.cardGroup} numberOfLines={1}>
                  {item.group}
                </Text>
              )}
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.cardSubContainer}>
                {item.area && (
                  <NotionTag
                    label={item.area}
                    color={areaColors.get(item.id) || getOptionColorSync(item.area, "AREAS")}
                  />
                )}
                <Text style={styles.cardSub}>{item.venue}</Text>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <SectionList
          sections={groupedSchedules}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={Platform.OS === 'ios' ? '#37352f' : undefined}
              colors={Platform.OS === 'android' ? ['#37352f'] : undefined}
            />
          }
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
          ListHeaderComponent={
            <>
              {loading && <ActivityIndicator color="#333333" />}
              {error && <Text style={styles.errorText}>エラー: {error}</Text>}
            </>
          }
          ListEmptyComponent={
            !loading && !error ? (
              <Text style={styles.emptyText}>スケジュールはありません</Text>
            ) : null
          }
          renderSectionHeader={({ section: { title, data } }) => {
            const isCollapsed = collapsedSections.has(title);
            return (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(title)}
              >
                <Text style={styles.sectionHeaderIcon}>
                  {isCollapsed ? "▶" : "▼"}
                </Text>
                <Text style={styles.sectionHeaderTitle}>{title}</Text>
                <Text style={styles.sectionHeaderCount}>({data.length})</Text>
              </TouchableOpacity>
            );
          }}
          renderItem={({ item, section }) => {
            const isCollapsed = collapsedSections.has(section.title);
            if (isCollapsed) return null;
            
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleOpenDetail(item.id)}
              >
                <Text style={styles.cardDate}>
                  {formatDateTimeUTC(item.datetime)}
                </Text>
                {/* ツアー名 (Group) */}
                {item.group && (
                  <Text style={styles.cardGroup} numberOfLines={1}>
                    {item.group}
                  </Text>
                )}
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.cardSubContainer}>
                  {item.area && (
                    <NotionTag
                      label={item.area}
                      color={areaColors.get(item.id) || getOptionColorSync(item.area, "AREAS")}
                    />
                  )}
                  <Text style={styles.cardSub}>{item.venue}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
      </View>
    </View>
  );
}

// RustのUTC時刻をそのまま表示するフォーマット
function formatDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return iso;
  }

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  content: {
    padding: 24,
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  title: {
    paddingHorizontal: 24,
    fontSize: 40,
    fontWeight: "700",
    color: "#37352f",
    marginBottom: 24,
  },
  yearSelector: {
    flexDirection: "row",
    marginBottom: 24,
    gap: 8,
  },
  yearButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    backgroundColor: "#ffffff",
  },
  yearButtonActive: {
    backgroundColor: "#37352f",
    borderColor: "#37352f",
  },
  yearButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "500",
  },
  yearButtonTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  card: {
    padding: 16,
    borderRadius: 3,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 12,
    color: "#787774",
    marginBottom: 6,
    fontWeight: "500",
  },
  cardGroup: {
    fontSize: 12,
    color: "#787774",
    marginBottom: 4,
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 4,
    lineHeight: 22,
  },
  cardSubContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  cardSub: {
    fontSize: 14,
    color: "#787774",
  },
  separator: {
    height: 0,
  },
  errorText: {
    color: "#d93025",
    marginVertical: 8,
    fontSize: 14,
  },
  emptyText: {
    color: "#787774",
    fontSize: 14,
    textAlign: "center",
    marginTop: 24,
    fontStyle: "italic",
  },
  groupingSelector: {
    marginBottom: 24,
  },
  groupingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 8,
  },
  groupingButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  groupingButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    backgroundColor: "#ffffff",
  },
  groupingButtonActive: {
    backgroundColor: "#37352f",
    borderColor: "#37352f",
  },
  groupingButtonText: {
    color: "#37352f",
    fontSize: 12,
    fontWeight: "500",
  },
  groupingButtonTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f7f6f3",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
    marginTop: 8,
  },
  sectionHeaderIcon: {
    fontSize: 12,
    color: "#787774",
    marginRight: 8,
    width: 16,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    flex: 1,
  },
  sectionHeaderCount: {
    fontSize: 12,
    color: "#787774",
  },
});