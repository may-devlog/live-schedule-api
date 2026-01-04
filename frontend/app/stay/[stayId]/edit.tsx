// app/stay/[stayId]/edit.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    const loadOptions = async () => {
      const statusesData = await loadStayStatuses();
      setStatuses(statusesData);
      
      // Website選択肢を取得
      try {
        const websiteRes = await authenticatedFetch(getApiUrl("/stay-select-options/website"));
        if (websiteRes.ok) {
          const websiteData: SelectOption[] = await websiteRes.json();
          setWebsiteOptions(websiteData);
        }
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
      await authenticatedFetch(getApiUrl("/stay-select-options/website"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options: newOptions }),
      });
    } catch (e) {
      console.error("[EditStay] Failed to save website options:", e);
    }
  };

  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [hotelName, setHotelName] = useState("");
  const [website, setWebsite] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [breakfastFlag, setBreakfastFlag] = useState(false);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [penalty, setPenalty] = useState("");
  const [status, setStatus] = useState<string | null>("Keep");

  // 既存データを読み込む
  useEffect(() => {
    if (!stayId) return;

    const fetchStay = async () => {
      try {
        setLoading(true);
        const res = await authenticatedFetch(getApiUrl(`/stay/${stayId}`));
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Stay not found");
          }
          throw new Error(`status: ${res.status}`);
        }
        const data: Stay = await res.json();

        setCheckIn(data.check_in || null);
        setCheckOut(data.check_out || null);
        setHotelName(data.hotel_name || "");
        setWebsite(data.website || null);
        setFee(data.fee.toString());
        setBreakfastFlag(data.breakfast_flag);
        setDeadline(data.deadline || null);
        setPenalty(data.penalty?.toString() || "");
        setStatus(data.status || "Keep");
      } catch (e: any) {
        console.error("Error fetching stay:", e);
        Alert.alert("エラー", "データの読み込みに失敗しました。");
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchStay();
  }, [stayId, router]);

  const handleSubmit = async () => {
    if (!stayId) {
      Alert.alert("エラー", "stayId が指定されていません。");
      return;
    }
    if (!checkIn || !checkOut || !hotelName.trim()) {
      Alert.alert("必須項目", "Check-in / Check-out / Hotel は必須です。");
      return;
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
      <View style={styles.container}>
        <ActivityIndicator color="#37352f" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <PageHeader showBackButton={true} homePath="/" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Edit Stay</Text>

      <NotionDatePicker
        label="Check-in"
        value={checkIn}
        onValueChange={setCheckIn}
        mode="datetime"
        placeholder="YYYY-MM-DD HH:MM"
        required={true}
      />

      <NotionDatePicker
        label="Check-out"
        value={checkOut}
        onValueChange={setCheckOut}
        mode="datetime"
        placeholder="YYYY-MM-DD HH:MM"
        required={true}
      />

      <Text style={styles.label}>
        Hotel <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={hotelName}
        onChangeText={setHotelName}
      />

      <NotionSelect
        label="Website"
        value={website}
        options={websiteOptions}
        onValueChange={setWebsite}
        onOptionsChange={handleWebsiteOptionsChange}
        placeholder="選択してください"
        stayOptionType="WEBSITE"
      />

      <Text style={styles.label}>
        Fee <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={fee}
        onChangeText={setFee}
        keyboardType="numeric"
      />

      <View style={styles.flagRow}>
        <Text style={styles.label}>Breakfast</Text>
        <Switch value={breakfastFlag} onValueChange={setBreakfastFlag} />
      </View>

      <NotionDatePicker
        label="Deadline"
        value={deadline}
        onValueChange={setDeadline}
        mode="datetime"
        placeholder="YYYY-MM-DD HH:MM"
      />

      <Text style={styles.label}>Penalty (%)</Text>
      <TextInput
        style={styles.input}
        value={penalty}
        onChangeText={setPenalty}
        keyboardType="numeric"
      />

      <NotionSelect
        label="Status"
        value={status}
        options={statuses}
        onValueChange={setStatus}
        onOptionsChange={handleStatusesChange}
        placeholder="選択してください"
      />

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? "Updating..." : "Update"}
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
});

