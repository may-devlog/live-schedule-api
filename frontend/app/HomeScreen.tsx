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
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
// アイコンは絵文字を使用（フォントに依存しない）

export type Schedule = {
  id: number;
  title: string;
  group: string; // groupがNULLの場合はtitleが使用される（バックエンドでフォールバック）
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

import { getApiUrl } from "../utils/api";

const YEARS = [2024, 2025, 2026];

export default function HomeScreen() {
  const router = useRouter();
  const { isAuthenticated, login, logout, email, changeEmail } = useAuth();

  const [nextSchedules, setNextSchedules] = useState<Schedule[]>([]);
  const [loadingNext, setLoadingNext] = useState(false);
  const [errorNext, setErrorNext] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [changeEmailLoading, setChangeEmailLoading] = useState(false);
  const [showUserMenuModal, setShowUserMenuModal] = useState(false);

  const fetchUpcoming = async () => {
    try {
      setLoadingNext(true);
      setErrorNext(null);
      // 公開スケジュールAPIを使用（認証不要）
      const url = getApiUrl("/public/schedules");
      console.log("Fetching public schedules from:", url);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`status: ${res.status}`);
      }
      const data: Schedule[] = await res.json();
      console.log("Public schedules received:", data.length, "items");
      
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
      
      setNextSchedules(sorted);
    } catch (e: any) {
      console.error("Error fetching schedules:", e);
      setErrorNext(e.message ?? "Unknown error");
    } finally {
      setLoadingNext(false);
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
  }, []);

  // メールアドレスが変更された時に再レンダリングされるようにする
  useEffect(() => {
    console.log('[HomeScreen] Email changed to:', email);
  }, [email]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live SCHEDULE</Text>
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
          <Text style={{ fontSize: 24 }}>
            {isAuthenticated ? "👤" : "🔐"}
          </Text>
        </TouchableOpacity>
      </View>

      {isAuthenticated && (
        <TouchableOpacity style={styles.newButton} onPress={handleOpenNew}>
          <Text style={styles.newButtonText}>+ New Live</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>NEXT</Text>
      {loadingNext && <ActivityIndicator color="#333333" />}
      {errorNext && <Text style={styles.errorText}>Error: {errorNext}</Text>}
      {!loadingNext && !errorNext && nextSchedules.length === 0 && (
        <Text style={styles.emptyText}>No upcoming schedules</Text>
      )}
      {!loadingNext && !errorNext && nextSchedules.length > 0 && (
        <FlatList
          data={nextSchedules}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/live/${item.id}`)}
            >
              <Text style={styles.cardDate}>
                {formatDateTimeUTC(item.datetime)}
              </Text>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.cardSub}>
                {item.area} / {item.venue}
              </Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <Text style={styles.sectionTitle}>Years</Text>
      <View style={styles.yearListColumn}>
        {YEARS.map((year) => (
          <TouchableOpacity
            key={year}
            style={styles.yearRow}
            onPress={() => handleOpenYearPage(year)}
          >
            <Text style={styles.yearRowText}>{year}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
  container: {
    flex: 1,
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
  title: {
    fontSize: 40,
    fontWeight: "700",
    color: "#37352f",
  },
  loginButton: {
    padding: 8,
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    marginTop: 32,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 4,
    lineHeight: 22,
  },
  cardSub: {
    fontSize: 14,
    color: "#787774",
    marginTop: 4,
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
});