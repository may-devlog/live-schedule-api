// app/stay/[stayId]/edit.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import { authenticatedFetch, getApiUrl } from "../../../utils/api";
import { NotionSelect } from "../../../components/notion-select";
import { NotionDatePicker } from "../../../components/notion-date-picker";
import type { SelectOption } from "../../../types/select-option";
import { PageHeader } from "../../../components/PageHeader";
import { loadStaySelectOptions, saveStaySelectOptions } from "../../../utils/select-options-storage";

type Stay = {
  id: number;
  schedule_id: number;
  check_in: string;
  check_out: string;
  hotel_name: string;
  website?: string | null;
  fee: number;
  breakfast_flag: boolean;
  deadline?: string | null;
  penalty?: number | null;
  status: string;
};

const STAY_STATUSES_KEY = "@select_options:stay_statuses" as const;

async function loadStayStatuses(): Promise<SelectOption[]> {
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage")
      .default;
    const stored = await AsyncStorage.getItem(STAY_STATUSES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === "string") {
          const { stringArrayToOptions } = require("../../../types/select-option");
          return stringArrayToOptions(parsed, undefined, false, false);
        }
        return parsed as SelectOption[];
      }
    }
  } catch (error) {
    console.error("Error loading stay statuses:", error);
  }
  const { stringArrayToOptions } = require("../../../types/select-option");
  return stringArrayToOptions(["Canceled", "Keep", "Done"], undefined, false, false);
}

async function saveStayStatuses(options: SelectOption[]): Promise<void> {
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage")
      .default;
    await AsyncStorage.setItem(STAY_STATUSES_KEY, JSON.stringify(options));
  } catch (error) {
    console.error("Error saving stay statuses:", error);
  }
}

