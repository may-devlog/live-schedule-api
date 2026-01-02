// app/new.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { authenticatedFetch, getApiUrl } from "../utils/api";
import { NotionSelect } from "../components/notion-select";
import { NotionMultiSelect } from "../components/notion-multi-select";
import { NotionDatePicker } from "../components/notion-date-picker";
import { NotionRelation } from "../components/notion-relation";
import type { SelectOption } from "../types/select-option";
import type { Schedule } from "./HomeScreen";
import {
  loadSelectOptions,
  saveSelectOptions,
} from "../utils/select-options-storage";
import { useAuth } from "@/contexts/AuthContext";
import { HomeButton } from "../components/HomeButton";

export default function NewScheduleScreen() {
  const router = useRouter();
  const { copyFrom, date: initialDate } = useLocalSearchParams<{ copyFrom?: string; date?: string }>();
  const { isAuthenticated } = useAuth();

  // 未ログインの場合はログイン画面にリダイレクト
  React.useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  // 選択肢の状態管理（SelectOption型）
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [areas, setAreas] = useState<SelectOption[]>([]);
  const [targets, setTargets] = useState<SelectOption[]>([]);
  const [lineupOptions, setLineupOptions] = useState<SelectOption[]>([]);
  const [sellers, setSellers] = useState<SelectOption[]>([]);
  const [statuses, setStatuses] = useState<SelectOption[]>([]);

  // 選択肢を読み込む
  useEffect(() => {
    const loadOptions = async () => {
      const [cats, areasData, targetsData, sellersData, statusesData] =
        await Promise.all([
          loadSelectOptions("CATEGORIES"),
          loadSelectOptions("AREAS"),
          loadSelectOptions("TARGETS"),
          loadSelectOptions("SELLERS"),
          loadSelectOptions("STATUSES"),
        ]);
      setCategories(cats);
      setAreas(areasData);
      // Lineupの選択肢をTargetで使用（Lineup側から編集）
      setLineupOptions(targetsData);
      setTargets(targetsData); // TargetはLineupの選択肢を読み込む（編集不可）
      setSellers(sellersData);
      setStatuses(statusesData);
    };
    loadOptions();
  }, []);

  // 既存データを複製する場合の読み込み
  // 注意: traffic_ids, stay_ids, related_schedule_ids は複製しない
  useEffect(() => {
    if (!copyFrom) return;

    const loadScheduleForCopy = async () => {
      try {
        const res = await authenticatedFetch(getApiUrl("/schedules"));
        if (!res.ok) throw new Error(`status: ${res.status}`);
        const data: Schedule[] = await res.json();
        const found = data.find((s) => s.id.toString() === copyFrom);
        if (!found) {
          console.warn("Schedule not found for copy:", copyFrom);
          return;
        }

        // フォームに既存データを設定
        // traffic_ids, stay_ids, related_schedule_ids は複製しない
        setTitle(found.title || "");
        setGroup(found.group || "");
        setArea(found.area || null);
        setVenue(found.venue || "");
        setDate(found.date || null);
        setOpenTime(found.open || null);
        setStartTime(found.start || null);
        setEndTime(found.end || null);
        setNotes(found.notes || "");
        setCategory(found.category || null);
        setTarget(found.target || null);
        setLineup(found.lineup || "");
        setSeller(found.seller || null);
        setTicketFee(found.ticket_fee?.toString() || "");
        setDrinkFee(found.drink_fee?.toString() || "");
        setStatus(found.status || "Pending");
        // 注意: traffic_ids, stay_ids, related_schedule_ids は意図的に複製しない
      } catch (e: any) {
        console.error("Error loading schedule for copy:", e);
      }
    };

    loadScheduleForCopy();
  }, [copyFrom]);

  // URLパラメータから日付を設定（copyFromがない場合のみ）
  useEffect(() => {
    if (!copyFrom && initialDate) {
      setDate(initialDate);
    }
  }, [initialDate, copyFrom]);

  // 選択肢の変更を保存
  const handleCategoriesChange = async (newCategories: SelectOption[]) => {
    setCategories(newCategories);
    await saveSelectOptions("CATEGORIES", newCategories);
  };

  const handleAreasChange = async (newAreas: SelectOption[]) => {
    setAreas(newAreas);
    await saveSelectOptions("AREAS", newAreas);
  };

  const handleLineupOptionsChange = async (newLineupOptions: SelectOption[]) => {
    // Lineupの選択肢をTARGETSとして保存
    setLineupOptions(newLineupOptions);
    setTargets(newLineupOptions); // Targetも同じ選択肢を使用
    await saveSelectOptions("TARGETS", newLineupOptions);
  };

  const handleSellersChange = async (newSellers: SelectOption[]) => {
    setSellers(newSellers);
    await saveSelectOptions("SELLERS", newSellers);
  };

  const handleStatusesChange = async (newStatuses: SelectOption[]) => {
    setStatuses(newStatuses);
    await saveSelectOptions("STATUSES", newStatuses);
  };

  // 必須
  const [title, setTitle] = useState("");
  // 任意（未入力時はtitleを使用）
  const [group, setGroup] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [venue, setVenue] = useState("");

  // 任意（URLパラメータから初期値を設定）
  const [date, setDate] = useState<string | null>(initialDate || null);
  const [openTime, setOpenTime] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [lineup, setLineup] = useState("");
  const [seller, setSeller] = useState<string | null>(null);
  const [ticketFee, setTicketFee] = useState("");
  const [drinkFee, setDrinkFee] = useState("");
  const [status, setStatus] = useState<string | null>("Pending");
  const [relatedScheduleIds, setRelatedScheduleIds] = useState<number[]>([]);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    // 必須項目のチェック（targetはNULL許可のため除外）
    if (!title.trim() || !area || !venue.trim()) {
      Alert.alert("必須項目", "Title / Area / Venue は必須です。");
      return;
    }

    // 数値系のパース
    const ticketFeeNum = ticketFee ? Number(ticketFee) : undefined;
    const drinkFeeNum = drinkFee ? Number(drinkFee) : undefined;

    if (ticketFee && Number.isNaN(ticketFeeNum)) {
      Alert.alert("入力エラー", "Ticket fee は数値で入力してください。");
      return;
    }
    if (drinkFee && Number.isNaN(drinkFeeNum)) {
      Alert.alert("入力エラー", "Drink fee は数値で入力してください。");
      return;
    }

    const payload = {
      title: title.trim(),
      group: group.trim() || null, // 空文字列の場合はnull（未入力時はtitleを使用）
      date: date || null,
      open: openTime || null,
      start: startTime || null,
      end: endTime || null,
      notes: notes ? notes.trim() : null,
      category: category || null,
      area: area,
      venue: venue.trim(),
      target: target || null, // NULL許可
      lineup: lineup ? lineup.trim() : null,
      seller: seller || null,
      ticket_fee: ticketFeeNum ?? null,
      drink_fee: drinkFeeNum ?? null,
      status: status || "Pending",
      related_schedule_ids: relatedScheduleIds.length > 0 ? relatedScheduleIds : null,
      is_public: false, // デフォルトは非公開
    };

    try {
      setSubmitting(true);
      console.log("[CREATE] Creating schedule with payload:", payload);
      console.log("[CREATE] API URL:", getApiUrl("/schedules"));
      
      const res = await authenticatedFetch(getApiUrl("/schedules"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("[CREATE] Response status:", res.status);
      console.log("[CREATE] Response headers:", Object.fromEntries(res.headers.entries()));
      
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[CREATE] Error response:", res.status, text);
        let errorMessage = `登録に失敗しました（status: ${res.status}）`;
        try {
          const errorJson = JSON.parse(text);
          if (errorJson.error) {
            errorMessage = errorJson.error;
          }
        } catch {
          // JSONパースに失敗した場合はデフォルトメッセージを使用
          if (text) {
            errorMessage = text;
          }
        }
        // Web環境ではwindow.alertを使用
        if (Platform.OS === "web") {
          window.alert(`エラー\n\n${errorMessage}`);
        } else {
          Alert.alert("エラー", errorMessage);
        }
        setSubmitting(false);
        return;
      }

      const created = await res.json().catch(async (e) => {
        console.error("[CREATE] Failed to parse JSON response:", e);
        const text = await res.text().catch(() => "");
        console.error("[CREATE] Response text:", text);
        throw new Error("サーバーからの応答を解析できませんでした");
      });
      
      console.log("[CREATE] Success:", created);
      
      // 成功メッセージを表示
      const successMessage = "予定を追加しました";
      if (Platform.OS === "web") {
        window.alert(successMessage);
        // 少し待ってから遷移（アラートが閉じるのを待つ）
        setTimeout(() => {
          if (created.id) {
            router.push(`/live/${created.id}`);
          } else {
            router.back();
          }
        }, 100);
      } else {
        Alert.alert("登録完了", successMessage, [
          {
            text: "OK",
            onPress: () => {
              if (created.id) {
                router.push(`/live/${created.id}`);
              } else {
                router.back();
              }
            },
          },
        ]);
      }
    } catch (e: any) {
      console.error("[CREATE] Exception:", e);
      const errorMessage = e.message || "通信に失敗しました。サーバーの状態を確認してください。";
      // Web環境ではwindow.alertを使用
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← 戻る</Text>
        </TouchableOpacity>
        <HomeButton />
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          {copyFrom ? "Duplicate Live" : "New Live"}
        </Text>

      {/* Text型 */}
      <Text style={styles.label}>
        Title <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Group</Text>
      <TextInput
        style={styles.input}
        value={group}
        onChangeText={setGroup}
      />

      {/* Date/Time型 */}
      <NotionDatePicker
        label="Date"
        value={date}
        onValueChange={setDate}
        mode="date"
        placeholder="YYYY-MM-DD"
      />

      <NotionDatePicker
        label="Open"
        value={openTime}
        onValueChange={setOpenTime}
        mode="time"
        placeholder="HH:MM"
      />

      <NotionDatePicker
        label="Start"
        value={startTime}
        onValueChange={setStartTime}
        mode="time"
        placeholder="HH:MM"
      />

      <NotionDatePicker
        label="End"
        value={endTime}
        onValueChange={setEndTime}
        mode="time"
        placeholder="HH:MM"
      />

      {/* Text型（複数行） */}
      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {/* Select型 */}
      <NotionSelect
        label="Category"
        value={category}
        options={categories}
        onValueChange={setCategory}
        onOptionsChange={handleCategoriesChange}
        placeholder="選択してください"
        isCategory={true}
      />

      <NotionSelect
        label="Area"
        value={area}
        options={areas}
        onValueChange={setArea}
        onOptionsChange={handleAreasChange}
        placeholder="選択してください"
        required={true}
        isPrefecture={true}
      />

      <Text style={styles.label}>
        Venue <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={venue}
        onChangeText={setVenue}
      />

      <NotionSelect
        label="Target"
        value={target}
        options={targets}
        onValueChange={setTarget}
        placeholder="選択してください"
        required={true}
      />

      <NotionMultiSelect
        label="Lineup"
        value={lineup}
        options={lineupOptions}
        onValueChange={setLineup}
        onOptionsChange={handleLineupOptionsChange}
        placeholder="選択してください"
        sharedOptionsKey="TARGETS"
      />

      <NotionSelect
        label="Seller"
        value={seller}
        options={sellers}
        onValueChange={setSeller}
        onOptionsChange={handleSellersChange}
        placeholder="選択してください"
      />

      {/* Number型 */}
      <Text style={styles.label}>Ticket fee</Text>
      <TextInput
        style={styles.input}
        value={ticketFee}
        onChangeText={setTicketFee}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Drink fee</Text>
      <TextInput
        style={styles.input}
        value={drinkFee}
        onChangeText={setDrinkFee}
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

      {/* Relation型 */}
      <NotionRelation
        label="Related Schedules"
        value={relatedScheduleIds}
        onValueChange={setRelatedScheduleIds}
        placeholder="関連スケジュールを選択"
      />

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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  backButton: {
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 3,
  },
  backButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "600",
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
    marginBottom: 16,
  },
  multiline: {
    height: 100,
    textAlignVertical: "top",
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
