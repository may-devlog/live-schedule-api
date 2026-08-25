// app/traffic/new.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
} from "react-native";
import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { NotionSelect } from "../../components/notion-select";
import { NotionDatePicker } from "../../components/notion-date-picker";
import type { SelectOption } from "../../types/select-option";
import {
  loadSelectOptions,
  saveSelectOptions,
} from "../../utils/select-options-storage";
import { useEffect } from "react";
import { NotionRelation } from "../../components/notion-relation";
import type { Schedule } from "../HomeScreen";
import { AppHeader, PublicFooter } from "../../components/GenBGTBrand";
import { useTheme, type ThemeColors } from "../../contexts/ThemeContext";

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

export default function NewTrafficScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { scheduleId: initialScheduleId, copyFrom } = useLocalSearchParams<{
    scheduleId?: string;
    copyFrom?: string;
  }>();
  const router = useRouter();

  const [scheduleId, setScheduleId] = useState<string | null>(initialScheduleId || null);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [transportations, setTransportations] = useState<SelectOption[]>([]);

  useEffect(() => {
    const loadOptions = async () => {
      const trans = await loadSelectOptions("TRANSPORTATIONS");
      setTransportations(trans);
    };
    loadOptions();
    
    // 全スケジュール一覧を取得（スケジュール選択用）
    const loadSchedules = async () => {
      try {
        const res = await authenticatedFetch(getApiUrl("/schedules"));
        if (res.ok) {
          const data: Schedule[] = await res.json();
          setAllSchedules(data);
        }
      } catch (e) {
        console.error("[NewTraffic] Failed to fetch schedules:", e);
      }
    };
    loadSchedules();
  }, []);

  // 既存データを複製する場合の読み込み
  useEffect(() => {
    if (!copyFrom) return;

    const loadTrafficForCopy = async () => {
      try {
        const res = await authenticatedFetch(getApiUrl(`/traffic/${copyFrom}`));
        if (!res.ok) {
          console.warn("Traffic not found for copy:", copyFrom);
          return;
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
        // scheduleIdも設定（もし指定されていなければ）
        if (!scheduleId && data.schedule_id) {
          setScheduleId(data.schedule_id.toString());
        }
      } catch (e: any) {
        console.error("Error loading traffic for copy:", e);
      }
    };

    loadTrafficForCopy();
  }, [copyFrom, scheduleId]);

  // scheduleIdが渡された場合、スケジュール情報を取得して利用日をデフォルト値に設定
  useEffect(() => {
    if (!scheduleId || copyFrom || date || allSchedules.length === 0) return; // 複製の場合、または既に日付が設定されている場合、またはスケジュール一覧が未取得の場合はスキップ

    // 全スケジュール一覧から該当するスケジュールを検索
    const schedule = allSchedules.find((s) => s.id.toString() === scheduleId);
    // 利用日をライブ当日に設定
    if (schedule?.date) {
      setDate(schedule.date);
    }
  }, [scheduleId, copyFrom, allSchedules]);

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
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!scheduleId || scheduleId === "undefined" || scheduleId === "null") {
      Alert.alert("エラー", "スケジュールを選択してください。");
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

    const payload = {
      schedule_id: Number(scheduleId),
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
      const res = await authenticatedFetch(getApiUrl("/traffic"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.log("CREATE TRAFFIC ERROR:", res.status, text);
        const errorMessage = `交通の登録に失敗しました（status: ${res.status}）`;
        if (Platform.OS === "web") {
          window.alert(`エラー\n\n${errorMessage}`);
        } else {
          Alert.alert("エラー", errorMessage);
        }
        return;
      }

      const created = await res.json();
      const successMessage = copyFrom ? "交通情報を複製しました。" : "交通情報を登録しました。";
      if (Platform.OS === "web") {
        window.alert(`登録完了\n\n${successMessage}`);
        if (scheduleId) {
          router.push(`/live/${scheduleId}`);
        } else {
          router.push("/");
        }
      } else {
        Alert.alert("登録完了", successMessage, [
          {
            text: "OK",
            onPress: () => {
              if (scheduleId) {
                router.push(`/live/${scheduleId}`);
              } else {
                router.push("/");
              }
            },
          },
        ]);
      }
    } catch (e: any) {
      console.log("CREATE TRAFFIC EXCEPTION:", e);
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

  return (
    <View style={styles.page}>
      <AppHeader active="archive" />
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={styles.container}>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}><Text style={styles.backLinkText}>← イベント詳細に戻る</Text></TouchableOpacity>
        <Text style={styles.eyebrow}>TRAFFIC</Text>
        <Text style={styles.title}>{copyFrom ? "交通を複製" : "新規交通"}</Text>
        <Text style={styles.lead}>移動経路や運賃を登録します。</Text>
        <View style={styles.formCard}>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Schedule</Text>
        </View>
        <NotionRelation
          label=""
          value={scheduleId ? [Number(scheduleId)] : []}
          onValueChange={(ids) => {
            setScheduleId(ids.length > 0 ? ids[0].toString() : null);
          }}
          placeholder="↗ スケジュールにリンク"
          changeButtonLabel="↻ 親スケジュールを変更"
          hideSelectedCards={false}
          singleSelect={true}
        />
      </View>

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
        <Switch value={returnFlag} onValueChange={setReturnFlag} trackColor={{ false: "#D9D4E2", true: "#C4B5FD" }} thumbColor={returnFlag ? colors.accent : "#FFFFFF"} />
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? "保存中..." : "保存"}
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
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
