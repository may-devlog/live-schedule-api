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
  type GroupingField = "group" | "category" | "area" | "target" | "lineup" | "seller" | "status" | "none";
  const [groupingField, setGroupingField] = useState<GroupingField>("group");
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

  // 選択肢の並び順情報を取得（グルーピングのソート用）
  useEffect(() => {
    if (!share_id) return;
    
    const loadOptionsOrder = async () => {
      try {
        const [categories, areas, targets, sellers, statuses] = await Promise.all([
          loadSelectOptions("CATEGORIES", share_id),
          loadSelectOptions("AREAS", share_id),
          loadSelectOptions("TARGETS", share_id),
          loadSelectOptions("SELLERS", share_id),
          loadSelectOptions("STATUSES", share_id),
        ]);

        const orderMap = new Map<string, Map<string, number>>();
        
        // 各選択肢タイプのorder情報をマップに保存
        // loadSelectOptionsで取得した選択肢は既にorderでソートされているので、その順序を使用
        const categoryOrder = new Map<string, number>();
        categories.forEach((opt, idx) => {
          // opt.orderが存在する場合はそれを使用、存在しない場合は配列のインデックスを使用
          categoryOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
        });
        orderMap.set("category", categoryOrder);

        const areaOrder = new Map<string, number>();
        // loadSelectOptionsで取得した選択肢は既にorderでソートされているので、その順序を使用
        console.log("[SharedYear] Areas loaded:", areas.map(opt => ({ label: opt.label, order: opt.order })));
        areas.forEach((opt, idx) => {
          areaOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
        });
        console.log("[SharedYear] Area order map:", Array.from(areaOrder.entries()).sort((a, b) => a[1] - b[1]));
        orderMap.set("area", areaOrder);

        const targetOrder = new Map<string, number>();
        targets.forEach((opt, idx) => {
          targetOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
        });
        orderMap.set("target", targetOrder);
        orderMap.set("lineup", targetOrder); // LineupもTargetと同じ選択肢を使用

        const sellerOrder = new Map<string, number>();
        sellers.forEach((opt, idx) => {
          sellerOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
        });
        orderMap.set("seller", sellerOrder);

        const statusOrder = new Map<string, number>();
        statuses.forEach((opt, idx) => {
          statusOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
        });
        orderMap.set("status", statusOrder);

        console.log(`[SharedYear] selectOptionsMap set with keys:`, Array.from(orderMap.keys()));
        console.log(`[SharedYear] area order map size:`, orderMap.get("area")?.size);
        console.log(`[SharedYear] area order map entries:`, Array.from(orderMap.get("area")?.entries() || []));
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
  type GroupedSchedule = {
    title: string;
    data: Schedule[];
  };

  const groupedSchedules = useMemo(() => {
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

      // グループをソート
      const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
        const [titleA, dataA] = a;
        const [titleB, dataB] = b;
        
        // 未設定は最後に
        if (titleA === "未設定") return 1;
        if (titleB === "未設定") return -1;

        // groupの場合は、各グループに含まれる一番古い開演時間でソート
        if (field === "group") {
          const getEarliestDatetime = (schedules: Schedule[]): number => {
            return Math.min(...schedules.map(s => {
              try {
                return new Date(s.datetime).getTime();
              } catch {
                return Infinity;
              }
            }));
          };
          const timeA = getEarliestDatetime(dataA);
          const timeB = getEarliestDatetime(dataB);
          return timeA - timeB;
        }

        // その他のフィールドの場合は、選択肢のorderでソート
        const orderMap = selectOptionsMap.get(field);
        if (orderMap && orderMap.size > 0) {
          const orderA = orderMap.get(titleA);
          const orderB = orderMap.get(titleB);
          // 両方のorderが存在する場合はorderでソート
          if (orderA !== undefined && orderB !== undefined) {
            return orderA - orderB;
          }
          // 片方だけorderがある場合は、orderがある方を前に
          if (orderA !== undefined) return -1;
          if (orderB !== undefined) return 1;
        }

        // orderがない場合は文字列比較
        // デバッグ用: orderが見つからない場合のログ
        if (field === "area") {
          console.log(`[SharedYear] Order not found for area grouping:`, {
            field,
            titleA,
            titleB,
            orderA: orderMap?.get(titleA),
            orderB: orderMap?.get(titleB),
            orderMapSize: orderMap?.size,
            selectOptionsMapKeys: Array.from(selectOptionsMap.keys()),
            orderMapExists: orderMap !== undefined,
          });
        }
        return titleA.localeCompare(titleB, "ja");
      });

      return sortedGroups.map(([title, data]) => ({ title, data }));
    };

    return groupSchedules(schedules, groupingField);
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

