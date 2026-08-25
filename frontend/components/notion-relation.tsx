// Notion風のRelationコンポーネント（自己リレーション用）
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { NotionTag } from "./notion-tag";
import { ScheduleLinkCard } from "./ScheduleLinkCard";
import type { Schedule } from "../app/HomeScreen";
import { authenticatedFetch, getApiUrl } from "../utils/api";
import { getOptionColorSync } from "../utils/get-option-color";
import { fetchAreaColors } from "../utils/fetch-area-colors";
import { useTheme, type ThemeColors } from "../contexts/ThemeContext";

type NotionRelationProps = {
  label: string;
  value: number[]; // 選択されたスケジュールIDの配列
  onValueChange: (ids: number[]) => void;
  currentScheduleId?: number; // 現在編集中のスケジュールID（自分自身を除外するため）
  placeholder?: string;
  hideSelectedCards?: boolean; // 選択されたカードを非表示にするか
  singleSelect?: boolean; // 単一選択モード（trueの場合、新しい選択時に既存の選択を解除）
  confirmChangeMessage?: string; // 指定すると、選択の変更・解除の前に確認ダイアログを挟む
  changeButtonLabel?: string; // 選択済み時のボタンラベル（未指定時は「N件選択中」）
};

export function NotionRelation({
  label,
  value,
  onValueChange,
  currentScheduleId,
  placeholder = "関連スケジュールを選択",
  hideSelectedCards = false,
  singleSelect = false,
  confirmChangeMessage,
  changeButtonLabel,
}: NotionRelationProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [modalVisible, setModalVisible] = useState(false);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [areaColors, setAreaColors] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // スケジュール一覧を読み込む
  // 選択済みカードを初期表示するため、モーダルを開く前から読み込んでおく
  useEffect(() => {
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch(getApiUrl("/schedules"));
      if (!res.ok) throw new Error(`status: ${res.status}`);
      const data: Schedule[] = await res.json();
      // 現在編集中のスケジュールを除外
      const filtered = currentScheduleId
        ? data.filter((s) => s.id !== currentScheduleId)
        : data;
      setAllSchedules(filtered);
      fetchAreaColors(filtered).then(setAreaColors);
    } catch (error) {
      console.error("Error loading schedules:", error);
      setAllSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  // 検索フィルタリング
  const filteredSchedules = allSchedules.filter((schedule) => {
    if (!searchText.trim()) return true;
    const searchLower = searchText.toLowerCase();
    return (
      schedule.title.toLowerCase().includes(searchLower) ||
      (schedule.group && schedule.group.toLowerCase().includes(searchLower)) ||
      schedule.venue.toLowerCase().includes(searchLower) ||
      schedule.area.toLowerCase().includes(searchLower)
    );
  });

  // 選択されたスケジュール情報を取得
  const selectedSchedules = allSchedules.filter((s) => value.includes(s.id));

  // confirmChangeMessageが指定されている場合、選択の変更・解除をワンクッション確認してから反映する
  // （紐付け変更が即時保存されるSchedule単一選択フィールドでの誤操作防止用）
  const confirmThen = (action: () => void) => {
    if (!confirmChangeMessage) {
      action();
      return;
    }
    if (Platform.OS === "web" && typeof window !== "undefined" && window.confirm) {
      if (window.confirm(confirmChangeMessage)) action();
    } else {
      Alert.alert("確認", confirmChangeMessage, [
        { text: "キャンセル", style: "cancel" },
        { text: "変更する", style: "destructive", onPress: action },
      ]);
    }
  };

  const handleToggleSchedule = (scheduleId: number) => {
    confirmThen(() => {
      if (singleSelect) {
        // 単一選択モード: 既に選択されている場合は解除、そうでない場合は選択（既存の選択を解除）
        if (value.includes(scheduleId)) {
          // 削除
          onValueChange([]);
        } else {
          // 新しい選択（既存の選択を解除）
          onValueChange([scheduleId]);
        }
      } else {
        // 複数選択モード: 既存の動作
        if (value.includes(scheduleId)) {
          // 削除
          onValueChange(value.filter((id) => id !== scheduleId));
        } else {
          // 追加
          onValueChange([...value, scheduleId]);
        }
      }
    });
  };

  const handleRemoveSchedule = (scheduleId: number) => {
    confirmThen(() => onValueChange(value.filter((id) => id !== scheduleId)));
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
        </Text>
      )}

      {/* 選択されたスケジュールをカード表示 */}
      {!hideSelectedCards && selectedSchedules.length > 0 && (
        <View style={styles.selectedContainer}>
          {selectedSchedules.map((schedule) => (
            <ScheduleLinkCard
              key={schedule.id}
              date={schedule.date}
              title={schedule.title}
              area={schedule.area}
              onRemove={() => handleRemoveSchedule(schedule.id)}
            />
          ))}
        </View>
      )}

      {/* 選択ボタン */}
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.selectText}>
          {selectedSchedules.length > 0
            ? changeButtonLabel ?? `${selectedSchedules.length}件選択中`
            : placeholder}
        </Text>
      </TouchableOpacity>

      {/* モーダル */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onTouchStart={(e) => {
              // モーダルコンテンツ内のタッチでモーダルが閉じないようにする
              if (e && e.nativeEvent) {
                e.stopPropagation();
              }
            }}
            onTouchEnd={(e) => {
              // モーダルコンテンツ内のタッチでモーダルが閉じないようにする
              if (e && e.nativeEvent) {
                e.stopPropagation();
              }
            }}
            onClick={(e) => {
              // Web環境でのクリックイベント伝播を防止
              if (e) {
                e.stopPropagation();
              }
            }}
          >
            <Text style={styles.modalTitle}>{label}</Text>

            {/* 検索バー */}
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="検索..."
              placeholderTextColor={colors.muted}
              onPressIn={(e) => e.stopPropagation()}
              onPressOut={(e) => e.stopPropagation()}
            />

            {loading ? (
              <Text style={styles.loadingText}>読み込み中...</Text>
            ) : (
              <ScrollView 
                style={styles.optionsList}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
              >
                {filteredSchedules.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {searchText ? "検索結果がありません" : "スケジュールはありません"}
                  </Text>
                ) : (
                  filteredSchedules.map((schedule) => {
                    const isSelected = value.includes(schedule.id);
                    return (
                      <TouchableOpacity
                        key={schedule.id}
                        style={[
                          styles.optionItem,
                          isSelected && styles.optionItemSelected,
                        ]}
                        onPress={() => {
                          handleToggleSchedule(schedule.id);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.optionContent}>
                          {schedule.date && (
                            <Text style={styles.optionDate}>{schedule.date}</Text>
                          )}
                          <Text style={styles.optionTitle} numberOfLines={1}>
                            {schedule.title}
                          </Text>
                          {!!schedule.area && (
                            <NotionTag
                              label={schedule.area}
                              color={areaColors.get(schedule.id) || getOptionColorSync(schedule.area, "AREAS")}
                            />
                          )}
                        </View>
                        {isSelected && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setModalVisible(false);
                setSearchText("");
              }}
            >
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 6,
  },
  selectedContainer: {
    gap: 8,
    marginBottom: 8,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  selectText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentDark,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    width: "90%",
    maxWidth: 600,
    maxHeight: "80%",
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 16,
  },
  loadingText: {
    textAlign: "center",
    color: colors.muted,
    padding: 20,
  },
  optionsList: {
    maxHeight: 400,
  },
  emptyText: {
    textAlign: "center",
    color: colors.muted,
    padding: 20,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionItemSelected: {
    backgroundColor: colors.accentSoft,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.ink,
    marginBottom: 4,
  },
  optionDate: {
    fontSize: 11,
    color: colors.muted,
  },
  checkmark: {
    fontSize: 18,
    color: colors.accent,
    marginLeft: 12,
  },
  closeButton: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: colors.accent,
    borderRadius: 3,
    alignItems: "center",
  },
  closeButtonText: {
    color: colors.accentContrastText,
    fontSize: 14,
    fontWeight: "600",
  },
});

