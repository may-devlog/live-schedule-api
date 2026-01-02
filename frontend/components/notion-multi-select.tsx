// Notion風のマルチセレクトコンポーネント
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import type { SelectOption } from "../types/select-option";
import { getDefaultColorForLabel } from "../types/select-option";
import { NotionTag } from "./notion-tag";
import { ColorPicker } from "./color-picker";

type NotionMultiSelectProps = {
  label: string;
  value: string | null; // カンマ区切りの文字列
  options: SelectOption[];
  onValueChange: (value: string | null) => void;
  onOptionsChange: (options: SelectOption[]) => void;
  placeholder?: string;
  required?: boolean;
  sharedOptionsKey?: string; // 選択肢を共有するキー（例: "TARGETS"）
};

export function NotionMultiSelect({
  label,
  value,
  options,
  onValueChange,
  onOptionsChange,
  placeholder = "選択してください",
  required = false,
  sharedOptionsKey,
}: NotionMultiSelectProps) {
  const [showModal, setShowModal] = useState(false);
  const [tempOptions, setTempOptions] = useState<SelectOption[]>(options);
  const [newOptionText, setNewOptionText] = useState("");
  const [newOptionColor, setNewOptionColor] = useState(getDefaultColorForLabel(""));
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);

  // 選択された値を配列に変換
  const selectedValues = value
    ? value.split(",").map((v) => v.trim()).filter((v) => v)
    : [];

  // 選択されたオプションを取得
  const selectedOptions = tempOptions.filter((opt) =>
    selectedValues.includes(opt.label)
  );

  useEffect(() => {
    setTempOptions(options);
  }, [options]);

  const handleToggleOption = (option: SelectOption) => {
    const isSelected = selectedValues.includes(option.label);
    let newSelectedValues: string[];

    if (isSelected) {
      newSelectedValues = selectedValues.filter((v) => v !== option.label);
    } else {
      newSelectedValues = [...selectedValues, option.label];
    }

    onValueChange(
      newSelectedValues.length > 0 ? newSelectedValues.join(", ") : null
    );
  };

  const handleAddOption = () => {
    if (!newOptionText.trim()) return;

    const trimmed = newOptionText.trim();
    // 既に存在する場合は追加しない
    if (tempOptions.some((opt) => opt.label === trimmed)) {
      setNewOptionText("");
      return;
    }

    const newOption: SelectOption = {
      label: trimmed,
      color: newOptionColor,
    };

    const updatedOptions = [...tempOptions, newOption];
    setTempOptions(updatedOptions);
    onOptionsChange(updatedOptions);
    setNewOptionText("");
    setNewOptionColor(getDefaultColorForLabel(""));

    // 新しいオプションを自動的に選択
    const newSelectedValues = [...selectedValues, trimmed];
    onValueChange(newSelectedValues.join(", "));
  };

  const handleEditOption = (option: SelectOption) => {
    const index = tempOptions.findIndex((opt) => opt.label === option.label);
    if (index === -1) return;
    
    setEditingOptionIndex(index);
    setNewOptionText(option.label);
    setNewOptionColor(option.color || getDefaultColorForLabel(option.label));
    setShowColorPicker(false);
  };

  const handleUpdateOption = () => {
    if (
      editingOptionIndex !== null &&
      newOptionText.trim() &&
      onOptionsChange
    ) {
      const updatedOptions = [...tempOptions];
      const oldLabel = updatedOptions[editingOptionIndex].label;
      updatedOptions[editingOptionIndex] = {
        label: newOptionText.trim(),
        color: newOptionColor,
      };
      setTempOptions(updatedOptions);
      onOptionsChange(updatedOptions);
      
      // 選択されていた場合は選択も更新
      if (selectedValues.includes(oldLabel)) {
        const newSelectedValues = selectedValues.map((v) => 
          v === oldLabel ? newOptionText.trim() : v
        );
        onValueChange(newSelectedValues.join(", "));
      }
      
      setEditingOptionIndex(null);
      setNewOptionText("");
      setNewOptionColor(getDefaultColorForLabel(""));
    }
  };

  const handleRemoveOption = (option: SelectOption) => {
    console.log("handleRemoveOption called for:", option.label);
    // 確認ダイアログを表示
    const confirmDelete = () => {
      console.log("Delete confirmed for:", option.label);
      const updatedOptions = tempOptions.filter((opt) => opt.label !== option.label);
      setTempOptions(updatedOptions);
      onOptionsChange(updatedOptions);

      // 選択されていた場合は選択からも削除
      if (selectedValues.includes(option.label)) {
        const newSelectedValues = selectedValues.filter((v) => v !== option.label);
        onValueChange(
          newSelectedValues.length > 0 ? newSelectedValues.join(", ") : null
        );
      }
    };
    
    if (Platform.OS === "web") {
      if (window.confirm(`「${option.label}」を削除してもよろしいですか？`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "選択肢を削除",
        `「${option.label}」を削除してもよろしいですか？`,
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

  const handleConfirm = () => {
    onOptionsChange(tempOptions);
    setShowModal(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => setShowModal(true)}
      >
        <View style={styles.selectedContainer}>
          {selectedOptions.length === 0 ? (
            <Text style={[styles.selectText, styles.placeholder]}>
              {placeholder}
            </Text>
          ) : (
            <View style={styles.tagsContainer}>
              {selectedOptions.map((opt) => (
                <View key={opt.label} style={[styles.tag, { backgroundColor: opt.color }]}>
                  <Text style={styles.tagText}>{opt.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {value && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            style={styles.clearIcon}
          >
            <Text style={styles.clearIconText}>×</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View 
            style={styles.modalContent} 
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>{label}</Text>

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
                      setNewOptionColor(getDefaultColorForLabel(""));
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
                    onPress={handleAddOption}
                    disabled={!newOptionText.trim()}
                  >
                    <Text style={styles.addButtonText}>追加</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {/* オプション一覧 */}
            <ScrollView style={styles.optionsList}>
              {tempOptions.map((option) => {
                const isSelected = selectedValues.includes(option.label);
                return (
                  <View
                    key={option.label}
                    style={styles.optionRow}
                  >
                    <TouchableOpacity
                      style={[
                        styles.optionItem,
                        isSelected && styles.optionItemSelected,
                      ]}
                      onPress={() => handleToggleOption(option)}
                    >
                      <NotionTag
                        label={option.label}
                        color={option.color}
                      />
                      {isSelected && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </TouchableOpacity>
                    {onOptionsChange && (
                      <View style={styles.optionActions}>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => {
                            console.log("Edit button pressed for:", option.label);
                            handleEditOption(option);
                          }}
                        >
                          <Text style={styles.editButtonText}>編集</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => {
                            console.log("Delete button pressed for:", option.label);
                            handleRemoveOption(option);
                          }}
                        >
                          <Text style={styles.deleteButtonText}>削除</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setTempOptions(options);
                  setShowModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>決定</Text>
              </TouchableOpacity>
            </View>
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
  selectedContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  selectText: {
    fontSize: 14,
    color: "#37352f",
  },
  placeholder: {
    color: "#9b9a97",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    marginRight: 4,
  },
  tagText: {
    fontSize: 12,
    color: "#37352f",
    fontWeight: "500",
  },
  clearIcon: {
    marginLeft: 8,
    padding: 4,
  },
  clearIconText: {
    fontSize: 18,
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
    maxWidth: 500,
    maxHeight: "80%",
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
    marginBottom: 16,
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
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    marginRight: 8,
    borderRadius: 3,
    backgroundColor: "#f7f6f3",
  },
  cancelButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "500",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    marginLeft: 8,
    borderRadius: 3,
    backgroundColor: "#37352f",
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
});