export default function EditStayScreen() {
  const { stayId } = useLocalSearchParams<{ stayId: string }>();
  const router = useRouter();

  const [statuses, setStatuses] = useState<SelectOption[]>([]);
  const [websiteOptions, setWebsiteOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOptions = async () => {
      const statusesData = await loadStayStatuses();
      setStatuses(statusesData);
      
      // Website選択肢を取得
      try {
        const websiteData = await loadStaySelectOptions("WEBSITE");
        setWebsiteOptions(websiteData);
      } catch (e) {
        console.error("[EditStay] Failed to fetch website options:", e);
      }
    };
    loadOptions();
  }, []);

  const handleStatusesChange = async (newStatuses: SelectOption[]) => {
    setStatuses(newStatuses);
    await saveStayStatuses(newStatuses);
  };

  const handleWebsiteOptionsChange = async (newOptions: SelectOption[]) => {
    setWebsiteOptions(newOptions);
    try {
      await saveStaySelectOptions("WEBSITE", newOptions);
    } catch (e) {
      console.error("[EditStay] Failed to save website options:", e);
    }
  };

  // 日付文字列をDateオブジェクトに変換するヘルパー関数
  const parseDateTime = (dateTimeStr: string): Date | null => {
    try {
      const [datePart, timePart] = dateTimeStr.split(" ");
      if (datePart && timePart) {
        const [year, month, day] = datePart.split("-").map(Number);
        const [hours, minutes] = timePart.split(":").map(Number);
        if (year && month && day && hours !== undefined && minutes !== undefined) {
          return new Date(year, month - 1, day, hours, minutes, 0, 0);
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  // チェックインの日付を0:00に設定した日時文字列を取得
  const getCheckInDateAtMidnight = (checkInStr: string | null): string | null => {
    if (!checkInStr) return null;
    const date = parseDateTime(checkInStr);
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day} 00:00`;
  };

  // チェックイン変更時に、キャンセル期限日時がNULLの場合、デフォルト値を設定
  useEffect(() => {
    // 初回ロード時はスキップ（既存データから設定されるため）
    if (isInitialLoad.current) return;
    
    if (checkIn && !deadline) {
      const defaultDeadline = getCheckInDateAtMidnight(checkIn);
      if (defaultDeadline) {
        setDeadline(defaultDeadline);
      }
    }
  }, [checkIn]);

  // キャンセル期限日時のバリデーション
  const handleDeadlineChange = (value: string | null) => {
    setDeadlineError(null);
    
    if (!value) {
      setDeadline(value);
      return;
    }

    if (!checkIn) {
      setDeadline(value);
      return;
    }

    const deadlineDate = parseDateTime(value);
    const checkInDate = parseDateTime(checkIn);

    if (!deadlineDate || !checkInDate) {
      setDeadline(value);
      return;
    }

    // キャンセル期限日時がチェックインより後の場合はエラー
    if (deadlineDate > checkInDate) {
      setDeadlineError("取消料発生日時はチェックインより前の日時に設定してください。");
      return;
    }

    setDeadline(value);
  };

  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [hotelName, setHotelName] = useState("");
  const [website, setWebsite] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [breakfastFlag, setBreakfastFlag] = useState(false);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [penalty, setPenalty] = useState("");
  const [status, setStatus] = useState<string | null>("Keep");
  const isInitialLoad = useRef(true);

  // 既存データを読み込む
  useEffect(() => {
    if (!stayId) {
      setError("stayIdが指定されていません");
      setLoading(false);
      return;
    }

    const fetchStay = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log("[EditStay] Fetching stay with ID:", stayId);
        const res = await authenticatedFetch(getApiUrl(`/stay/${stayId}`));
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Stay not found");
          }
          throw new Error(`status: ${res.status}`);
        }
        const data: Stay = await res.json();
        console.log("[EditStay] Fetched stay data:", data);

        setCheckIn(data.check_in || null);
        setCheckOut(data.check_out || null);
        setHotelName(data.hotel_name || "");
        setWebsite(data.website || null);
        setFee(data.fee.toString());
        setBreakfastFlag(data.breakfast_flag);
        setDeadline(data.deadline || null);
        setPenalty(data.penalty?.toString() || "");
        setStatus(data.status || "Keep");
        isInitialLoad.current = false;
      } catch (e: any) {
        console.error("[EditStay] Error fetching stay:", e);
        const errorMessage = e.message || "データの読み込みに失敗しました";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchStay();
  }, [stayId]);

  const handleSubmit = async () => {
    if (!stayId) {
      Alert.alert("エラー", "stayId が指定されていません。");
      return;
    }
    if (!checkIn || !checkOut || !hotelName.trim()) {
      Alert.alert("必須項目", "Check-in / Check-out / Hotel は必須です。");
      return;
    }

    // キャンセル期限日時のバリデーション
    if (deadline && checkIn) {
      const deadlineDate = parseDateTime(deadline);
      const checkInDate = parseDateTime(checkIn);
      if (deadlineDate && checkInDate && deadlineDate > checkInDate) {
        Alert.alert("入力エラー", "取消料発生日時はチェックインより前の日時に設定してください。");
        setDeadlineError("取消料発生日時はチェックインより前の日時に設定してください。");
        return;
      }
    }

    const feeNum = fee ? Number(fee) : NaN;
    if (Number.isNaN(feeNum)) {
      Alert.alert("入力エラー", "Fee は数値で入力してください。");
      return;
    }
    const penaltyNum = penalty ? Number(penalty) : undefined;
    if (penalty && Number.isNaN(penaltyNum)) {
      Alert.alert("入力エラー", "Penalty は数値で入力してください。");
      return;
    }

    // schedule_idを取得するために既存データを再取得
    let scheduleId: number;
    try {
      const res = await authenticatedFetch(getApiUrl(`/stay/${stayId}`));
      if (!res.ok) throw new Error("Failed to fetch stay");
      const stay: Stay = await res.json();
      scheduleId = stay.schedule_id;
    } catch (e: any) {
      Alert.alert("エラー", "データの取得に失敗しました。");
      return;
    }

    const payload = {
      schedule_id: scheduleId,
      check_in: checkIn,
      check_out: checkOut,
      hotel_name: hotelName.trim(),
      website: website || null,
      fee: feeNum,
      breakfast_flag: breakfastFlag,
      deadline: deadline || null,
      penalty: penaltyNum ?? null,
      status: status || "Keep",
    };

    try {
      setSubmitting(true);
      const res = await authenticatedFetch(getApiUrl(`/stay/${stayId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.log("UPDATE STAY ERROR:", res.status, text);
        const errorMessage = `宿泊情報の更新に失敗しました（status: ${res.status}）`;
        if (Platform.OS === "web") {
          window.alert(`エラー\n\n${errorMessage}`);
        } else {
          Alert.alert("エラー", errorMessage);
        }
        return;
      }

      const updated = await res.json();
      if (Platform.OS === "web") {
        window.alert("更新完了\n\n宿泊情報を更新しました。");
        router.push(`/stay/${stayId}`);
      } else {
        Alert.alert("更新完了", "宿泊情報を更新しました。", [
          {
            text: "OK",
            onPress: () => {
              router.push(`/stay/${stayId}`);
            },
          },
        ]);
      }
    } catch (e: any) {
      console.log("UPDATE STAY EXCEPTION:", e);
      const errorMessage = e.message || "通信に失敗しました。サーバーの状態を確認してください。";
      if (Platform.OS === "web") {
        window.alert(`エラー\n\n${errorMessage}`);
      } else {
        Alert.alert("エラー", errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
        <PageHeader showBackButton={true} homePath="/" />
        <View style={styles.container}>
          <ActivityIndicator color="#37352f" size="large" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
        <PageHeader showBackButton={true} homePath="/" />
        <View style={styles.container}>
          <Text style={styles.title}>宿泊を編集</Text>
          <Text style={styles.errorText}>エラー: {error}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <PageHeader showBackButton={true} homePath="/" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>宿泊を編集</Text>

      <NotionDatePicker
        label="チェックイン"
        value={checkIn}
        onValueChange={setCheckIn}
        mode="datetime"
        placeholder="YYYY-MM-DD HH:MM"
        required={true}
      />

      <NotionDatePicker
        label="チェックアウト"
        value={checkOut}
        onValueChange={setCheckOut}
        mode="datetime"
        placeholder="YYYY-MM-DD HH:MM"
        required={true}
      />

      <Text style={styles.label}>
        ホテル名 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={hotelName}
        onChangeText={setHotelName}
      />

      {websiteOptions.length > 0 && (
        <NotionSelect
          label="予約サイト"
          value={website}
          options={websiteOptions}
          onValueChange={setWebsite}
          onOptionsChange={handleWebsiteOptionsChange}
          placeholder="選択してください"
          stayOptionType="WEBSITE"
        />
      )}
      {websiteOptions.length === 0 && (
        <View>
          <Text style={styles.label}>予約サイト</Text>
          <Text style={styles.emptyValue}>読み込み中...</Text>
        </View>
      )}

      <Text style={styles.label}>
        宿泊費 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={fee}
        onChangeText={setFee}
        keyboardType="numeric"
      />

      <View style={styles.flagRow}>
        <Text style={styles.label}>朝食</Text>
        <Switch value={breakfastFlag} onValueChange={setBreakfastFlag} />
      </View>

      <NotionDatePicker
        label="取消料発生日時"
        value={deadline}
        onValueChange={handleDeadlineChange}
        mode="datetime"
        placeholder="YYYY-MM-DD HH:MM"
        maxDate={checkIn}
      />
      {deadlineError && (
        <Text style={styles.errorText}>{deadlineError}</Text>
      )}

      <Text style={styles.label}>取消料 (%)</Text>
      <TextInput
        style={styles.input}
        value={penalty}
        onChangeText={setPenalty}
        keyboardType="numeric"
      />

      {statuses.length > 0 && (
        <NotionSelect
          label="ステータス"
          value={status}
          options={statuses}
          onValueChange={setStatus}
          onOptionsChange={handleStatusesChange}
          placeholder="選択してください"
        />
      )}
      {statuses.length === 0 && (
        <View>
          <Text style={styles.label}>ステータス</Text>
          <Text style={styles.emptyValue}>読み込み中...</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? "更新中..." : "更新"}
        </Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  container: {
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 32,
    backgroundColor: "#ffffff",
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  title: {
    fontSize: 40,
    fontWeight: "700",
    color: "#37352f",
    marginBottom: 32,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#37352f",
    marginTop: 16,
    marginBottom: 6,
  },
  required: {
    color: "#d93025",
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#37352f",
    minHeight: 40,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingVertical: 8,
  },
  button: {
    marginTop: 32,
    backgroundColor: "#37352f",
    paddingVertical: 12,
    borderRadius: 3,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 12,
    color: "#d93025",
    marginTop: 4,
    marginBottom: 8,
  },
  emptyValue: {
    fontSize: 14,
    color: "#9b9a97",
    marginTop: 8,
    marginBottom: 16,
  },
});

