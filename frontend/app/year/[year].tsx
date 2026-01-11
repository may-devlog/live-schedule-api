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
import { groupSchedules, groupSchedulesNested, type GroupingField, type GroupedSchedule, type MainGroupingField, type SubGroupingField, type NestedGroupedSchedule } from "../../utils/group-schedules";
import { groupStays, type GroupedStay } from "../../utils/group-stays";
import { loadSelectOptionsMap } from "../../utils/load-select-options-map";
import { fetchAreaColors } from "../../utils/fetch-area-colors";
import { fetchWebsiteColors } from "../../utils/fetch-website-colors";
import { formatDateTimeUTC } from "../../utils/format-datetime";
import { YearSelector } from "../../components/YearSelector";
import { calculateTotalCostWithReturnFlag, type TrafficBySchedule } from "../../utils/calculate-total-cost";
import { fetchTrafficBySchedule } from "../../utils/fetch-traffic-by-schedule";

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
  // 各スケジュールの交通情報（往復フラグを考慮した金額計算用）
  const [trafficBySchedule, setTrafficBySchedule] = useState<TrafficBySchedule>(new Map());
  // 予約サイトの色情報（初回表示時の色取得用）
  const [websiteColors, setWebsiteColors] = useState<Map<string, string>>(new Map());
  
  // アーカイブタイプ（イベント or 宿泊）
  const [archiveType, setArchiveType] = useState<"イベント" | "宿泊">("イベント");
  
  // グルーピング関連
  const [mainGroupingField, setMainGroupingField] = useState<MainGroupingField>("none");
  const [subGroupingField, setSubGroupingField] = useState<SubGroupingField>("none");
  const [stayGroupingField, setStayGroupingField] = useState<"website" | "status" | "none">("none");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  
  // 選択肢の並び順情報（グルーピングのソート用）
  const [selectOptionsMap, setSelectOptionsMap] = useState<Map<string, Map<string, number>>>(new Map());
  
  // グルーピング結果のタイトルの色を保持（非同期で取得）
  const [groupTitleColors, setGroupTitleColors] = useState<Map<string, string>>(new Map());
  
  // 宿泊情報のグルーピングタイトルの色を保持（非同期で取得）
  const [stayGroupTitleColors, setStayGroupTitleColors] = useState<Map<string, string>>(new Map());


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

        if (!res.ok) {
          const errorText = await res.text();
          console.error("[YearScreen] Failed to fetch schedules:", res.status, errorText);
          if (res.status === 401) {
            // 認証エラーの場合はログアウト
            const { logout } = await import("../../contexts/AuthContext");
            logout();
            throw new Error("認証に失敗しました。再度ログインしてください。");
          }
          throw new Error(`status: ${res.status} - ${errorText}`);
        }

        const data: Schedule[] = await res.json();
        console.log("YEAR SCHEDULES FROM API:", currentYear, data);
        
        // 各スケジュールの交通情報を並列で取得（往復フラグを考慮した金額計算用）
        const trafficMap = await fetchTrafficBySchedule(data, true);
        
        if (isMounted) {
          setSchedules(data);
          setTrafficBySchedule(trafficMap);
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
            // 予約サイトの色情報を即座に取得（エリアと同様に）
            if (filteredStays.length > 0) {
              try {
                const colorMap = await fetchWebsiteColors(filteredStays);
                if (isMounted) {
                  setWebsiteColors(colorMap);
                }
              } catch (error) {
                console.error("Error loading website colors:", error);
              }
            }
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
        const { orderMap } = await loadSelectOptionsMap();
        if (isMounted) {
          setSelectOptionsMap(orderMap);
        }
        
        // 選択肢の色情報を事前に取得してキャッシュに保存
        const { preloadOptionColors } = await import("../../utils/get-option-color");
        const { loadSelectOptions, loadStaySelectOptions } = await import("../../utils/select-options-storage");
        
        // グルーピングで使用される選択肢の色を事前読み込み
        const [targets, groups, categories, areas, sellers, statuses] = await Promise.all([
          loadSelectOptions("TARGETS"),
          loadSelectOptions("GROUPS"),
          loadSelectOptions("CATEGORIES"),
          loadSelectOptions("AREAS"),
          loadSelectOptions("SELLERS"),
          loadSelectOptions("STATUSES"),
        ]);
        
        preloadOptionColors(targets, "TARGETS");
        preloadOptionColors(groups, "GROUPS");
        preloadOptionColors(categories, "CATEGORIES");
        preloadOptionColors(areas, "AREAS");
        preloadOptionColors(sellers, "SELLERS");
        preloadOptionColors(statuses, "STATUSES");
      } catch (error) {
        console.error("Error loading select options order:", error);
      }
    };
    
    loadOptionsOrder();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // 予約サイトの色情報を取得（staysが変更されたときに再取得）
  useEffect(() => {
    if (archiveType !== "宿泊" || stays.length === 0) return;
    
    let isMounted = true;
    
    const loadWebsiteColors = async () => {
      const colorMap = await fetchWebsiteColors(stays);
      if (isMounted) {
        setWebsiteColors(colorMap);
      }
    };
    
    loadWebsiteColors();
    
    return () => {
      isMounted = false;
    };
  }, [archiveType, stays]);

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
            
            // 各スケジュールの交通情報を並列で取得（往復フラグを考慮した金額計算用）
            const trafficMap = await fetchTrafficBySchedule(yearData, true);
            
            setSchedules(yearData);
            setTrafficBySchedule(trafficMap);
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

  // グルーピングロジック（2段階グルーピング）
  const nestedGroupedSchedules = useMemo(() => {
    return groupSchedulesNested(schedules, mainGroupingField, subGroupingField, selectOptionsMap);
  }, [schedules, mainGroupingField, subGroupingField, selectOptionsMap]);

  // 宿泊情報のグルーピングロジック
  const groupedStays = useMemo(() => {
    return groupStays(stays, stayGroupingField, selectOptionsMap);
  }, [stays, stayGroupingField, selectOptionsMap]);
  
  // グルーピング結果のタイトルの色を非同期で取得（ライブ詳細画面と同じ方法）
  useEffect(() => {
    // nestedGroupedSchedulesの代わりに、その依存関係を直接使用して初期化順序の問題を回避
    if (schedules.length === 0 || (mainGroupingField === "none" && subGroupingField === "none")) {
      setGroupTitleColors(new Map());
      return;
    }
    
    let isMounted = true;
    
    const loadGroupTitleColors = async () => {
      // グルーピングを再計算（useMemoの結果を直接使用せず、依存関係から再計算）
      const currentNestedGroupedSchedules = groupSchedulesNested(schedules, mainGroupingField, subGroupingField, selectOptionsMap);
      if (currentNestedGroupedSchedules.length === 0) {
        if (isMounted) {
          setGroupTitleColors(new Map());
        }
        return;
      }
      
      // まず、キャッシュから即座に色を取得して表示（テキスト表示を避けるため）
      const initialColorMap = new Map<string, string>();
      const colorPromises: Promise<void>[] = [];
      
      for (const mainGroup of currentNestedGroupedSchedules) {
        // メイングループの色を取得
        if (mainGroup.title && mainGroupingField !== "none") {
          let optionType: "TARGETS" | undefined;
          if (mainGroupingField === "target") {
            optionType = "TARGETS";
          } else if (mainGroupingField === "lineup") {
            optionType = "TARGETS"; // LINEUPSはTARGETSと同じ選択肢を使用
          }
          
          if (optionType) {
            // キャッシュから即座に色を取得
            const cachedColor = getOptionColorSync(mainGroup.title, optionType);
            if (cachedColor) {
              initialColorMap.set(`main-${mainGroup.title}`, cachedColor);
            }
            
            // 非同期で最新の色を取得（並列化）
            colorPromises.push(
              getOptionColor(mainGroup.title, optionType).then((color) => {
                if (isMounted) {
                  initialColorMap.set(`main-${mainGroup.title}`, color);
                  setGroupTitleColors(new Map(initialColorMap));
                }
              })
            );
          }
        }
        
        // サブグループの色を取得
        for (const subGroup of mainGroup.subGroups) {
          if (subGroup.title && subGroupingField !== "none") {
            let optionType: "CATEGORIES" | "AREAS" | "TARGETS" | "SELLERS" | "STATUSES" | "GROUPS" | undefined;
            switch (subGroupingField) {
              case "group":
                // グループが選択肢として存在するかチェック
                const groupOrderMap = selectOptionsMap.get("group");
                if (!groupOrderMap || !groupOrderMap.has(subGroup.title)) {
                  // 選択肢に存在しない場合はタイトルから取っているので色を取得しない
                  continue;
                }
                optionType = "GROUPS";
                break;
              case "category":
                optionType = "CATEGORIES";
                break;
              case "area":
                optionType = "AREAS";
                break;
              case "seller":
                optionType = "SELLERS";
                break;
              case "status":
                optionType = "STATUSES";
                break;
              default:
                continue;
            }
            
            if (optionType) {
              const key = mainGroup.title 
                ? `sub-${mainGroup.title}-${subGroup.title}`
                : `sub-${subGroup.title}`;
              
              // キャッシュから即座に色を取得
              const cachedColor = getOptionColorSync(subGroup.title, optionType);
              if (cachedColor) {
                initialColorMap.set(key, cachedColor);
              }
              
              // 非同期で最新の色を取得（並列化）
              colorPromises.push(
                getOptionColor(subGroup.title, optionType).then((color) => {
                  if (isMounted) {
                    initialColorMap.set(key, color);
                    setGroupTitleColors(new Map(initialColorMap));
                  }
                })
              );
            }
          }
        }
      }
      
      // キャッシュから取得した色を即座に設定
      if (isMounted && initialColorMap.size > 0) {
        setGroupTitleColors(new Map(initialColorMap));
      }
      
      // 並列で最新の色を取得して更新
      await Promise.all(colorPromises);
    };
    
    loadGroupTitleColors();
    
    return () => {
      isMounted = false;
    };
  }, [schedules, mainGroupingField, subGroupingField, selectOptionsMap]);
  
  // 宿泊情報のグルーピングタイトルの色を非同期で取得
  useEffect(() => {
    if (archiveType !== "宿泊" || groupedStays.length === 0 || stayGroupingField === "none") {
      setStayGroupTitleColors(new Map());
      return;
    }
    
    let isMounted = true;
    
    const loadStayGroupTitleColors = async () => {
      // まず、キャッシュから即座に色を取得して表示（テキスト表示を避けるため）
      const initialColorMap = new Map<string, string>();
      const colorPromises: Promise<void>[] = [];
      
      for (const group of groupedStays) {
        if (group.title && group.title !== "未設定") {
          if (stayGroupingField === "website") {
            // キャッシュから即座に色を取得
            const cachedColor = getOptionColorSync(group.title, "WEBSITE");
            if (cachedColor) {
              initialColorMap.set(group.title, cachedColor);
            }
            
            // 非同期で最新の色を取得（並列化）
            colorPromises.push(
              getOptionColor(group.title, "WEBSITE").then((color) => {
                if (isMounted) {
                  initialColorMap.set(group.title, color);
                  setStayGroupTitleColors(new Map(initialColorMap));
                }
              })
            );
          } else if (stayGroupingField === "status") {
            // 宿泊情報のステータスは選択肢から色を取得できないので、デフォルト色を使用
            if (isMounted) {
              initialColorMap.set(group.title, "#E5E7EB"); // グレー
            }
          }
        }
      }
      
      // キャッシュから取得した色を即座に設定
      if (isMounted && initialColorMap.size > 0) {
        setStayGroupTitleColors(new Map(initialColorMap));
      }
      
      // 並列で最新の色を取得して更新
      await Promise.all(colorPromises);
    };
    
    loadStayGroupTitleColors();
    
    return () => {
      isMounted = false;
    };
  }, [groupedStays, stayGroupingField, archiveType]);

  const toggleSection = (title: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(title)) {
      newCollapsed.delete(title);
    } else {
      newCollapsed.add(title);
    }
    setCollapsedSections(newCollapsed);
  };

  // 往復フラグを考慮した総費用を計算（共通関数を使用）
  const calculateTotalCost = (schedule: Schedule): number | null => {
    return calculateTotalCostWithReturnFlag(schedule, trafficBySchedule);
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

        {/* アーカイブタイプ選択（イベント / 宿泊） */}
        <View style={styles.archiveTypeSelector}>
          <TouchableOpacity
            style={[
              styles.archiveTypeButton,
              archiveType === "イベント" && styles.archiveTypeButtonActive,
            ]}
            onPress={() => setArchiveType("イベント")}
          >
            <Text
              style={[
                styles.archiveTypeButtonText,
                archiveType === "イベント" && styles.archiveTypeButtonTextActive,
              ]}
            >
              イベント
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
      {archiveType === "イベント" ? (
        <>
          <View style={styles.groupingSelector}>
            <Text style={styles.groupingLabel}>メイン</Text>
            <View style={styles.groupingButtons}>
              {[
                { value: "none" as MainGroupingField, label: "なし" },
                { value: "target" as MainGroupingField, label: "お目当て" },
                { value: "lineup" as MainGroupingField, label: "出演者" },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.groupingButton,
                    mainGroupingField === option.value && styles.groupingButtonActive,
                  ]}
                  onPress={() => setMainGroupingField(option.value)}
                >
                  <Text
                    style={[
                      styles.groupingButtonText,
                      mainGroupingField === option.value && styles.groupingButtonTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.groupingSelector}>
            <Text style={styles.groupingLabel}>サブ</Text>
            <View style={styles.groupingButtons}>
              {[
                { value: "none" as SubGroupingField, label: "なし" },
                { value: "group" as SubGroupingField, label: "グループ" },
                { value: "category" as SubGroupingField, label: "カテゴリ" },
                { value: "area" as SubGroupingField, label: "エリア" },
                { value: "seller" as SubGroupingField, label: "販売元" },
                { value: "status" as SubGroupingField, label: "ステータス" },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.groupingButton,
                    subGroupingField === option.value && styles.groupingButtonActive,
                  ]}
                  onPress={() => setSubGroupingField(option.value)}
                >
                  <Text
                    style={[
                      styles.groupingButtonText,
                      subGroupingField === option.value && styles.groupingButtonTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      ) : (
        <View style={styles.groupingSelector}>
          <Text style={styles.groupingLabel}>グルーピング:</Text>
          <View style={styles.groupingButtons}>
            {[
              { value: "none" as const, label: "なし" },
              { value: "website" as const, label: "予約サイト" },
              { value: "status" as const, label: "ステータス" },
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

      {archiveType === "イベント" ? (
        mainGroupingField === "none" && subGroupingField === "none" ? (
        <FlatList
          data={schedules}
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
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => handleOpenDetail(item.id)}
            >
              <View style={styles.cardRow}>
                <Text style={styles.cardDate}>
                  {formatDateTimeUTC(item.datetime)}
                </Text>
                {(() => {
                  const totalCost = calculateTotalCost(item);
                  return totalCost && totalCost > 0 ? (
                    <Text style={styles.cardPrice}>
                      ¥{totalCost.toLocaleString()}
                    </Text>
                  ) : null;
                })()}
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
        <FlatList
          data={nestedGroupedSchedules}
          keyExtractor={(item, index) => `main-${index}-${item.title}`}
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
          renderItem={({ item: mainGroup }) => {
            const mainGroupKey = mainGroup.title || "未設定";
            const isMainCollapsed = collapsedSections.has(`main-${mainGroupKey}`);
            const isMainNone = !mainGroup.title;
            
            // メイングループの総費用を計算
            const mainTotalCost = mainGroup.subGroups.reduce((sum, subGroup) => {
              return sum + subGroup.data.reduce((subSum, schedule) => {
                const cost = calculateTotalCost(schedule);
                return subSum + (cost ?? 0);
              }, 0);
            }, 0);
            
            return (
              <View>
                {/* メイングループヘッダー（メインが「なし」の場合は表示しない） */}
                {!isMainNone && mainGroup.title && (
                  <TouchableOpacity
                    style={styles.mainGroupHeader}
                    onPress={() => toggleSection(`main-${mainGroupKey}`)}
                  >
                    <Text style={styles.mainGroupHeaderIcon}>
                      {isMainCollapsed ? "▶" : "▼"}
                    </Text>
                    {(() => {
                      const color = groupTitleColors.get(`main-${mainGroup.title}`);
                      return color ? (
                        <NotionTag
                          label={mainGroup.title}
                          color={color}
                        />
                      ) : (
                        <Text style={styles.mainGroupHeaderTitle}>{mainGroup.title}</Text>
                      );
                    })()}
                    <Text style={styles.mainGroupHeaderCount}>
                      ({mainGroup.subGroups.reduce((sum, sg) => sum + sg.data.length, 0)})
                    </Text>
                  </TouchableOpacity>
                )}
                {!isMainNone && mainTotalCost > 0 && !isMainCollapsed && (
                  <View style={styles.mainGroupTotalCost}>
                    <Text style={styles.mainGroupTotalCostText}>
                      ¥{mainTotalCost.toLocaleString()}
                    </Text>
                  </View>
                )}
                
                {/* サブグループ */}
                {(!isMainNone ? !isMainCollapsed : true) && mainGroup.subGroups.map((subGroup, subIndex) => {
                  // サブが「なし」の場合はサブグループヘッダーを表示しない
                  const isSubNone = !subGroup.title;
                  const subGroupKey = isMainNone 
                    ? subGroup.title || "未設定"
                    : `${mainGroupKey}-${subGroup.title || "未設定"}`;
                  const isSubCollapsed = collapsedSections.has(subGroupKey);
                  
                  // サブグループの総費用を計算
                  const subTotalCost = subGroup.data.reduce((sum, schedule) => {
                    const cost = calculateTotalCost(schedule);
                    return sum + (cost ?? 0);
                  }, 0);
                  
                  return (
                    <View key={`sub-${subIndex}`}>
                      {/* サブグループヘッダー（サブが「なし」の場合は表示しない） */}
                      {!isSubNone && (
                        <TouchableOpacity
                          style={isMainNone ? styles.sectionHeader : styles.subGroupHeader}
                          onPress={() => toggleSection(subGroupKey)}
                        >
                          <Text style={isMainNone ? styles.sectionHeaderIcon : styles.subGroupHeaderIcon}>
                            {isSubCollapsed ? "▶" : "▼"}
                          </Text>
                          {(() => {
                            const key = mainGroup.title 
                              ? `sub-${mainGroup.title}-${subGroup.title}`
                              : `sub-${subGroup.title}`;
                            const color = groupTitleColors.get(key);
                            return color ? (
                              <NotionTag
                                label={subGroup.title}
                                color={color}
                              />
                            ) : (
                              <Text style={isMainNone ? styles.sectionHeaderTitle : styles.subGroupHeaderTitle}>
                                {subGroup.title}
                              </Text>
                            );
                          })()}
                          <Text style={isMainNone ? styles.sectionHeaderCount : styles.subGroupHeaderCount}>
                            ({subGroup.data.length})
                          </Text>
                        </TouchableOpacity>
                      )}
                      {!isSubNone && subTotalCost > 0 && !isSubCollapsed && (
                        <View style={isMainNone ? styles.sectionTotalCost : styles.subGroupTotalCost}>
                          <Text style={isMainNone ? styles.sectionTotalCostText : styles.subGroupTotalCostText}>
                            ¥{subTotalCost.toLocaleString()}
                          </Text>
                        </View>
                      )}
                      
                      {/* スケジュールアイテム */}
                      {(!isSubNone ? !isSubCollapsed : true) && subGroup.data.map((schedule) => (
                        <TouchableOpacity
                          key={schedule.id}
                          style={styles.card}
                          onPress={() => handleOpenDetail(schedule.id)}
                        >
                          <View style={styles.cardRow}>
                            <Text style={styles.cardDate}>
                              {formatDateTimeUTC(schedule.datetime)}
                            </Text>
                            {(() => {
                              const totalCost = calculateTotalCost(schedule);
                              return totalCost && totalCost > 0 ? (
                                <Text style={styles.cardPrice}>
                                  ¥{totalCost.toLocaleString()}
                                </Text>
                              ) : null;
                            })()}
                          </View>
                          {/* ツアー名 (Group) */}
                          {schedule.group && (
                            <Text style={styles.cardGroup} numberOfLines={1}>
                              {schedule.group}
                            </Text>
                          )}
                          <Text style={styles.cardTitle} numberOfLines={2}>
                            {schedule.title}
                          </Text>
                          <View style={styles.cardSubContainer}>
                            {schedule.area && (
                              <NotionTag
                                label={schedule.area}
                                color={areaColors.get(schedule.id) || getOptionColorSync(schedule.area, "AREAS")}
                              />
                            )}
                            <Text style={styles.cardSub}>{schedule.venue}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </View>
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
                      color={websiteColors.get(item.website) || getOptionColorSync(item.website, "WEBSITE")}
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
                <Text style={styles.emptyText}>宿泊情報はありません</Text>
              ) : null
            }
            renderSectionHeader={({ section: { title, data } }) => {
              const isCollapsed = collapsedSections.has(title);
              const color = stayGroupTitleColors.get(title);
              
              return (
                <View>
                  <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => toggleSection(title)}
                  >
                    <Text style={styles.sectionHeaderIcon}>
                      {isCollapsed ? "▶" : "▼"}
                    </Text>
                    {color ? (
                      <NotionTag
                        label={title}
                        color={color}
                      />
                    ) : (
                      <Text style={styles.sectionHeaderTitle}>{title}</Text>
                    )}
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
                        color={websiteColors.get(item.website) || getOptionColorSync(item.website, "WEBSITE")}
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
    flex: 1,
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
    color: "#787774",
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
    marginLeft: 8,
  },
  sectionTotalCost: {
    paddingLeft: 40, // ヘッダーのpadding(16) + アイコンのwidth(16) + アイコンのmarginRight(8) = 40
    paddingRight: 16,
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
  mainGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#f7f6f3",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
    marginTop: 8,
  },
  mainGroupHeaderIcon: {
    fontSize: 14,
    color: "#787774",
    marginRight: 8,
    width: 20,
  },
  mainGroupHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#37352f",
    flex: 1,
  },
  mainGroupHeaderCount: {
    fontSize: 14,
    color: "#787774",
    fontWeight: "500",
    marginLeft: 8,
  },
  mainGroupTotalCost: {
    paddingLeft: 44, // ヘッダーのpadding(16) + アイコンのwidth(20) + アイコンのmarginRight(8) = 44
    paddingRight: 16,
    paddingVertical: 8,
    backgroundColor: "#f7f6f3",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  mainGroupTotalCostText: {
    fontSize: 15,
    color: "#37352f",
    fontWeight: "700",
  },
  subGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: "#fafafa",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  subGroupHeaderIcon: {
    fontSize: 12,
    color: "#787774",
    marginRight: 8,
    width: 16,
  },
  subGroupHeaderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    flex: 1,
  },
  subGroupHeaderCount: {
    fontSize: 12,
    color: "#787774",
    marginLeft: 8,
  },
  subGroupTotalCost: {
    paddingLeft: 56, // ヘッダーのpadding(32) + アイコンのwidth(16) + アイコンのmarginRight(8) = 56
    paddingRight: 32,
    paddingVertical: 6,
    backgroundColor: "#fafafa",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  subGroupTotalCostText: {
    fontSize: 13,
    color: "#37352f",
    fontWeight: "600",
  },
});