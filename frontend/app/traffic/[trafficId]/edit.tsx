// app/traffic/[trafficId]/edit.tsx
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
import {
  loadSelectOptions,
  saveSelectOptions,
} from "../../../utils/select-options-storage";
import { AppHeader, PublicFooter } from "../../../components/GenBGTBrand";
import { useTheme, type ThemeColors } from "../../../contexts/ThemeContext";

type Traffic = {
  id: number;
  schedule_id: number;
  date: string;
  order: number;
  transportation?: string | null;
  from: string;
  to: string;
  notes?: string | null;
  fare: number;
  miles?: number | null;
  return_flag: boolean;
  total_fare?: number | null;
  total_miles?: number | null;
};

export default function EditTrafficScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { trafficId } = useLocalSearchParams<{ trafficId: string }>();
  const router = useRouter();

  const [transportations, setTransportations] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadOptions = async () => {
      const trans = await loadSelectOptions("TRANSPORTATIONS");
      setTransportations(trans);
    };
    loadOptions();
  }, []);

  const handleTransportationsChange = async (
    newTransportations: SelectOption[]
  ) => {
    setTransportations(newTransportations);
    await saveSelectOptions("TRANSPORTATIONS", newTransportations);
  };

  const [date, setDate] = useState<string | null>(null);
  const [order, setOrder] = useState("");
  const [transportation, setTransportation] = useState<string | null>(null);
  const [fromPlace, setFromPlace] = useState("");
  const [toPlace, setToPlace] = useState("");
  const [notes, setNotes] = useState("");
  const [fare, setFare] = useState("");
  const [miles, setMiles] = useState("");
  const [returnFlag, setReturnFlag] = useState(false);

  // 既存データを読み込む
  useEffect(() => {
    if (!trafficId) return;

    const fetchTraffic = async () => {
      try {
        setLoading(true);
        const res = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`));
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Traffic not found");
          }
          throw new Error(`status: ${res.status}`);
        }
        const data: Traffic = await res.json();

        setDate(data.date || null);
        setOrder(data.order.toString());
        setTransportation(data.transportation || null);
        setFromPlace(data.from || "");
        setToPlace(data.to || "");
        setNotes(data.notes || "");
        setFare(data.fare.toString());
        setMiles(data.miles?.toString() || "");
        setReturnFlag(data.return_flag);
      } catch (e: any) {
        console.error("Error fetching traffic:", e);
        Alert.alert("エラー", "データの読み込みに失敗しました。");
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchTraffic();
  }, [trafficId, router]);

  const handleSubmit = async () => {
    if (!trafficId) {
      Alert.alert("エラー", "trafficId が指定されていません。");
      return;
    }
    if (!date || !fromPlace.trim() || !toPlace.trim()) {
      Alert.alert("必須項目", "Date / From / To は必須です。");
      return;
    }
    const fareNum = fare ? Number(fare) : NaN;
    if (Number.isNaN(fareNum)) {
      Alert.alert("入力エラー", "Fare は数値で入力してください。");
      return;
    }
    const orderNum = order ? Number(order) : 1;
    if (Number.isNaN(orderNum)) {
      Alert.alert("入力エラー", "Order は数値で入力してください。");
      return;
    }
    const milesNum = miles ? Number(miles) : undefined;
    if (miles && Number.isNaN(milesNum)) {
      Alert.alert("入力エラー", "Miles は数値で入力してください。");
      return;
    }

    // schedule_idを取得するために既存データを再取得
    let scheduleId: number;
    try {
      const res = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`));
      if (!res.ok) throw new Error("Failed to fetch traffic");
      const traffic: Traffic = await res.json();
      scheduleId = traffic.schedule_id;
    } catch (e: any) {
      Alert.alert("エラー", "データの取得に失敗しました。");
      return;
    }

    const payload = {
      schedule_id: scheduleId,
      date: date,
      order: orderNum,
      transportation: transportation || null,
      from: fromPlace.trim(),
      to: toPlace.trim(),
      notes: notes ? notes.trim() : null,
      fare: fareNum,
      miles: milesNum ?? null,
      return_flag: returnFlag,
    };

    try {
      setSubmitting(true);
      const res = await authenticatedFetch(getApiUrl(`/traffic/${trafficId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.log("UPDATE TRAFFIC ERROR:", res.status, text);
        const errorMessage = `交通情報の更新に失敗しました（status: ${res.status}）`;
        if (Platform.OS === "web") {
          window.alert(`エラー\n\n${errorMessage}`);
        } else {
          Alert.alert("エラー", errorMessage);
        }
        return;
      }

      const updated = await res.json();
      if (Platform.OS === "web") {
        window.alert("更新完了\n\n交通情報を更新しました。");
        router.push(`/traffic/${trafficId}`);
      } else {
        Alert.alert("更新完了", "交通情報を更新しました。", [
          {
            text: "OK",
            onPress: () => {
              router.push(`/traffic/${trafficId}`);
            },
          },
        ]);
      }
    } catch (e: any) {
      console.log("UPDATE TRAFFIC EXCEPTION:", e);
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
        <ActivityIndicator color={colors.muted} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <AppHeader active="archive" />
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={styles.container}>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}><Text style={styles.backLinkText}>← 交通詳細に戻る</Text></TouchableOpacity>
        <Text style={styles.eyebrow}>EDIT TRAFFIC</Text>
        <Text style={styles.title}>交通を編集</Text>
        <Text style={styles.lead}>登録済みの交通情報を更新します。</Text>
        <View style={styles.formCard}>

      <NotionDatePicker
        label="利用日"
        value={date}
        onValueChange={setDate}
        mode="date"
        placeholder="YYYY-MM-DD"
        required={true}
      />

      <Text style={styles.label}>
        利用順 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={order}
        onChangeText={setOrder}
        keyboardType="numeric"
      />

      <NotionSelect
        label="交通手段"
        value={transportation}
        options={transportations}
        onValueChange={setTransportation}
        onOptionsChange={handleTransportationsChange}
        placeholder="選択してください"
        isTransportation={true}
        optionType="TRANSPORTATIONS"
      />

      <Text style={styles.label}>
        出発地 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={fromPlace}
        onChangeText={setFromPlace}
      />

      <Text style={styles.label}>
        到着地 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={toPlace}
        onChangeText={setToPlace}
      />

      <Text style={styles.label}>備考</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Text style={styles.label}>
        運賃 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={fare}
        onChangeText={setFare}
        keyboardType="numeric"
      />

      <Text style={styles.label}>消費マイル</Text>
      <TextInput
        style={styles.input}
        value={miles}
        onChangeText={setMiles}
        keyboardType="numeric"
      />

      <View style={styles.flagRow}>
        <Text style={styles.label}>往復フラグ</Text>
        <Switch value={returnFlag} onValueChange={setReturnFlag} />
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? "更新中..." : "更新"}
        </Text>
      </TouchableOpacity>
        </View>
        </View>
        <PublicFooter />
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceAlt },
  pageContent: { flexGrow: 1 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  container: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 56,
    maxWidth: 960,
    alignSelf: "center",
    width: "100%",
  },
  backLink: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 16 },
  backLinkText: { color: colors.accentDark, fontSize: 14, fontWeight: "700" },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.8, marginBottom: 7 },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 8,
  },
  lead: { color: colors.muted, fontSize: 14, marginBottom: 24 },
  formCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 28, shadowColor: '#2E1065', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
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
  value: {
    fontSize: 14,
    color: "#37352f",
    marginTop: 2,
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: "#37352f",
    minHeight: 46,
    marginBottom: 16,
  },
  multiline: {
    height: 100,
    textAlignVertical: "top",
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
    backgroundColor: colors.accent,
    minHeight: 50,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.accentContrastText,
    fontSize: 14,
    fontWeight: "600",
  },
});
