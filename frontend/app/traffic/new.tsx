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
import { HomeButton } from "../../components/HomeButton";
import { NotionRelation } from "../../components/notion-relation";
import type { Schedule } from "../HomeScreen";

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

  const handleTransportationsChange = async (
    newTransportations: SelectOption[]
  ) => {
    setTransportations(newTransportations);
    await saveSelectOptions("TRANSPORTATIONS", newTransportations);
  };

  const [date, setDate] = useState<string | null>(null);
  const [order, setOrder] = useState("1");
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
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <View style={styles.header}>
        <HomeButton />
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          {copyFrom ? "Duplicate Traffic" : "New Traffic"}
        </Text>

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
          hideSelectedCards={false}
        />
      </View>

      <NotionDatePicker
        label="Date"
        value={date}
        onValueChange={setDate}
        mode="date"
        placeholder="YYYY-MM-DD"
        required={true}
      />

      <Text style={styles.label}>
        Order <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={order}
        onChangeText={setOrder}
        keyboardType="numeric"
      />

      <NotionSelect
        label="Transportation"
        value={transportation}
        options={transportations}
        onValueChange={setTransportation}
        onOptionsChange={handleTransportationsChange}
        placeholder="選択してください"
        isTransportation={true}
      />

      <Text style={styles.label}>
        From <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={fromPlace}
        onChangeText={setFromPlace}
      />

      <Text style={styles.label}>
        To <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={toPlace}
        onChangeText={setToPlace}
      />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Text style={styles.label}>
        Fare <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={fare}
        onChangeText={setFare}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Miles</Text>
      <TextInput
        style={styles.input}
        value={miles}
        onChangeText={setMiles}
        keyboardType="numeric"
      />

      <View style={styles.flagRow}>
        <Text style={styles.label}>Return</Text>
        <Switch value={returnFlag} onValueChange={setReturnFlag} />
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? "Saving..." : "Save"}
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
  value: {
    fontSize: 14,
    color: "#37352f",
    marginTop: 2,
    marginBottom: 16,
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
