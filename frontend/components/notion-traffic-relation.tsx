// Notion風のTraffic選択コンポーネント
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

type NotionTrafficRelationProps = {
  label: string;
  placeholder?: string;
  currentScheduleId: number;
  value: number[]; // 選択されたTraffic IDの配列
  onValueChange: (trafficIds: number[]) => void;
  hideSelectedCards?: boolean; // 選択されたTrafficのカード表示を非表示にする
};

export function NotionTrafficRelation({
  label,
  placeholder = "既存データにリンク",
  currentScheduleId,
  value,
  onValueChange,
  hideSelectedCards = false,
}: NotionTrafficRelationProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [allTraffics, setAllTraffics] = useState<Traffic[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Traffic一覧を読み込む
  useEffect(() => {
    if (modalVisible) {
      loadTraffics();
    }
  }, [modalVisible]);

  const loadTraffics = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch(getApiUrl("/traffic/all"));
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch traffics:", res.status, errorText);
        setAllTraffics([]);
        return;
      }
      const data: Traffic[] = await res.json();
      console.log("Loaded traffics:", data.length, "items");
      console.log("Current schedule ID:", currentScheduleId);
      // 現在のスケジュールに既に紐づいているTrafficも含める（選択解除できるように）
      // ただし、選択可能なTrafficはすべて表示する
      setAllTraffics(data);
    } catch (error) {
      console.error("Error loading traffics:", error);
      setAllTraffics([]);
    } finally {
      setLoading(false);
    }
  };

  // 検索フィルタリング
  const filteredTraffics = allTraffics.filter((traffic) => {
    if (!searchText.trim()) return true;
    const searchLower = searchText.toLowerCase();
    return (
      traffic.date.toLowerCase().includes(searchLower) ||
      traffic.from.toLowerCase().includes(searchLower) ||
      traffic.to.toLowerCase().includes(searchLower) ||
      (traffic.transportation && traffic.transportation.toLowerCase().includes(searchLower)) ||
      (traffic.notes && traffic.notes.toLowerCase().includes(searchLower)) ||
      traffic.fare.toString().includes(searchText)
    );
  });

  // 選択されたTraffic情報を取得
  const selectedTraffics = allTraffics.filter((t) => value.includes(t.id));

  const handleToggleTraffic = (trafficId: number) => {
    const isSelected = value.includes(trafficId);
    if (isSelected) {
      // 選択解除
      onValueChange(value.filter((id) => id !== trafficId));
    } else {
      // 選択追加
      onValueChange([...value, trafficId]);
    }
  };

  const handleRemoveTraffic = (trafficId: number) => {
    onValueChange(value.filter((id) => id !== trafficId));
  };

  const handleConfirm = () => {
    setModalVisible(false);
    setSearchText("");
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
        </Text>
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
              既存の交通情報を選択
              {selectedTraffics.length > 0 && (
                <Text style={styles.selectedCount}> ({selectedTraffics.length}件選択中)</Text>
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
            ) : filteredTraffics.length === 0 ? (
              <Text style={styles.emptyText}>
                {searchText ? "検索結果がありません" : "既存の交通情報はありません"}
              </Text>
            ) : (
              <ScrollView style={styles.optionsList}>
                {filteredTraffics.map((traffic) => {
                  const detailText = traffic.return_flag
                    ? `${traffic.from} ⇔ ${traffic.to}`
                    : `${traffic.from} → ${traffic.to}`;
                  const detailWithNotes = traffic.notes
                    ? `${detailText} (${traffic.notes})`
                    : detailText;
                  const isSelected = value.includes(traffic.id);

                  return (
                    <TouchableOpacity
                      key={traffic.id}
                      style={[
                        styles.optionItem,
                        isSelected && styles.optionItemSelected,
                      ]}
                      onPress={() => handleToggleTraffic(traffic.id)}
                    >
                      <View style={styles.optionContent}>
                        <Text style={styles.optionDate}>{traffic.date}</Text>
                        <Text style={styles.optionTitle} numberOfLines={1}>
                          {detailWithNotes}
                        </Text>
                        {traffic.transportation && (
                          <Text style={styles.optionSubtitle} numberOfLines={1}>
                            {traffic.transportation}
                          </Text>
                        )}
                        <Text style={styles.optionSubtitle}>
                          ¥{traffic.fare.toLocaleString()}
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
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
    flexDirection: "row",
    alignItems: "center",
  },
  optionItemSelected: {
    backgroundColor: "#f0f0f0",
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionDate: {
    fontSize: 11,
    color: "#9b9a97",
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#37352f",
  },
  optionSubtitle: {
    fontSize: 12,
    color: "#787774",
  },
  checkmark: {
    fontSize: 18,
    color: "#37352f",
    marginLeft: 8,
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

