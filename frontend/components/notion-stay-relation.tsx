// Notion風のStay選択コンポーネント
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
} from "react-native";
import { authenticatedFetch, getApiUrl } from "../utils/api";

type Stay = {
  id: number;
  schedule_id: number;
  check_in: string;
  check_out: string;
  hotel_name: string;
  fee: number;
  breakfast_flag: boolean;
  deadline?: string | null;
  penalty?: number | null;
  status: string;
};

type NotionStayRelationProps = {
  label: string;
  placeholder?: string;
  currentScheduleId: number;
  value: number[]; // 選択されたStay IDの配列
  onValueChange: (stayIds: number[]) => void;
  hideSelectedCards?: boolean; // 選択されたStayのカード表示を非表示にする
};

export function NotionStayRelation({
  label,
  placeholder = "既存データにリンク",
  currentScheduleId,
  value,
  onValueChange,
  hideSelectedCards = false,
}: NotionStayRelationProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [allStays, setAllStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Stay一覧を読み込む
  useEffect(() => {
    if (modalVisible) {
      loadStays();
    }
  }, [modalVisible, currentScheduleId]);

  const loadStays = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch(getApiUrl("/stay/all"));
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch stays:", res.status, errorText);
        setAllStays([]);
        return;
      }
      const data: Stay[] = await res.json();
      console.log("Loaded stays:", data.length, "items");
      console.log("Current schedule ID:", currentScheduleId);
      // 現在のスケジュールに既に紐づいているStayも含める（選択解除できるように）
      setAllStays(data);
    } catch (error) {
      console.error("Error loading stays:", error);
      setAllStays([]);
    } finally {
      setLoading(false);
    }
  };

  // 検索フィルタリング
  const filteredStays = allStays.filter((stay) => {
    if (!searchText.trim()) return true;
    const searchLower = searchText.toLowerCase();
    return (
      stay.hotel_name.toLowerCase().includes(searchLower) ||
      stay.check_in.toLowerCase().includes(searchLower) ||
      stay.check_out.toLowerCase().includes(searchLower) ||
      stay.fee.toString().includes(searchText) ||
      stay.status.toLowerCase().includes(searchLower)
    );
  });

  // 選択されたStay情報を取得
  const selectedStays = allStays.filter((s) => value.includes(s.id));

  const handleToggleStay = (stayId: number) => {
    const isSelected = value.includes(stayId);
    if (isSelected) {
      // 選択解除
      onValueChange(value.filter((id) => id !== stayId));
    } else {
      // 選択追加
      onValueChange([...value, stayId]);
    }
  };

  const handleRemoveStay = (stayId: number) => {
    onValueChange(value.filter((id) => id !== stayId));
  };

  const handleConfirm = () => {
    setModalVisible(false);
    setSearchText("");
  };

  const formatDateTime = (dateTimeStr: string) => {
    return dateTimeStr.replace(/-/g, "/");
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
        </Text>
      )}

      {/* 選択されたStayをカード表示 */}
      {!hideSelectedCards && selectedStays.length > 0 && (
        <View style={styles.selectedContainer}>
          {selectedStays.map((stay) => {
            const checkInFormatted = formatDateTime(stay.check_in);
            const checkOutFormatted = formatDateTime(stay.check_out);
            const dateTimeText = `${checkInFormatted} → ${checkOutFormatted}`;

            return (
              <View key={stay.id} style={styles.cardContainer}>
                <View style={styles.cardContent}>
                  <Text style={styles.cardDateTime}>{dateTimeText}</Text>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {stay.hotel_name}
                  </Text>
                  <Text style={styles.cardFee}>¥{stay.fee.toLocaleString()}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveStay(stay.id)}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeIcon}>×</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* 選択ボタン */}
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.selectText, styles.placeholder]}>
          {placeholder}
        </Text>
      </TouchableOpacity>

      {/* モーダル */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              既存の宿泊情報を選択
              {selectedStays.length > 0 && (
                <Text style={styles.selectedCount}> ({selectedStays.length}件選択中)</Text>
              )}
            </Text>

            {/* 検索バー */}
            <View
              onStartShouldSetResponder={() => true}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="検索..."
                placeholderTextColor="#9b9a97"
                onFocus={() => {}}
                onBlur={() => {}}
              />
            </View>

            {loading ? (
              <Text style={styles.loadingText}>読み込み中...</Text>
            ) : filteredStays.length === 0 ? (
              <Text style={styles.emptyText}>
                {searchText ? "検索結果がありません" : "既存の宿泊情報がありません"}
              </Text>
            ) : (
              <ScrollView style={styles.optionsList}>
                {filteredStays.map((stay) => {
                  const checkInFormatted = formatDateTime(stay.check_in);
                  const checkOutFormatted = formatDateTime(stay.check_out);
                  const dateTimeText = `${checkInFormatted} → ${checkOutFormatted}`;
                  const isSelected = value.includes(stay.id);

                  return (
                    <TouchableOpacity
                      key={stay.id}
                      style={[
                        styles.optionItem,
                        isSelected && styles.optionItemSelected,
                      ]}
                      onPress={() => handleToggleStay(stay.id)}
                    >
                      <View style={styles.optionContent}>
                        <Text style={styles.optionDate}>{dateTimeText}</Text>
                        <Text style={styles.optionTitle} numberOfLines={1}>
                          {stay.hotel_name}
                        </Text>
                        <Text style={styles.optionSubtitle}>
                          ¥{stay.fee.toLocaleString()}
                        </Text>
                      </View>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleConfirm}
            >
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  cardDateTime: {
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
  cardFee: {
    fontSize: 12,
    color: "#787774",
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
  selectedCount: {
    fontSize: 18,
    fontWeight: "400",
    color: "#787774",
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
  emptyText: {
    textAlign: "center",
    color: "#9b9a97",
    padding: 20,
  },
  optionsList: {
    maxHeight: 400,
    marginBottom: 16,
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
  optionDate: {
    fontSize: 11,
    color: "#9b9a97",
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
  checkmark: {
    fontSize: 18,
    color: "#37352f",
    marginLeft: 12,
  },
  closeButton: {
    backgroundColor: "#f7f6f3",
    padding: 12,
    borderRadius: 3,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
  },
});

