// app/share/[share_id]/year/[year].tsx - 共有ページ用の年別ページ

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState, useMemo } from "react";
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
import type { Schedule } from "../../../HomeScreen";
import { getApiUrl } from "../../../../utils/api";
import { PageHeader } from "../../../../components/PageHeader";
import { NotionTag } from "../../../../components/notion-tag";
import { getOptionColor, getOptionColorSync } from "../../../../utils/get-option-color";
import { groupSchedules, type GroupingField, type GroupedSchedule } from "../../../../utils/group-schedules";
import { loadSelectOptionsMap } from "../../../../utils/load-select-options-map";
import { fetchAreaColors } from "../../../../utils/fetch-area-colors";
import { formatDateTimeUTC } from "../../../../utils/format-datetime";

export default function SharedYearScreen() {
  const { share_id, year } = useLocalSearchParams<{ share_id: string; year: string }>();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(year ?? null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  
  // グルーピング関連
  const [groupingField, setGroupingField] = useState<GroupingField>("none");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  
  // 選択肢の並び順情報（グルーピングのソート用）
  const [selectOptionsMap, setSelectOptionsMap] = useState<Map<string, Map<string, number>>>(new Map());

  const fetchAvailableYears = async () => {
    try {
      if (!share_id) return;
      
      // 共有スケジュールAPIから全データを取得して年を抽出
      const url = getApiUrl(`/share/${share_id}`);
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
      if (!share_id) return;
      
      setLoading(true);
      setError(null);

      // 共有スケジュールAPIから全データを取得して年でフィルタリング
      const url = getApiUrl(`/share/${share_id}`);
      const res = await fetch(url);

      if (!res.ok) throw new Error(`status: ${res.status}`);

      const data: Schedule[] = await res.json();
      
      // 年でフィルタリング
      const yearNum = parseInt(y, 10);
      const filtered = data.filter((schedule) => {
        if (schedule.date) {
          const scheduleYear = parseInt(schedule.date.substring(0, 4), 10);
          return !isNaN(scheduleYear) && scheduleYear === yearNum;
        } else if (schedule.datetime) {
          const date = new Date(schedule.datetime);
          const scheduleYear = date.getUTCFullYear();
          return !isNaN(scheduleYear) && scheduleYear === yearNum;
        }
        return false;
      });
      
      console.log("YEAR SCHEDULES FROM API:", y, filtered);
      setSchedules(filtered);
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
  }, [share_id]);

  // currentYear が変わるたびにその年を再取得
  useEffect(() => {
    if (!currentYear || !share_id) return;
    fetchYear(currentYear);
  }, [currentYear, share_id]);

  // Areaの色情報を取得
  useEffect(() => {
    if (schedules.length === 0) return;
    
    const loadAreaColors = async () => {
      const colorMap = await fetchAreaColors(schedules);
      setAreaColors(colorMap);
    };
    
    loadAreaColors();
  }, [schedules]);

  // 選択肢の並び順情報を取得（グルーピングのソート用）
  useEffect(() => {
    if (!share_id) return;
    
    const loadOptionsOrder = async () => {
      try {
        const orderMap = await loadSelectOptionsMap(share_id);
        setSelectOptionsMap(orderMap);
      } catch (error) {
        console.error("Error loading select options order:", error);
      }
    };
    
    loadOptionsOrder();
  }, [share_id]);

  const handleSelectYear = (y: number) => {
    const yStr = String(y);
    setCurrentYear(yStr);
  };

  const handleOpenDetail = (id: number) => {
    if (!share_id) return;
    router.push(`/share/${share_id}/schedules/${id}`);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (currentYear && share_id) {
        await fetchYear(currentYear);
      }
      await fetchAvailableYears();
    } finally {
      setRefreshing(false);
    }
  };

  // グルーピングロジック
  const groupedSchedules = useMemo(() => {
    return groupSchedules(schedules, groupingField, selectOptionsMap);
  }, [schedules, groupingField, selectOptionsMap]);

  const toggleSection = (title: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(title)) {
      newCollapsed.delete(title);
    } else {
      newCollapsed.add(title);
    }
    setCollapsedSections(newCollapsed);
  };

  if (!share_id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Share ID not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader showBackButton={true} homePath={`/share/${share_id}`} />
      
      <View style={styles.content}>
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
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh}
                tintColor={Platform.OS === 'ios' ? '#37352f' : undefined}
                colors={Platform.OS === 'android' ? ['#37352f'] : undefined}
              />
            }
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


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    padding: 24,
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
    flex: 1,
  },
  title: {
    paddingHorizontal: 24,
    fontSize: 32,
    fontWeight: "700",
    color: "#37352f",
    marginBottom: 24,
  },
  yearSelector: {
    flexDirection: "row",
    marginBottom: 16,
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

