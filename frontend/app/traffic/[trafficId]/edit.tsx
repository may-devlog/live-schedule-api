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
} from "react-native";
import { authenticatedFetch, getApiUrl } from "../../../utils/api";
import { NotionSelect } from "../../../components/notion-select";
import { NotionDatePicker } from "../../../components/notion-date-picker";
import type { SelectOption } from "../../../types/select-option";
import {
  loadSelectOptions,
  saveSelectOptions,
} from "../../../utils/select-options-storage";
import { HomeButton } from "../../../components/HomeButton";

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
  const [order, setOrder] = useState("1");
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
      const res = await fetch(`${API_BASE}/traffic/${trafficId}`);
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
        Alert.alert("エラー", `交通情報の更新に失敗しました（status: ${res.status}）`);
        return;
      }

      const updated = await res.json();
      Alert.alert("更新完了", "交通情報を更新しました。", [
        {
          text: "OK",
          onPress: () => {
            router.push(`/traffic/${trafficId}`);
          },
        },
      ]);
    } catch (e: any) {
      console.log("UPDATE TRAFFIC EXCEPTION:", e);
      Alert.alert("エラー", "通信に失敗しました。サーバーの状態を確認してください。");
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Edit Traffic</Text>

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
          {submitting ? "Updating..." : "Update"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 48,
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
});

