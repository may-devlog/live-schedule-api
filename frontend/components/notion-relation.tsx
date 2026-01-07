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
} from "react-native";
import { NotionTag } from "./notion-tag";
import type { Schedule } from "../app/HomeScreen";
import { authenticatedFetch, getApiUrl } from "../utils/api";

type NotionRelationProps = {
  label: string;
  value: number[]; // 選択されたスケジュールIDの配列
  onValueChange: (ids: number[]) => void;
  currentScheduleId?: number; // 現在編集中のスケジュールID（自分自身を除外するため）
  placeholder?: string;
  hideSelectedCards?: boolean; // 選択されたカードを非表示にするか
  singleSelect?: boolean; // 単一選択モード（trueの場合、新しい選択時に既存の選択を解除）
};

export function NotionRelation({
  label,
  value,
  onValueChange,
  currentScheduleId,
  placeholder = "関連スケジュールを選択",
  hideSelectedCards = false,
  singleSelect = false,
}: NotionRelationProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // スケジュール一覧を読み込む
  useEffect(() => {
    if (modalVisible) {
      loadSchedules();
    }
  }, [modalVisible]);

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

  const handleToggleSchedule = (scheduleId: number) => {
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
  };

  const handleRemoveSchedule = (scheduleId: number) => {
    onValueChange(value.filter((id) => id !== scheduleId));
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
            <View key={schedule.id} style={styles.cardContainer}>
              <View style={styles.cardContent}>
                {schedule.date && (
                  <Text style={styles.cardDate}>{schedule.date}</Text>
                )}
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {schedule.title}
                </Text>
                <Text style={styles.cardArea} numberOfLines={1}>
                  {schedule.area}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveSchedule(schedule.id)}
                style={styles.removeButton}
              >
                <Text style={styles.removeIcon}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* 選択ボタン */}
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.selectText, selectedSchedules.length === 0 && styles.placeholder]}>
          {selectedSchedules.length > 0
            ? `${selectedSchedules.length}件選択中`
            : placeholder}
        </Text>
        {!label && <Text style={styles.arrow}>▼</Text>}
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
              placeholderTextColor="#9b9a97"
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
                          <Text style={styles.optionSubtitle} numberOfLines={1}>
                            {schedule.area}
                          </Text>
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

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 6,
  },
  selectedContainer: {
    gap: 8,
    marginBottom: 8,
  },
  cardContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    padding: 12,
    gap: 8,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardDate: {
    fontSize: 11,
    color: "#9b9a97",
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#37352f",
    marginBottom: 2,
  },
  cardArea: {
    fontSize: 12,
    color: "#9b9a97",
  },
  removeButton: {
    padding: 4,
  },
  removeIcon: {
    fontSize: 18,
    color: "#9b9a97",
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: 4,
    paddingVertical: 6,
    minHeight: 0,
  },
  selectText: {
    fontSize: 14,
    color: "#787774",
    flex: 1,
  },
  placeholder: {
    color: "#787774",
  },
  arrow: {
    fontSize: 12,
    color: "#787774",
    display: "none",
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
    width: "90%",
    maxWidth: 600,
    maxHeight: "80%",
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#37352f",
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#37352f",
    marginBottom: 16,
  },
  loadingText: {
    textAlign: "center",
    color: "#9b9a97",
    padding: 20,
  },
  optionsList: {
    maxHeight: 400,
  },
  emptyText: {
    textAlign: "center",
    color: "#9b9a97",
    padding: 20,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  optionItemSelected: {
    backgroundColor: "#f7f6f3",
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#37352f",
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 12,
    color: "#9b9a97",
    marginBottom: 2,
  },
  optionDate: {
    fontSize: 11,
    color: "#9b9a97",
  },
  checkmark: {
    fontSize: 18,
    color: "#37352f",
    marginLeft: 12,
  },
  closeButton: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: "#37352f",
    borderRadius: 3,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});

