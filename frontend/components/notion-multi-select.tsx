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
import { getDefaultColorForLabel, sortByKanaOrder, sortByOrder } from "../types/select-option";
import { NotionTag } from "./notion-tag";
import { ColorPicker } from "./color-picker";
import { saveSelectOptions } from "../utils/select-options-storage";

type NotionMultiSelectProps = {
  label: string;
  value: string | null; // カンマ区切りの文字列
  options: SelectOption[];
  onValueChange: (value: string | null) => void;
  onOptionsChange: (options: SelectOption[]) => void;
  placeholder?: string;
  required?: boolean;
  sharedOptionsKey?: string; // 選択肢を共有するキー（例: "TARGETS"）
  optionType?: "TARGETS"; // 選択肢タイプ（並び替え機能用）
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
  optionType,
}: NotionMultiSelectProps) {
  const [showModal, setShowModal] = useState(false);
  const [tempOptions, setTempOptions] = useState<SelectOption[]>(options);
  const [newOptionText, setNewOptionText] = useState("");
  const [newOptionColor, setNewOptionColor] = useState(getDefaultColorForLabel(""));
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);
  const [isKanaOrder, setIsKanaOrder] = useState(false); // 五十音順かどうか
  const [displayedOptions, setDisplayedOptions] = useState<SelectOption[]>(options);
  const [isSaving, setIsSaving] = useState(false);

  // 選択された値を配列に変換（選択順を保持）
  const selectedValues = value
    ? value.split(",").map((v) => v.trim()).filter((v) => v)
    : [];

  // 選択されたオプションを取得（選択順を保持）
  const selectedOptions = selectedValues
    .map((label) => tempOptions.find((opt) => opt.label === label))
    .filter((opt): opt is SelectOption => opt !== undefined);

  useEffect(() => {
    setTempOptions(options);
    setDisplayedOptions(options);
  }, [options]);

  // 五十音順/カスタム順の切り替え
  useEffect(() => {
    if (isKanaOrder) {
      setDisplayedOptions(sortByKanaOrder(tempOptions));
    } else {
      setDisplayedOptions(sortByOrder(tempOptions));
    }
  }, [isKanaOrder, tempOptions]);

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
    // 既に存在する場合は追加しない（重複防止）
    if (tempOptions.some((opt) => opt.label === trimmed)) {
      Alert.alert("エラー", "同じ名前の選択肢が既に存在します");
      return;
    }

    const newOption: SelectOption = {
      label: trimmed,
      color: newOptionColor,
      order: tempOptions.length, // 最後に追加
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
    const index = displayedOptions.findIndex((opt) => opt.label === option.label);
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
      const oldLabel = displayedOptions[editingOptionIndex].label;
      const originalIndex = tempOptions.findIndex((opt) => opt.label === oldLabel);
      if (originalIndex === -1) return;
      
      const updatedOptions = [...tempOptions];
      
      // 同じラベルの選択肢が既に存在する場合は、その選択肢を更新（重複防止）
      const existingIndex = updatedOptions.findIndex(
        (opt) => opt.label === newOptionText.trim() && opt.label !== oldLabel
      );
      
      if (existingIndex !== -1) {
        // 既存の選択肢を更新（色のみ変更の場合）
        updatedOptions[existingIndex] = {
          ...updatedOptions[existingIndex],
          color: newOptionColor,
        };
        // 元の選択肢を削除
        updatedOptions.splice(originalIndex, 1);
      } else {
        // ラベルが変更された場合
        updatedOptions[originalIndex] = {
          label: newOptionText.trim(),
          color: newOptionColor,
          order: updatedOptions[originalIndex].order,
        };
      }
      
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

  // 並び替えボタンのハンドラー
  const handleMoveUp = (index: number) => {
    if (index === 0 || !onOptionsChange) return;
    const option = displayedOptions[index];
    const updatedOptions = [...tempOptions];
    const originalIndex = updatedOptions.findIndex((opt) => opt.label === option.label);
    if (originalIndex === -1 || originalIndex === 0) return;
    
    const temp = updatedOptions[originalIndex];
    updatedOptions[originalIndex] = updatedOptions[originalIndex - 1];
    updatedOptions[originalIndex - 1] = temp;
    // orderを更新
    updatedOptions.forEach((opt, i) => {
      opt.order = i;
    });
    setTempOptions(updatedOptions);
    onOptionsChange(updatedOptions);
  };

  const handleMoveDown = (index: number) => {
    if (index === displayedOptions.length - 1 || !onOptionsChange) return;
    const option = displayedOptions[index];
    const updatedOptions = [...tempOptions];
    const originalIndex = updatedOptions.findIndex((opt) => opt.label === option.label);
    if (originalIndex === -1 || originalIndex === updatedOptions.length - 1) return;
    
    const temp = updatedOptions[originalIndex];
    updatedOptions[originalIndex] = updatedOptions[originalIndex + 1];
    updatedOptions[originalIndex + 1] = temp;
    // orderを更新
    updatedOptions.forEach((opt, i) => {
      opt.order = i;
    });
    setTempOptions(updatedOptions);
    onOptionsChange(updatedOptions);
  };

  // 保存ボタンのハンドラー
  const handleSaveOrder = async () => {
    if (!optionType || !onOptionsChange) return;
    try {
      setIsSaving(true);
      // displayedOptionsの順序に基づいてoptionsを更新
      const updatedOptions = displayedOptions.map((opt, index) => {
        const originalOpt = tempOptions.find((o) => o.label === opt.label);
        return {
          ...originalOpt || opt,
          order: index,
        };
      });
      await saveSelectOptions(optionType, updatedOptions);
      Alert.alert("保存完了", "並び順を保存しました");
      setTempOptions(updatedOptions);
      onOptionsChange(updatedOptions);
    } catch (error) {
      console.error("Failed to save order:", error);
      Alert.alert("エラー", "並び順の保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
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
            
            {/* 並び替え設定（optionTypeが指定されている場合のみ表示） */}
            {optionType && onOptionsChange && (
              <View style={styles.sortContainer}>
                <View style={styles.sortToggle}>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => setIsKanaOrder(!isKanaOrder)}
                  >
                    <Text style={styles.checkboxText}>
                      {isKanaOrder ? "☑" : "☐"} 五十音順
                    </Text>
                  </TouchableOpacity>
                  {!isKanaOrder && (
                    <TouchableOpacity
                      style={styles.saveButton}
                      onPress={handleSaveOrder}
                      disabled={isSaving}
                    >
                      <Text style={styles.saveButtonText}>
                        {isSaving ? "保存中..." : "保存"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {editingOptionIndex !== null ? (
              <View style={styles.editOptionContainer}>
                <Text style={styles.sectionTitle}>選択肢を編集</Text>
                <TextInput
                  style={styles.addOptionInput}
                  value={newOptionText}
                  onChangeText={setNewOptionText}
                  placeholder="選択肢名"
                  placeholderTextColor="#9b9a97"
                  onFocus={(e) => {
                    // フォーカス時にイベント伝播を停止
                    if (e && e.nativeEvent) {
                      e.stopPropagation();
                    }
                  }}
                  onTouchStart={(e) => {
                    // タッチ開始時にイベント伝播を停止
                    if (e && e.nativeEvent) {
                      e.stopPropagation();
                    }
                  }}
                />
                <View
                  onTouchStart={(e) => {
                    // ColorPickerのタッチでモーダルが閉じないようにする
                    if (e && e.nativeEvent) {
                      e.stopPropagation();
                    }
                  }}
                >
                  <ColorPicker
                    value={newOptionColor}
                    onValueChange={setNewOptionColor}
                    label="色"
                  />
                </View>
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[
                      styles.updateButton,
                      !newOptionText.trim() && styles.updateButtonDisabled,
                    ]}
                    onPress={(e) => {
                      // 更新ボタンのクリックでモーダルが閉じないようにする
                      if (e && e.nativeEvent) {
                        e.stopPropagation();
                      }
                      handleUpdateOption();
                    }}
                    disabled={!newOptionText.trim()}
                  >
                    <Text style={styles.updateButtonText}>更新</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={(e) => {
                      // キャンセルボタンのクリックでモーダルが閉じないようにする
                      if (e && e.nativeEvent) {
                        e.stopPropagation();
                      }
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
              {displayedOptions.map((option, index) => {
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
                        {optionType && !isKanaOrder && (
                          <View style={styles.sortButtons}>
                            <TouchableOpacity
                              style={[styles.sortButton, index === 0 && styles.sortButtonDisabled]}
                              onPress={() => handleMoveUp(index)}
                              disabled={index === 0}
                            >
                              <Text style={styles.sortButtonText}>↑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.sortButton, index === displayedOptions.length - 1 && styles.sortButtonDisabled]}
                              onPress={() => handleMoveDown(index)}
                              disabled={index === displayedOptions.length - 1}
                            >
                              <Text style={styles.sortButtonText}>↓</Text>
                            </TouchableOpacity>
                          </View>
                        )}
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
  sortContainer: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  sortToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkboxText: {
    fontSize: 14,
    color: "#37352f",
  },
  saveButton: {
    backgroundColor: "#37352f",
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "500",
  },
  sortButtons: {
    flexDirection: "row",
    marginRight: 4,
  },
  sortButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginRight: 2,
    backgroundColor: "#f7f6f3",
    borderRadius: 3,
  },
  sortButtonDisabled: {
    opacity: 0.3,
  },
  sortButtonText: {
    fontSize: 12,
    color: "#37352f",
  },
});

