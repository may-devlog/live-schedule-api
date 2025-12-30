// Notion風のSelectコンポーネント（項目追加・色設定機能付き）
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { NotionTag } from "./notion-tag";
import { ColorPicker } from "./color-picker";
import type { SelectOption } from "../types/select-option";
import { getDefaultColorForLabel } from "../types/select-option";

type NotionSelectProps = {
  label: string;
  value?: string | null;
  options: SelectOption[];
  onValueChange: (value: string | null) => void;
  onOptionsChange?: (options: SelectOption[]) => void;
  placeholder?: string;
  required?: boolean;
  isPrefecture?: boolean; // 都道府県選択肢かどうか
  isCategory?: boolean; // カテゴリ選択肢かどうか
  isTransportation?: boolean; // 交通手段選択肢かどうか（背景色を統一で薄いグレーに）
};

export function NotionSelect({
  label,
  value,
  options,
  onValueChange,
  onOptionsChange,
  placeholder = "選択してください",
  required = false,
  isPrefecture = false,
  isCategory = false,
  isTransportation = false,
}: NotionSelectProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [newOptionText, setNewOptionText] = useState("");
  // カテゴリの場合はデフォルト色を取得、それ以外は空文字列から取得
  // Transportationの場合はデフォルトで薄いグレー
  const getInitialColor = () => {
    if (isCategory) {
      return getDefaultColorForLabel("", false, true);
    }
    if (isTransportation) {
      return "#E5E7EB"; // 薄いグレー（デフォルト）
    }
    return getDefaultColorForLabel("", isPrefecture, false);
  };
  const [newOptionColor, setNewOptionColor] = useState(getInitialColor());
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(
    null
  );

  const handleSelect = (optionLabel: string) => {
    onValueChange(optionLabel);
    setModalVisible(false);
  };

  const handleAddNewOption = () => {
    if (newOptionText.trim() && onOptionsChange) {
      const newOption: SelectOption = {
        label: newOptionText.trim(),
        // 都道府県の場合はデフォルト色を取得するが、ユーザーが選択した色を使用可能
        // カテゴリ、Transportation、その他もユーザーが選択した色を使用
        color: newOptionColor,
      };
      onOptionsChange([...options, newOption]);
      onValueChange(newOptionText.trim());
      setNewOptionText("");
      // カテゴリの場合はデフォルト色を取得、それ以外は空文字列から取得
      const defaultColor = isCategory
        ? getDefaultColorForLabel("", false, true)
        : getDefaultColorForLabel("", isPrefecture, false);
      setNewOptionColor(defaultColor);
      setModalVisible(false);
    }
  };

  const handleEditOption = (index: number) => {
    setEditingOptionIndex(index);
    setNewOptionText(options[index].label);
    // 既存の色がある場合はそれを使用、ない場合はデフォルト色を取得
    const existingColor = options[index].color;
    if (existingColor) {
      setNewOptionColor(existingColor);
    } else {
      // カテゴリの場合はカテゴリ用のデフォルト色、それ以外は通常のデフォルト色
      const defaultColor = isCategory
        ? getDefaultColorForLabel(options[index].label, false, true)
        : getDefaultColorForLabel(options[index].label, isPrefecture, false);
      setNewOptionColor(defaultColor);
    }
    setShowColorPicker(false);
  };

  const handleUpdateOption = () => {
    if (
      editingOptionIndex !== null &&
      newOptionText.trim() &&
      onOptionsChange
    ) {
      const updatedOptions = [...options];
      updatedOptions[editingOptionIndex] = {
        label: newOptionText.trim(),
        // 都道府県、カテゴリ、Transportation、その他すべてでユーザーが選択した色を使用
        color: newOptionColor,
      };
      onOptionsChange(updatedOptions);
      if (value === options[editingOptionIndex].label) {
        onValueChange(newOptionText.trim());
      }
      setEditingOptionIndex(null);
      setNewOptionText("");
      // カテゴリの場合はデフォルト色を取得、それ以外は空文字列から取得
      // Transportationの場合はデフォルトで薄いグレー
      const defaultColor = isCategory
        ? getDefaultColorForLabel("", false, true)
        : isTransportation
        ? "#E5E7EB" // 薄いグレー（デフォルト）
        : getDefaultColorForLabel("", isPrefecture, false);
      setNewOptionColor(defaultColor);
    }
  };

  const handleDeleteOption = (index: number) => {
    console.log("handleDeleteOption called for index:", index);
    // 都道府県は削除不可
    if (isPrefecture) {
      return;
    }
    
    const deletedOption = options[index];
    if (!deletedOption) {
      console.error("Option not found at index:", index);
      return;
    }
    
    console.log("Deleting option:", deletedOption.label);
    // 確認ダイアログを表示
    const confirmDelete = () => {
      console.log("Delete confirmed for:", deletedOption.label);
      if (onOptionsChange) {
        const updatedOptions = options.filter((_, i) => i !== index);
        onOptionsChange(updatedOptions);
        if (value === deletedOption.label) {
          onValueChange(null);
        }
      }
    };
    
    if (Platform.OS === "web") {
      if (window.confirm(`「${deletedOption.label}」を削除してもよろしいですか？`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "選択肢を削除",
        `「${deletedOption.label}」を削除してもよろしいですか？`,
        [
          {
            text: "キャンセル",
            style: "cancel",
            onPress: () => {
              console.log("Delete cancelled");
            },
          },
          {
            text: "削除",
            style: "destructive",
            onPress: confirmDelete,
          },
        ]
      );
    }
  };

  const handleClear = () => {
    onValueChange(null);
  };

  const selectedOption = options.find((opt) => opt.label === value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => setModalVisible(true)}
      >
        {selectedOption ? (
          <View style={styles.selectedValueContainer}>
            <NotionTag
              label={selectedOption.label}
              color={selectedOption.color}
            />
          </View>
        ) : (
          <Text style={[styles.selectText, styles.placeholder]}>
            {placeholder}
          </Text>
        )}
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>

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
          >
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={styles.optionsList}>
              {options.map((option, index) => (
                <View key={index} style={styles.optionRow}>
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      value === option.label && styles.optionItemSelected,
                    ]}
                    onPress={() => handleSelect(option.label)}
                  >
                    <NotionTag
                      label={option.label}
                      color={option.color}
                    />
                    {value === option.label && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                  {onOptionsChange && (
                    <View style={styles.optionActions}>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => {
                          console.log("Edit button pressed for index:", index);
                          handleEditOption(index);
                        }}
                      >
                        <Text style={styles.editButtonText}>編集</Text>
                      </TouchableOpacity>
                      {!isPrefecture && (
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => {
                            console.log("Delete button pressed for index:", index);
                            handleDeleteOption(index);
                          }}
                        >
                          <Text style={styles.deleteButtonText}>削除</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>

            {editingOptionIndex !== null ? (
              <View style={styles.editOptionContainer}>
                <Text style={styles.sectionTitle}>選択肢を編集</Text>
                <TextInput
                  style={styles.addOptionInput}
                  value={newOptionText}
                  onChangeText={setNewOptionText}
                  placeholder="選択肢名"
                  placeholderTextColor="#9b9a97"
                />
                <ColorPicker
                  value={newOptionColor}
                  onValueChange={setNewOptionColor}
                  label="色"
                />
                {isPrefecture && (
                  <Text style={styles.infoText}>
                    都道府県の色をカスタマイズできます（地方ごとのデフォルト色が設定されています）
                  </Text>
                )}
                {isCategory && (
                  <Text style={styles.infoText}>
                    カテゴリの色をカスタマイズできます（デフォルト色が設定されています）
                  </Text>
                )}
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[
                      styles.updateButton,
                      !newOptionText.trim() && styles.updateButtonDisabled,
                    ]}
                    onPress={handleUpdateOption}
                    disabled={!newOptionText.trim()}
                  >
                    <Text style={styles.updateButtonText}>更新</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setEditingOptionIndex(null);
                      setNewOptionText("");
                      // カテゴリの場合はデフォルト色を取得、それ以外は空文字列から取得
                      // Transportationの場合はデフォルトで薄いグレー
                      const defaultColor = isCategory
                        ? getDefaultColorForLabel("", false, true)
                        : isTransportation
                        ? "#E5E7EB" // 薄いグレー（デフォルト）
                        : getDefaultColorForLabel("", isPrefecture, false);
                      setNewOptionColor(defaultColor);
                    }}
                  >
                    <Text style={styles.cancelButtonText}>キャンセル</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              onOptionsChange && (
                <View style={styles.addOptionContainer}>
                  <Text style={styles.sectionTitle}>新しい選択肢を追加</Text>
                  <TextInput
                    style={styles.addOptionInput}
                    value={newOptionText}
                    onChangeText={setNewOptionText}
                  placeholder="選択肢名"
                  placeholderTextColor="#9b9a97"
                />
                  <ColorPicker
                    value={newOptionColor}
                    onValueChange={setNewOptionColor}
                    label="色"
                  />
                <TouchableOpacity
                    style={[
                      styles.addButton,
                      !newOptionText.trim() && styles.addButtonDisabled,
                    ]}
                    onPress={handleAddNewOption}
                    disabled={!newOptionText.trim()}
                  >
                    <Text style={styles.addButtonText}>追加</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {value && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => {
                  handleClear();
                  setModalVisible(false);
                }}
              >
                <Text style={styles.clearButtonText}>クリア</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setModalVisible(false);
                setEditingOptionIndex(null);
                setNewOptionText("");
                // カテゴリの場合はデフォルト色を取得、それ以外は空文字列から取得
                // Transportationの場合はデフォルトで薄いグレー
                const defaultColor = isCategory
                  ? getDefaultColorForLabel("", false, true)
                  : isTransportation
                  ? "#E5E7EB" // 薄いグレー（デフォルト）
                  : getDefaultColorForLabel("", isPrefecture, false);
                setNewOptionColor(defaultColor);
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
  required: {
    color: "#d93025",
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
  },
  selectedValueContainer: {
    flex: 1,
  },
  selectText: {
    fontSize: 14,
    color: "#37352f",
    flex: 1,
  },
  placeholder: {
    color: "#9b9a97",
  },
  arrow: {
    fontSize: 10,
    color: "#787774",
    marginLeft: 8,
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
    width: "85%",
    maxWidth: 450,
    maxHeight: "75%",
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 16,
  },
  optionsList: {
    maxHeight: 300,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 3,
  },
  optionItemSelected: {
    backgroundColor: "#f1f1ef",
  },
  checkmark: {
    fontSize: 16,
    color: "#37352f",
    marginLeft: 8,
  },
  optionActions: {
    flexDirection: "row",
    marginLeft: 8,
  },
  editButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
  },
  editButtonText: {
    fontSize: 12,
    color: "#3B82F6",
  },
  deleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteButtonText: {
    fontSize: 12,
    color: "#d93025",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#787774",
    marginBottom: 8,
  },
  addOptionContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e9e9e7",
  },
  editOptionContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e9e9e7",
  },
  addOptionInput: {
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#37352f",
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: "#37352f",
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  editActions: {
    flexDirection: "row",
    gap: 8,
  },
  updateButton: {
    flex: 1,
    backgroundColor: "#37352f",
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  updateButtonDisabled: {
    opacity: 0.5,
  },
  updateButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f7f6f3",
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "500",
  },
  clearButton: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  clearButtonText: {
    color: "#d93025",
    fontSize: 14,
  },
  closeButton: {
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: "#f7f6f3",
    borderRadius: 3,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "500",
  },
  infoText: {
    fontSize: 12,
    color: "#787774",
    fontStyle: "italic",
    marginTop: 8,
  },
});

