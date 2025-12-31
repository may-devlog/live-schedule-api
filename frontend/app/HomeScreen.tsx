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
import { Ionicons } from "@expo/vector-icons";

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
  const { isAuthenticated, login, logout, email } = useAuth();

  const [nextSchedules, setNextSchedules] = useState<Schedule[]>([]);
  const [loadingNext, setLoadingNext] = useState(false);
  const [errorNext, setErrorNext] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

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
      // ブラウザのローカルタイムゾーンを使用（JSTに設定されている場合）
      // または、UTC+9として明示的に計算
      const now = new Date();
      // JSTはUTC+9なので、UTC時刻に9時間を加算
      const jstOffset = 9 * 60 * 60 * 1000; // ミリ秒
      const jstNow = new Date(now.getTime() + jstOffset);
      
      // 未来のスケジュールのみをフィルタリング（JSTで比較）
      // schedule.dateとschedule.startからJSTの日時を構築
      const futureSchedules = data.filter((schedule) => {
        if (!schedule.date) {
          return false; // 日付がない場合は除外
        }
        
        // date: "YYYY-MM-DD", start: "HH:MM" からJSTの日時を構築
        const timeStr = schedule.start || "00:00";
        // JSTの日時として解釈（UTC+9）
        const jstDateTimeStr = `${schedule.date}T${timeStr}:00+09:00`;
        const scheduleDateJST = new Date(jstDateTimeStr);
        
        // 現在のJST時刻と比較
        const isFuture = scheduleDateJST > jstNow;
        return isFuture;
      });
      
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
      Alert.alert("エラー", "メールアドレスとパスワードを入力してください");
      return;
    }

    try {
      setLoginLoading(true);
      const result = await login(loginEmail.trim(), loginPassword);
      if (!result.email_verified) {
        Alert.alert(
          "メール確認が必要です",
          "メールアドレスの確認が完了していません。登録時に送信されたメールを確認してください。"
        );
        return;
      }
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
    } catch (error: any) {
      Alert.alert("ログインエラー", error.message || "ログインに失敗しました");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error: any) {
      Alert.alert("エラー", "ログアウトに失敗しました");
    }
  };

  useEffect(() => {
    fetchUpcoming();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live SCHEDULE</Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => {
            if (isAuthenticated) {
              Alert.alert(
                "ログアウト",
                `${email} でログイン中です。ログアウトしますか？`,
                [
                  { text: "キャンセル", style: "cancel" },
                  { text: "ログアウト", onPress: handleLogout, style: "destructive" },
                ]
              );
            } else {
              setShowLoginModal(true);
            }
          }}
        >
          <Ionicons
            name={isAuthenticated ? "person" : "log-in-outline"}
            size={24}
            color="#37352f"
          />
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
                <Ionicons name="close" size={24} color="#37352f" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="メールアドレス"
              value={loginEmail}
              onChangeText={setLoginEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <TextInput
              style={styles.input}
              placeholder="パスワード"
              value={loginPassword}
              onChangeText={setLoginPassword}
              secureTextEntry
              autoComplete="password"
            />

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
              style={styles.registerLink}
              onPress={() => {
                setShowLoginModal(false);
                router.push("/login");
              }}
            >
              <Text style={styles.registerLinkText}>新規登録はこちら</Text>
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
  registerLink: {
    marginTop: 16,
    alignItems: "center",
  },
  registerLinkText: {
    color: "#37352f",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});