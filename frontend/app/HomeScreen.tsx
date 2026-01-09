// app/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { PersonIcon, LockIcon, NotificationIcon } from "@/components/CustomIcons";

export type Schedule = {
  id: number;
  title: string;
  group: string | null; // groupがNULLの場合はNULLのまま（表示時は"-"を表示）
  datetime: string; // date + start から生成（計算フィールド）
  date?: string | null;
  open?: string | null;
  start?: string | null;
  end?: string | null;
  notes?: string | null;
  category?: string | null;
  area: string;
  venue: string;
  target?: string | null;
  lineup?: string | null;
  seller?: string | null;
  ticket_fee?: number | null;
  drink_fee?: number | null;
  total_fare?: number | null;
  stay_fee?: number | null;
  travel_cost?: number | null;
  total_cost?: number | null;
  status: string; // "Canceled" | "Pending" | "Keep" | "Done"
  related_schedule_ids?: number[];
  traffic_ids?: string[];
  stay_ids?: string[];
  user_id?: number | null;
  is_public?: boolean;
};

export type Notification = {
  id: number;
  user_id: number;
  stay_id: number;
  schedule_id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

import { authenticatedFetch, getApiUrl } from "../utils/api";
import { ScheduleCalendar } from "../components/ScheduleCalendar";
import { NotionTag } from "../components/notion-tag";
import { getOptionColorSync } from "../utils/get-option-color";
import { fetchAreaColors } from "../utils/fetch-area-colors";
import { calculateTotalCostWithReturnFlag, type TrafficBySchedule } from "../utils/calculate-total-cost";

export default function HomeScreen() {
  const router = useRouter();
  const { isAuthenticated, login, logout, email, changeEmail } = useAuth();
  
  // ログイン必須化は index.tsx で処理するため、ここでは削除

  // 共有化状態の取得
  useEffect(() => {
    if (isAuthenticated) {
      fetchSharingStatus();
      fetchNotifications();
    }
  }, [isAuthenticated]);

  // 通知を定期的に取得（30秒ごと）
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000); // 30秒ごと
    
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const fetchNotifications = async () => {
    if (!isAuthenticated) return;
    
    setNotificationLoading(true);
    setNotificationError(null);
    try {
      const url = getApiUrl("/notifications");
      const res = await authenticatedFetch(url);
      if (res.ok) {
        const data: Notification[] = await res.json();
        setNotifications(data);
      } else {
        const errorText = await res.text();
        console.error("[HomeScreen] Failed to fetch notifications:", res.status, errorText);
        setNotificationError("通知の取得に失敗しました");
      }
    } catch (error: any) {
      console.error("[HomeScreen] Failed to fetch notifications:", error);
      setNotificationError(error.message ?? "通知の取得に失敗しました");
    } finally {
      setNotificationLoading(false);
    }
  };

  const markNotificationAsRead = async (notificationId: number) => {
    try {
      const url = getApiUrl(`/notifications/${notificationId}/read`);
      const res = await authenticatedFetch(url, {
        method: "PUT",
      });
      if (res.ok) {
        // 通知を更新
        setNotifications(prev => 
          prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
        );
      } else {
        console.error("[HomeScreen] Failed to mark notification as read:", res.status);
      }
    } catch (error) {
      console.error("[HomeScreen] Failed to mark notification as read:", error);
    }
  };

  const fetchSharingStatus = async () => {
    try {
      const url = getApiUrl("/auth/sharing-status");
      console.log("[FetchSharingStatus] Fetching from:", url);
      const res = await authenticatedFetch(url);
      console.log("[FetchSharingStatus] Response status:", res.status);
      if (res.ok) {
        const data = await res.json();
        console.log("[FetchSharingStatus] Response data:", data);
        setSharingEnabled(data.sharing_enabled);
        setShareId(data.share_id);
        setSharingUrl(data.sharing_url);
      } else {
        const errorText = await res.text();
        console.error("[FetchSharingStatus] Error response:", errorText);
      }
    } catch (error) {
      console.error("[HomeScreen] Failed to fetch sharing status:", error);
    }
  };

  const handleToggleSharing = async () => {
    console.log("[ToggleSharing] Starting toggle, current state:", sharingEnabled);
    try {
      const url = getApiUrl("/auth/toggle-sharing");
      console.log("[ToggleSharing] URL:", url);
      const requestBody = JSON.stringify({ enabled: !sharingEnabled });
      console.log("[ToggleSharing] Request body:", requestBody);
      
      const res = await authenticatedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      
      console.log("[ToggleSharing] Response status:", res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log("[ToggleSharing] Response data:", data);
        setSharingEnabled(data.sharing_enabled);
        await fetchSharingStatus(); // URLを更新
        console.log("[ToggleSharing] Successfully toggled to:", data.sharing_enabled);
      } else {
        const errorText = await res.text();
        console.error("[ToggleSharing] Error response:", errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: `サーバーエラー (${res.status})` };
        }
        Alert.alert("エラー", errorData.error || "共有化の切り替えに失敗しました");
      }
    } catch (error: any) {
      console.error("[ToggleSharing] Exception:", error);
      Alert.alert("エラー", error?.message || "共有化の切り替えに失敗しました");
    }
  };

  const handleChangeShareId = async () => {
    if (!newShareId.trim()) {
      Alert.alert("エラー", "ユーザーIDを入力してください");
      return;
    }

    if (newShareId.length < 3 || newShareId.length > 20) {
      Alert.alert("エラー", "ユーザーIDは3文字以上20文字以下で入力してください");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(newShareId)) {
      Alert.alert("エラー", "ユーザーIDは英数字、ハイフン、アンダースコアのみ使用できます");
      return;
    }

    try {
      setChangeShareIdLoading(true);
      const res = await authenticatedFetch(getApiUrl("/auth/change-share-id"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share_id: newShareId.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setShareId(data.share_id);
        setShowChangeShareIdModal(false);
        setNewShareId("");
        await fetchSharingStatus(); // URLを更新
        Alert.alert("成功", "ユーザーIDが変更されました");
      } else {
        const errorData = await res.json();
        Alert.alert("エラー", errorData.error || "ユーザーIDの変更に失敗しました");
      }
    } catch (error: any) {
      Alert.alert("エラー", "ユーザーIDの変更に失敗しました");
    } finally {
      setChangeShareIdLoading(false);
    }
  };

  const [nextSchedules, setNextSchedules] = useState<Schedule[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loadingNext, setLoadingNext] = useState(false);
  const [errorNext, setErrorNext] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [changeEmailLoading, setChangeEmailLoading] = useState(false);
  const [showUserMenuModal, setShowUserMenuModal] = useState(false);
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [sharingUrl, setSharingUrl] = useState<string | null>(null);
  const [showChangeShareIdModal, setShowChangeShareIdModal] = useState(false);
  const [newShareId, setNewShareId] = useState("");
  const [changeShareIdLoading, setChangeShareIdLoading] = useState(false);

  // 通知関連のstate
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  const fetchUpcoming = async () => {
    try {
      setLoadingNext(true);
      setErrorNext(null);
      // ログインしている場合は認証済みAPIを使用、していない場合は公開APIを使用
      const url = isAuthenticated 
        ? getApiUrl("/schedules")
        : getApiUrl("/public/schedules");
      console.log("Fetching schedules from:", url, "isAuthenticated:", isAuthenticated);
      const res = isAuthenticated
        ? await authenticatedFetch(url)
        : await fetch(url);
      if (!res.ok) {
        throw new Error(`status: ${res.status}`);
      }
      const data: Schedule[] = await res.json();
      console.log("Schedules received:", data.length, "items");
      
      // 全スケジュールを保存（カレンダー用）
      setAllSchedules(data);
      
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
      
      // 現在時刻をJST（日本標準時）で取得
      // 現在のUTC時刻を取得
      const nowUTC = new Date();
      const utcTime = nowUTC.getTime(); // UTC時刻のミリ秒
      const jstOffset = 9 * 60 * 60 * 1000; // JSTはUTC+9（ミリ秒）
      // UTC時刻に9時間を加算してJST時刻を取得
      const jstNow = new Date(utcTime + jstOffset);
      
      console.log("Current UTC time:", nowUTC.toISOString());
      console.log("Current JST time (UTC+9):", jstNow.toISOString());
      
      // 未来のスケジュールのみをフィルタリング（JSTで比較）
      // schedule.datetimeはUTC形式（例: "2025-07-03T17:00:00Z"）で来ているが、
      // バックエンドでは、dateとstartから"YYYY-MM-DDTHH:MM:00Z"形式で生成されている
      // これはUTC形式だが、実際にはJSTの日時を表している
      // したがって、UTC時刻として解釈し、9時間を加算してJST時刻として扱う
      const futureSchedules = data.filter((schedule) => {
        if (!schedule.datetime) {
          return false; // datetimeがない場合は除外
        }
        
        // datetimeをUTC時刻として解釈
        const scheduleDateUTC = new Date(schedule.datetime);
        const scheduleUtcTime = scheduleDateUTC.getTime(); // UTC時刻のミリ秒
        // JST時刻として扱うため、9時間を加算
        const scheduleDateJST = new Date(scheduleUtcTime + jstOffset);
        
        // 現在のJST時刻と比較
        const isFuture = scheduleDateJST.getTime() > jstNow.getTime();
        
        console.log(`Schedule ${schedule.id}: datetime=${schedule.datetime}, JST=${scheduleDateJST.toISOString()}, isFuture=${isFuture}`);
        
        return isFuture;
      });
      
      console.log(`Found ${futureSchedules.length} future schedules out of ${data.length} total`);
      
      console.log("Future schedules:", futureSchedules.length, "items");
      
      // 日付順にソート（未来のイベントを先に）
      const sorted = futureSchedules.sort((a, b) => {
        const dateA = new Date(a.datetime).getTime();
        const dateB = new Date(b.datetime).getTime();
        return dateA - dateB;
      });
      
      // 直近3件のみを表示
      setNextSchedules(sorted.slice(0, 3));
    } catch (e: any) {
      console.error("Error fetching schedules:", e);
      setErrorNext(e.message ?? "Unknown error");
    } finally {
      setLoadingNext(false);
    }
  };

  const onRefresh = async () => {
    console.log('[HomeScreen] onRefresh called');
    setRefreshing(true);
    try {
      console.log('[HomeScreen] Starting refresh...');
      await fetchUpcoming();
      console.log('[HomeScreen] Refresh completed');
    } catch (error) {
      console.error('[HomeScreen] Refresh error:', error);
    } finally {
      console.log('[HomeScreen] Setting refreshing to false');
      setRefreshing(false);
    }
  };

  const handleOpenYearPage = (year: number) => {
    router.push(`/year/${year}`);
  };

  const handleOpenNew = () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    router.push("/new");
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("メールアドレスとパスワードを入力してください");
      return;
    }

    try {
      setLoginLoading(true);
      setLoginError(null);
      const result = await login(loginEmail.trim(), loginPassword);
      if (!result.email_verified) {
        setLoginError("メールアドレスの確認が完了していません。登録時に送信されたメールを確認してください。");
        return;
      }
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
      setLoginError(null);
    } catch (error: any) {
      // セキュリティ上の理由から、どちらが間違っているかわからないメッセージに統一
      const errorMessage = error.message || "ログインに失敗しました";
      if (errorMessage.includes("メールアドレス") || errorMessage.includes("パスワード")) {
        setLoginError("メールアドレスまたはパスワードが正しくありません");
      } else {
        setLoginError(errorMessage);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      // ログアウト成功：状態が更新されるため、自動的に鍵マークに変わる
      // isAuthenticatedは!!tokenで判定されるため、tokenがnullになれば自動的にfalseになる
    } catch (error: any) {
      Alert.alert("エラー", "ログアウトに失敗しました");
    }
  };

  const handleChangeEmail = async () => {
    console.log("[CHANGE EMAIL] Starting email change process");
    console.log("[CHANGE EMAIL] New email:", newEmail);
    
    if (!newEmail || !newEmail.includes('@')) {
      console.log("[CHANGE EMAIL] Invalid email format");
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert("有効なメールアドレスを入力してください");
      } else {
        Alert.alert("エラー", "有効なメールアドレスを入力してください");
      }
      return;
    }

    try {
      setChangeEmailLoading(true);
      console.log("[CHANGE EMAIL] Calling changeEmail function");
      const result = await changeEmail(newEmail);
      console.log("[CHANGE EMAIL] Success:", result);
      
      const successMessage = "新しいメールアドレスに確認メールを送信しました。メール内のリンクをクリックしてメールアドレスを変更してください。";
      
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(successMessage);
        setShowChangeEmailModal(false);
        setNewEmail("");
      } else {
        Alert.alert(
          "メール送信完了",
          successMessage,
          [
            {
              text: "OK",
              onPress: () => {
                setShowChangeEmailModal(false);
                setNewEmail("");
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error("[CHANGE EMAIL] Error:", error);
      const errorMessage = error.message || "メールアドレス変更に失敗しました";
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(`エラー: ${errorMessage}`);
      } else {
        Alert.alert("エラー", errorMessage);
      }
    } finally {
      setChangeEmailLoading(false);
    }
  };

  useEffect(() => {
    fetchUpcoming();
  }, [isAuthenticated]);

  // メールアドレスが変更された時に再レンダリングされるようにする
  useEffect(() => {
    console.log('[HomeScreen] Email changed to:', email);
  }, [email]);

  // Areaの色情報を取得
  useEffect(() => {
    if (nextSchedules.length === 0) return;
    
    let isMounted = true;
    
    const loadAreaColors = async () => {
      const colorMap = await fetchAreaColors(nextSchedules);
      if (isMounted) {
        setAreaColors(colorMap);
      }
    };
    
    loadAreaColors();
    
    return () => {
      isMounted = false;
    };
  }, [nextSchedules]);

  // 往復フラグを考慮した総費用を計算（共通関数を使用、HomeScreenでは交通情報を取得していないため空のMapを渡す）
  const calculateTotalCost = (schedule: Schedule): number | null => {
    const emptyTrafficMap: TrafficBySchedule = new Map();
    return calculateTotalCostWithReturnFlag(schedule, emptyTrafficMap);
  };

  const handleOpenDetail = (id: number) => {
    router.push(`/live/${id}`);
  };

  return (
    <View style={styles.scrollContainer}>
      {Platform.OS !== 'web' ? (
        <ScrollView 
          style={styles.scrollContainer} 
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={Platform.OS === 'ios' ? '#37352f' : undefined}
              colors={Platform.OS === 'android' ? ['#37352f'] : undefined}
            />
          }
          scrollEnabled={true}
          nestedScrollEnabled={true}
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
          onScroll={(e) => {
            const { contentOffset } = e.nativeEvent;
            if (contentOffset.y === 0 && pullDistance > 100 && !refreshing) {
              onRefresh();
            }
          }}
          scrollEventThrottle={16}
        >
          <View style={styles.container}>
        <View style={styles.header}>
      <Text style={styles.title}>SCHEDULE</Text>
          <View style={styles.headerRight}>
            {isAuthenticated && (
              <TouchableOpacity
                style={styles.notificationButton}
                onPress={() => {
                  setShowNotificationModal(true);
                  fetchNotifications();
                }}
              >
                <NotificationIcon size={40} color="#37352f" />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {notifications.filter(n => !n.is_read).length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => {
                console.log("Icon clicked - isAuthenticated:", isAuthenticated, "email:", email);
                if (isAuthenticated) {
                  // ログイン済みの場合、メニューモーダルを表示
                  setShowUserMenuModal(true);
                } else {
                  setShowLoginModal(true);
                }
              }}
            >
              {isAuthenticated ? (
                <PersonIcon size={40} color="#37352f" />
              ) : (
                <LockIcon size={40} color="#37352f" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {isAuthenticated && (
      <TouchableOpacity style={styles.newButton} onPress={handleOpenNew}>
        <Text style={styles.newButtonText}>+ 新規イベント</Text>
      </TouchableOpacity>
        )}

        {/* カレンダー */}
        <ScheduleCalendar schedules={allSchedules} />

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>NEXT</Text>
        {loadingNext && <ActivityIndicator color="#333333" />}
        {errorNext && <Text style={styles.errorText}>エラー: {errorNext}</Text>}
        {!loadingNext && !errorNext && nextSchedules.length === 0 && (
          <Text style={styles.emptyText}>今後のスケジュールはありません</Text>
        )}
        {!loadingNext && !errorNext && nextSchedules.length > 0 && (
          <FlatList
            data={nextSchedules}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
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
        )}
      </View>

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>ARCHIVE</Text>
        <View style={styles.yearListColumn}>
          {availableYears.map((year) => (
            <TouchableOpacity
              key={year}
              style={styles.yearRow}
              onPress={() => handleOpenYearPage(year)}
            >
              <Text style={styles.yearRowText}>{year}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.bottomSpacer} />
      </View>
      </ScrollView>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={true}
          nestedScrollEnabled={true}
        >
          <View style={styles.container}>
            <View style={styles.header}>
      <Text style={styles.title}>SCHEDULE</Text>
          <View style={styles.headerRight}>
            {isAuthenticated && (
              <TouchableOpacity
                style={styles.notificationButton}
                onPress={() => {
                  setShowNotificationModal(true);
                  fetchNotifications();
                }}
              >
                <NotificationIcon size={40} color="#37352f" />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {notifications.filter(n => !n.is_read).length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => {
                console.log("Icon clicked - isAuthenticated:", isAuthenticated, "email:", email);
                if (isAuthenticated) {
                  // ログイン済みの場合、メニューモーダルを表示
                  setShowUserMenuModal(true);
                } else {
                  setShowLoginModal(true);
                }
              }}
            >
              {isAuthenticated ? (
                <PersonIcon size={40} color="#37352f" />
              ) : (
                <LockIcon size={40} color="#37352f" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {isAuthenticated && (
      <TouchableOpacity style={styles.newButton} onPress={handleOpenNew}>
        <Text style={styles.newButtonText}>+ 新規イベント</Text>
      </TouchableOpacity>
        )}

        {/* カレンダー */}
        <ScheduleCalendar schedules={allSchedules} />

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>NEXT</Text>
        {loadingNext && <ActivityIndicator color="#333333" />}
        {errorNext && <Text style={styles.errorText}>エラー: {errorNext}</Text>}
        {!loadingNext && !errorNext && nextSchedules.length === 0 && (
          <Text style={styles.emptyText}>今後のスケジュールはありません</Text>
        )}
        {!loadingNext && !errorNext && nextSchedules.length > 0 && (
          <FlatList
            data={nextSchedules}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
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
        )}
      </View>

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>ARCHIVE</Text>
        <View style={styles.yearListColumn}>
          {availableYears.map((year) => (
            <TouchableOpacity
              key={year}
              style={styles.yearRow}
              onPress={() => handleOpenYearPage(year)}
            >
              <Text style={styles.yearRowText}>{year}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.bottomSpacer} />
      </View>
        </ScrollView>
      )}

      {/* ログインモーダル */}
      <Modal
        visible={showLoginModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLoginModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ログイン</Text>
              <TouchableOpacity
                onPress={() => setShowLoginModal(false)}
                style={styles.modalCloseButton}
              >
                <Text style={{ fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="メールアドレス"
              value={loginEmail}
              onChangeText={(text) => {
                setLoginEmail(text);
                setLoginError(null); // 入力時にエラーをクリア
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <TextInput
              style={styles.input}
              placeholder="パスワード"
              value={loginPassword}
              onChangeText={(text) => {
                setLoginPassword(text);
                setLoginError(null); // 入力時にエラーをクリア
              }}
              secureTextEntry
              autoComplete="password"
            />

            {loginError && (
              <Text style={styles.loginErrorText}>{loginError}</Text>
            )}

            <TouchableOpacity
              style={[styles.loginSubmitButton, loginLoading && styles.loginSubmitButtonDisabled]}
              onPress={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginSubmitButtonText}>ログイン</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotPasswordLink}
              onPress={() => {
                setShowLoginModal(false);
                router.push("/forgot-password");
              }}
              disabled={loginLoading}
            >
              <Text style={styles.forgotPasswordLinkText}>パスワードを忘れた場合</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* メールアドレス変更モーダル */}
      <Modal
        visible={showChangeEmailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowChangeEmailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>メールアドレス変更</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowChangeEmailModal(false);
                  setNewEmail("");
                }}
                style={styles.modalCloseButton}
              >
                <Text style={{ fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ marginBottom: 8, color: "#666" }}>
              現在のメールアドレス: {email}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="新しいメールアドレス"
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <Text style={{ marginTop: 8, marginBottom: 16, fontSize: 12, color: "#666" }}>
              新しいメールアドレスに確認メールを送信します。
              メール内のリンクをクリックしてメールアドレスを変更してください。
            </Text>

            <TouchableOpacity
              style={[styles.loginSubmitButton, changeEmailLoading && styles.loginSubmitButtonDisabled]}
              onPress={handleChangeEmail}
              disabled={changeEmailLoading}
            >
              {changeEmailLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginSubmitButtonText}>メール送信</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ユーザーメニューモーダル */}
      <Modal
        visible={showUserMenuModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUserMenuModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>メニュー</Text>
              <TouchableOpacity
                onPress={() => setShowUserMenuModal(false)}
                style={styles.modalCloseButton}
              >
                <Text style={{ fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ marginBottom: 16, color: "#666" }}>
              {email || 'ログイン中'} でログイン中です
            </Text>

            <TouchableOpacity
              style={[styles.menuButton, { marginBottom: 12 }]}
              onPress={() => {
                setShowUserMenuModal(false);
                setShowChangeEmailModal(true);
              }}
            >
              <Text style={styles.menuButtonText}>📧 メールアドレス変更</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuButton, { marginBottom: 12 }]}
              onPress={() => {
                setShowUserMenuModal(false);
                setShowChangeShareIdModal(true);
              }}
            >
              <Text style={styles.menuButtonText}>🆔 ユーザーID変更</Text>
            </TouchableOpacity>

            <View style={[styles.menuButton, { marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }]}>
              <Text style={styles.menuButtonText}>🔗 共有化</Text>
              <TouchableOpacity
                onPress={handleToggleSharing}
                style={[styles.toggleButton, sharingEnabled && styles.toggleButtonActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleButtonText, sharingEnabled && { color: '#ffffff' }]}>
                  {sharingEnabled ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {sharingUrl && sharingEnabled && (
              <View style={styles.sharingUrlContainer}>
                <Text style={styles.sharingUrlLabel}>共有URL:</Text>
                <View style={styles.sharingUrlRow}>
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.open(sharingUrl, '_blank');
                      } else {
                        Alert.alert("共有URL", sharingUrl);
                      }
                    }}
                    style={styles.sharingUrlTextContainer}
                  >
                    <Text style={styles.sharingUrlText} numberOfLines={1}>{sharingUrl}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === 'web' && typeof window !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(sharingUrl);
                        Alert.alert("コピーしました", sharingUrl);
                      } else {
                        Alert.alert("共有URL", sharingUrl);
                      }
                    }}
                    style={styles.copyButton}
                  >
                    <Text style={styles.copyButtonText}>📋</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.menuButton, styles.menuButtonDanger]}
              onPress={() => {
                setShowUserMenuModal(false);
                if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
                  if (window.confirm('ログアウトしますか？')) {
                    handleLogout();
                  }
                } else {
                  Alert.alert(
                    "ログアウト",
                    "ログアウトしますか？",
                    [
                      { text: "キャンセル", style: "cancel" },
                      { text: "ログアウト", onPress: handleLogout, style: "destructive" },
                    ]
                  );
                }
              }}
            >
              <Text style={[styles.menuButtonText, styles.menuButtonTextDanger]}>🚪 ログアウト</Text>
            </TouchableOpacity>
      </View>
    </View>
      </Modal>

      {/* ユーザーID変更モーダル */}
      <Modal
        visible={showChangeShareIdModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowChangeShareIdModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ユーザーID変更</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowChangeShareIdModal(false);
                  setNewShareId("");
                }}
                style={styles.modalCloseButton}
              >
                <Text style={{ fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ marginBottom: 8, color: "#666" }}>
              現在のユーザーID: {shareId || '未設定'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="新しいユーザーID（3-20文字、英数字・ハイフン・アンダースコア）"
              value={newShareId}
              onChangeText={setNewShareId}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={{ marginTop: 8, marginBottom: 16, fontSize: 12, color: "#666" }}>
              ユーザーIDは共有URLに使用されます。変更すると共有URLも変更されます。
            </Text>

            <TouchableOpacity
              style={[styles.loginSubmitButton, changeShareIdLoading && styles.loginSubmitButtonDisabled]}
              onPress={handleChangeShareId}
              disabled={changeShareIdLoading}
            >
              {changeShareIdLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginSubmitButtonText}>変更</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 通知モーダル */}
      <Modal
        visible={showNotificationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotificationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>通知</Text>
              <TouchableOpacity
                onPress={() => setShowNotificationModal(false)}
                style={styles.modalCloseButton}
              >
                <Text style={{ fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {notificationLoading && <ActivityIndicator color="#333333" />}
            {notificationError && (
              <Text style={styles.errorText}>{notificationError}</Text>
            )}
            {!notificationLoading && !notificationError && notifications.length === 0 && (
              <Text style={styles.emptyText}>通知はありません</Text>
            )}
            {!notificationLoading && !notificationError && notifications.length > 0 && (
              <ScrollView style={styles.notificationList}>
                {notifications.map((notification) => (
                  <TouchableOpacity
                    key={notification.id}
                    style={[
                      styles.notificationItem,
                      !notification.is_read && styles.notificationItemUnread,
                    ]}
                    onPress={() => {
                      if (!notification.is_read) {
                        markNotificationAsRead(notification.id);
                      }
                      router.push(`/live/${notification.schedule_id}`);
                      setShowNotificationModal(false);
                    }}
                  >
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <Text style={styles.notificationDate}>
                      {new Date(notification.created_at).toLocaleString("ja-JP")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return iso;
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours() + 0).padStart(2, "0"); // UTCのまま
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingBottom: 40,
    ...(Platform.OS === 'web' ? { minHeight: '100vh' } : {}),
  },
  container: {
    paddingTop: 48,
    paddingHorizontal: 24,
    backgroundColor: "#ffffff",
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationButton: {
    padding: 8,
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#d93025",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  notificationBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  notificationList: {
    maxHeight: 400,
  },
  notificationItem: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#f7f6f3",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e9e9e7",
  },
  notificationItemUnread: {
    backgroundColor: "#fff4e6",
    borderColor: "#ffd89b",
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: "#787774",
    marginBottom: 8,
    lineHeight: 20,
  },
  notificationDate: {
    fontSize: 12,
    color: "#9b9a97",
  },
  title: {
    fontSize: 40,
    fontWeight: "700",
    color: "#37352f",
  },
  loginButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  newButton: {
    alignSelf: "flex-start",
    marginBottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    backgroundColor: "#37352f",
  },
  newButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  sectionContainer: {
    backgroundColor: "#f7f6f3",
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e9e9e7",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    marginTop: 0,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    backgroundColor: "#f7f6f3",
    paddingVertical: 4,
    paddingHorizontal: 0,
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
    fontStyle: "italic",
    marginTop: 8,
  },
  yearListColumn: {
    marginTop: 8,
  },
  yearRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  yearRowText: {
    color: "#37352f",
    fontSize: 16,
    fontWeight: "500",
  },
  bottomSpacer: {
    height: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#37352f",
  },
  modalCloseButton: {
    padding: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: "#ffffff",
  },
  loginSubmitButton: {
    backgroundColor: "#37352f",
    borderRadius: 4,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  loginSubmitButtonDisabled: {
    opacity: 0.6,
  },
  loginSubmitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  forgotPasswordLink: {
    marginTop: 16,
    alignItems: "center",
  },
  forgotPasswordLinkText: {
    color: "#007AFF",
    fontSize: 14,
    textDecorationLine: "underline",
  },
  menuButton: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 4,
    alignItems: "center",
  },
  menuButtonDanger: {
    backgroundColor: "#fff5f5",
  },
  menuButtonText: {
    color: "#37352f",
    fontSize: 16,
    fontWeight: "500",
  },
  menuButtonTextDanger: {
    color: "#d93025",
  },
  loginErrorText: {
    color: "#d93025",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  toggleButton: {
    backgroundColor: "#e9e9e7",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButtonActive: {
    backgroundColor: "#007AFF",
  },
  toggleButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "600",
  },
  sharingUrlContainer: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
  },
  sharingUrlLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  sharingUrlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sharingUrlTextContainer: {
    flex: 1,
  },
  sharingUrlText: {
    fontSize: 12,
    color: "#007AFF",
    textDecorationLine: "underline",
  },
  copyButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  copyButtonText: {
    fontSize: 16,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationButton: {
    padding: 8,
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#d93025",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  notificationBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  notificationList: {
    maxHeight: 400,
  },
  notificationItem: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#f7f6f3",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e9e9e7",
  },
  notificationItemUnread: {
    backgroundColor: "#fff4e6",
    borderColor: "#ffd89b",
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: "#787774",
    marginBottom: 8,
    lineHeight: 20,
  },
  notificationDate: {
    fontSize: 12,
    color: "#9b9a97",
  },
});