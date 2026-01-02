// app/live/[id]/edit.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Switch,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { authenticatedFetch, getApiUrl } from "../../../utils/api";
import { NotionSelect } from "../../../components/notion-select";
import { NotionMultiSelect } from "../../../components/notion-multi-select";
import { NotionDatePicker } from "../../../components/notion-date-picker";
import { NotionRelation } from "../../../components/notion-relation";
import type { SelectOption } from "../../../types/select-option";
import type { Schedule } from "../../HomeScreen";
import {
  loadSelectOptions,
  saveSelectOptions,
} from "../../../utils/select-options-storage";
import { HomeButton } from "../../../components/HomeButton";

export default function EditScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

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

  // フォームの状態
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 必須
  const [title, setTitle] = useState("");
  // 任意（未入力時はtitleを使用）
  const [group, setGroup] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [venue, setVenue] = useState("");

  // 任意
  const [date, setDate] = useState<string | null>(null);
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
  const [isPublic, setIsPublic] = useState(false);

  // 既存データを読み込む
  useEffect(() => {
    if (!id) return;
    // 選択肢が読み込まれるまで待つ
    if (targets.length === 0 || lineupOptions.length === 0) return;

    const fetchSchedule = async () => {
      try {
        setLoading(true);
        const res = await authenticatedFetch(getApiUrl("/schedules"));
        if (!res.ok) throw new Error(`status: ${res.status}`);
        const data: Schedule[] = await res.json();
        const found = data.find((s) => s.id.toString() === id);
        if (!found) {
          Alert.alert("エラー", "スケジュールが見つかりませんでした。");
          router.back();
          return;
        }

        // フォームに既存データを設定
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
        
        // Target: 既存の選択肢に存在するかチェック
        const targetOptionLabels = targets.map(opt => opt.label);
        console.log("Edit - Target options:", targetOptionLabels);
        console.log("Edit - Found target:", found.target);
        const validTarget = found.target && targetOptionLabels.includes(found.target) ? found.target : null;
        console.log("Edit - Valid target:", validTarget);
        setTarget(validTarget);
        
        // Lineup: カンマ区切りの値を既存の選択肢でフィルタリング
        const lineupOptionLabels = lineupOptions.map(opt => opt.label);
        console.log("Edit - Lineup options:", lineupOptionLabels);
        if (found.lineup) {
          const lineupValues = found.lineup.split(",").map(v => v.trim()).filter(v => v);
          console.log("Edit - Lineup values:", lineupValues);
          const validLineupValues = lineupValues.filter(v => lineupOptionLabels.includes(v));
          console.log("Edit - Valid lineup values:", validLineupValues);
          setLineup(validLineupValues.length > 0 ? validLineupValues.join(", ") : "");
        } else {
          setLineup("");
        }
        
        setSeller(found.seller || null);
        setTicketFee(found.ticket_fee?.toString() || "");
        setDrinkFee(found.drink_fee?.toString() || "");
        setStatus(found.status || "Pending");
        setRelatedScheduleIds(found.related_schedule_ids || []);
        setIsPublic(found.is_public || false);
      } catch (e: any) {
        console.error("Error fetching schedule:", e);
        Alert.alert("エラー", "データの読み込みに失敗しました。");
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();
  }, [id, router, targets, lineupOptions]);

  const handleSubmit = async () => {
    if (!id) return;

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
      related_schedule_ids: relatedScheduleIds,
      is_public: isPublic,
    };

    try {
      setSubmitting(true);
      console.log("[UPDATE] Updating schedule with payload:", payload);
      console.log("[UPDATE] API URL:", getApiUrl(`/schedules/${id}`));
      
      const res = await authenticatedFetch(getApiUrl(`/schedules/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("[UPDATE] Response status:", res.status);
      console.log("[UPDATE] Response headers:", Object.fromEntries(res.headers.entries()));

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[UPDATE] Error response:", res.status, text);
        let errorMessage = `更新に失敗しました（status: ${res.status}）`;
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
        if (Platform.OS === "web") {
          window.alert(`エラー\n\n${errorMessage}`);
        } else {
          Alert.alert("エラー", errorMessage);
        }
        setSubmitting(false);
        return;
      }

      const updated = await res.json().catch(async (e) => {
        console.error("[UPDATE] Failed to parse JSON response:", e);
        const text = await res.text().catch(() => "");
        console.error("[UPDATE] Response text:", text);
        throw new Error("サーバーからの応答を解析できませんでした");
      });
      
      console.log("[UPDATE] Success:", updated);
      
      // 成功メッセージを表示
      const successMessage = "ライブ情報を更新しました";
      if (Platform.OS === "web") {
        window.alert(successMessage);
        setTimeout(() => {
          router.push(`/live/${id}`);
        }, 100);
      } else {
        Alert.alert("更新完了", successMessage, [
          {
            text: "OK",
            onPress: () => {
              router.push(`/live/${id}`);
            },
          },
        ]);
      }
    } catch (e: any) {
      console.error("[UPDATE] Exception:", e);
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
      <Text style={styles.title}>Edit Live</Text>

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

      {/* 公開トグル */}
      <View style={styles.switchContainer}>
        <Text style={styles.switchLabel}>公開</Text>
        <Switch
          value={isPublic}
          onValueChange={setIsPublic}
        />
      </View>

      {/* Relation型 */}
      <NotionRelation
        label="Related Schedules"
        value={relatedScheduleIds}
        onValueChange={setRelatedScheduleIds}
        currentScheduleId={id ? Number(id) : undefined}
        placeholder="関連スケジュールを選択"
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
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: "#37352f",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});

