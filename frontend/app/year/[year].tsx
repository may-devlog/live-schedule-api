// app/year/[year].tsx

import { useLocalSearchParams, Stack, useRouter } from "expo-router";
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
import type { Schedule } from "../HomeScreen";
import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { PageHeader } from "../../components/PageHeader";
import { NotionTag } from "../../components/notion-tag";
import { getOptionColor, getOptionColorSync } from "../../utils/get-option-color";
import { groupSchedules, type GroupingField, type GroupedSchedule } from "../../utils/group-schedules";
import { groupStays, type GroupedStay } from "../../utils/group-stays";
import { loadSelectOptionsMap } from "../../utils/load-select-options-map";
import { fetchAreaColors } from "../../utils/fetch-area-colors";
import { formatDateTimeUTC } from "../../utils/format-datetime";
import { YearSelector } from "../../components/YearSelector";

export default function YearScreen() {
  const params = useLocalSearchParams<{ year: string }>();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(
    params.year ?? null
  );

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [stays, setStays] = useState<any[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  
  // アーカイブタイプ（ライブ or 宿泊）
  const [archiveType, setArchiveType] = useState<"ライブ" | "宿泊">("ライブ");
  
  // グルーピング関連
  const [groupingField, setGroupingField] = useState<GroupingField>("none");
  const [stayGroupingField, setStayGroupingField] = useState<"website" | "none">("none");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  
  // 選択肢の並び順情報（グルーピングのソート用）
  const [selectOptionsMap, setSelectOptionsMap] = useState<Map<string, Map<string, number>>>(new Map());


  // 利用可能な年を取得
  useEffect(() => {
    let isMounted = true;
    
    const loadAvailableYears = async () => {
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
        if (isMounted) {
          setAvailableYears(sortedYears);
        }
      } catch (e: any) {
        console.error("ERROR FETCHING AVAILABLE YEARS:", e);
      }
    };
    
    loadAvailableYears();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // currentYear が変わるたびにその年を再取得
  useEffect(() => {
    if (!currentYear) return;
    
    let isMounted = true;
    
    const loadYear = async () => {
      try {
        setLoading(true);
        setError(null);

        // スケジュールを取得
        const url = getApiUrl(`/schedules?year=${currentYear}`);
        const res = await authenticatedFetch(url);

        if (!res.ok) throw new Error(`status: ${res.status}`);

        const data: Schedule[] = await res.json();
        console.log("YEAR SCHEDULES FROM API:", currentYear, data);
        if (isMounted) {
          setSchedules(data);
        }

        // 宿泊情報を取得
        const staysUrl = getApiUrl("/stay/all");
        const staysRes = await authenticatedFetch(staysUrl);
        if (staysRes.ok) {
          const allStays: any[] = await staysRes.json();
          // 年でフィルタリング
          const yearNum = parseInt(currentYear, 10);
          const filteredStays = allStays.filter((stay) => {
            if (stay.check_in) {
              const checkInYear = parseInt(stay.check_in.substring(0, 4), 10);
              return !isNaN(checkInYear) && checkInYear === yearNum;
            }
            return false;
          });
          if (isMounted) {
            setStays(filteredStays);
          }
        }
      } catch (e: any) {
        console.log("ERROR FETCHING YEAR:", e);
        if (isMounted) {
          setError(e.message ?? "Unknown error");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    loadYear();
    
    return () => {
      isMounted = false;
    };
  }, [currentYear]);

  // Areaの色情報を取得
  useEffect(() => {
    if (schedules.length === 0) return;
    
    let isMounted = true;
    
    const loadAreaColors = async () => {
      const colorMap = await fetchAreaColors(schedules);
      if (isMounted) {
        setAreaColors(colorMap);
      }
    };
    
    loadAreaColors();
    
    return () => {
      isMounted = false;
    };
  }, [schedules]);

  // 選択肢の並び順情報を取得（グルーピングのソート用）
  useEffect(() => {
    let isMounted = true;
    
    const loadOptionsOrder = async () => {
      try {
        const orderMap = await loadSelectOptionsMap();
        if (isMounted) {
          setSelectOptionsMap(orderMap);
        }
      } catch (error) {
        console.error("Error loading select options order:", error);
      }
    };
    
    loadOptionsOrder();
    
    return () => {
      isMounted = false;
    };
  }, []);

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
      // 利用可能な年を再取得
      const url = getApiUrl("/public/schedules");
      const res = await fetch(url);
      if (res.ok) {
        const data: Schedule[] = await res.json();
        const years = new Set<number>();
        data.forEach((schedule) => {
          if (schedule.date) {
            const year = parseInt(schedule.date.substring(0, 4), 10);
            if (!isNaN(year)) {
              years.add(year);
            }
          } else if (schedule.datetime) {
            const date = new Date(schedule.datetime);
            const year = date.getUTCFullYear();
            if (!isNaN(year)) {
              years.add(year);
            }
          }
        });
        const sortedYears = Array.from(years).sort((a, b) => b - a);
        setAvailableYears(sortedYears);
      }
      
      // 現在の年のスケジュールを再取得
      if (currentYear) {
        setLoading(true);
        setError(null);
        try {
          const yearUrl = getApiUrl(`/schedules?year=${currentYear}`);
          const yearRes = await authenticatedFetch(yearUrl);
          if (yearRes.ok) {
            const yearData: Schedule[] = await yearRes.json();
            setSchedules(yearData);
          }
        } catch (e: any) {
          setError(e.message ?? "Unknown error");
        } finally {
          setLoading(false);
        }
      }
    } finally {
      setRefreshing(false);
    }
  };

  // グルーピングロジック
  const groupedSchedules = useMemo(() => {
    return groupSchedules(schedules, groupingField, selectOptionsMap);
  }, [schedules, groupingField, selectOptionsMap]);

  // 宿泊情報のグルーピングロジック
  const groupedStays = useMemo(() => {
    return groupStays(stays, stayGroupingField, selectOptionsMap);
  }, [stays, stayGroupingField, selectOptionsMap]);

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
      
      <PageHeader showBackButton={true} homePath="/" />

      <View style={styles.content}>
        {/* 年選択（プルダウン） */}
        <YearSelector
          availableYears={availableYears}
          currentYear={currentYear}
          onSelectYear={(year) => handleSelectYear(year)}
        />

        {/* アーカイブタイプ選択（ライブ / 宿泊） */}
        <View style={styles.archiveTypeSelector}>
          <TouchableOpacity
            style={[
              styles.archiveTypeButton,
              archiveType === "ライブ" && styles.archiveTypeButtonActive,
            ]}
            onPress={() => setArchiveType("ライブ")}
          >
            <Text
              style={[
                styles.archiveTypeButtonText,
                archiveType === "ライブ" && styles.archiveTypeButtonTextActive,
              ]}
            >
              ライブ
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.archiveTypeButton,
              archiveType === "宿泊" && styles.archiveTypeButtonActive,
            ]}
            onPress={() => setArchiveType("宿泊")}
          >
            <Text
              style={[
                styles.archiveTypeButtonText,
                archiveType === "宿泊" && styles.archiveTypeButtonTextActive,
              ]}
            >
              宿泊
            </Text>
          </TouchableOpacity>
        </View>

      {/* グルーピングフィールド選択 */}
      {archiveType === "ライブ" ? (
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
      ) : (
        <View style={styles.groupingSelector}>
          <Text style={styles.groupingLabel}>グルーピング:</Text>
          <View style={styles.groupingButtons}>
            {[
              { value: "none" as const, label: "なし" },
              { value: "website" as const, label: "予約サイト" },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.groupingButton,
                  stayGroupingField === option.value && styles.groupingButtonActive,
                ]}
                onPress={() => setStayGroupingField(option.value)}
              >
                <Text
                  style={[
                    styles.groupingButtonText,
                    stayGroupingField === option.value && styles.groupingButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {archiveType === "ライブ" ? (
        groupingField === "none" ? (
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
              <View style={styles.cardRow}>
                <Text style={styles.cardDate}>
                  {formatDateTimeUTC(item.datetime)}
                </Text>
                {item.total_cost && item.total_cost > 0 && (
                  <Text style={styles.cardPrice}>
                    ¥{item.total_cost.toLocaleString()}
                  </Text>
                )}
              </View>
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
            // 総費用の合計を計算
            const totalCost = data.reduce((sum, schedule) => {
              return sum + (schedule.total_cost ?? 0);
            }, 0);
            
            return (
              <View>
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
                {totalCost > 0 && (
                  <View style={styles.sectionTotalCost}>
                    <Text style={styles.sectionTotalCostText}>
                      ¥{totalCost.toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>
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
                <View style={styles.cardRow}>
                  <Text style={styles.cardDate}>
                    {formatDateTimeUTC(item.datetime)}
                  </Text>
                  {item.total_cost && item.total_cost > 0 && (
                    <Text style={styles.cardPrice}>
                      ¥{item.total_cost.toLocaleString()}
                    </Text>
                  )}
                </View>
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
        )
      ) : (
        stayGroupingField === "none" ? (
          <FlatList
            data={stays}
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
                <Text style={styles.emptyText}>宿泊情報はありません</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/stay/${item.id}`)}
              >
                <View style={styles.cardRow}>
                  <Text style={styles.cardDate}>
                    {item.check_in} - {item.check_out}
                  </Text>
                  {item.fee && item.fee > 0 && (
                    <Text style={styles.cardPrice}>
                      ¥{item.fee.toLocaleString()}
                    </Text>
                  )}
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.hotel_name}
                </Text>
                {item.website && (
                  <View style={styles.cardSubContainer}>
                    <NotionTag
                      label={item.website}
                      color={getOptionColorSync(item.website, "WEBSITE")}
                    />
                  </View>
                )}
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <SectionList
            sections={groupedStays}
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
                <Text style={styles.emptyText}>宿泊情報はありません</Text>
              ) : null
            }
            renderSectionHeader={({ section: { title, data } }) => {
              const isCollapsed = collapsedSections.has(title);
              
              return (
                <View>
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
                </View>
              );
            }}
            renderItem={({ item, section }) => {
              const isCollapsed = collapsedSections.has(section.title);
              if (isCollapsed) return null;
              
              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => router.push(`/stay/${item.id}`)}
                >
                  <View style={styles.cardRow}>
                    <Text style={styles.cardDate}>
                      {item.check_in} - {item.check_out}
                    </Text>
                    {item.fee && item.fee > 0 && (
                      <Text style={styles.cardPrice}>
                        ¥{item.fee.toLocaleString()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.hotel_name}
                  </Text>
                  {item.website && (
                    <View style={styles.cardSubContainer}>
                      <NotionTag
                        label={item.website}
                        color={getOptionColorSync(item.website, "WEBSITE")}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )
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
  },
  title: {
    paddingHorizontal: 24,
    fontSize: 32,
    fontWeight: "700",
    color: "#37352f",
    marginBottom: 24,
  },
  archiveTypeSelector: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  archiveTypeButton: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  archiveTypeButtonActive: {
    backgroundColor: "#37352f",
    borderColor: "#37352f",
  },
  archiveTypeButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "500",
  },
  archiveTypeButtonTextActive: {
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
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardDate: {
    fontSize: 12,
    color: "#787774",
    fontWeight: "500",
    flex: 1,
  },
  cardPrice: {
    fontSize: 12,
    color: "#37352f",
    fontWeight: "500",
    textAlign: "right",
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
  sectionTotalCost: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: "#f7f6f3",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  sectionTotalCostText: {
    fontSize: 14,
    color: "#37352f",
    fontWeight: "600",
  },
});