// Notion風のSelectコンポーネント（項目追加・色設定機能付き）
import React, { useState, useEffect } from "react";
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
import { getDefaultColorForLabel, sortByKanaOrder, sortByOrder } from "../types/select-option";
import { saveSelectOptions, saveStaySelectOptions } from "../utils/select-options-storage";

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
  optionType?: "CATEGORIES" | "AREAS" | "TARGETS" | "SELLERS" | "STATUSES" | "TRANSPORTATIONS" | "WEBSITE"; // 選択肢タイプ（並び替え機能用）
  stayOptionType?: "WEBSITE" | "STATUS"; // Stay用選択肢タイプ（並び替え機能用）
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
  optionType,
  stayOptionType,
}: NotionSelectProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [newOptionText, setNewOptionText] = useState("");
  const [isKanaOrder, setIsKanaOrder] = useState(false); // 五十音順かどうか
  const [displayedOptions, setDisplayedOptions] = useState<SelectOption[]>(options);
  const [isSaving, setIsSaving] = useState(false);
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

  // optionsが変更されたときにdisplayedOptionsを更新
  useEffect(() => {
    setDisplayedOptions(options);
  }, [options]);

  // 五十音順/カスタム順の切り替え
  useEffect(() => {
    if (isKanaOrder) {
      setDisplayedOptions(sortByKanaOrder(options));
    } else {
      setDisplayedOptions(sortByOrder(options));
    }
  }, [isKanaOrder, options]);

  const handleSelect = (optionLabel: string) => {
    onValueChange(optionLabel);
    setModalVisible(false);
  };

  const handleAddNewOption = () => {
    if (newOptionText.trim() && onOptionsChange) {
      // 同じラベルの選択肢が既に存在する場合は追加しない（重複防止）
      if (options.some((opt) => opt.label === newOptionText.trim())) {
        Alert.alert("エラー", "同じ名前の選択肢が既に存在します");
        return;
      }
      
      const newOption: SelectOption = {
        label: newOptionText.trim(),
        // 都道府県の場合はデフォルト色を取得するが、ユーザーが選択した色を使用可能
        // カテゴリ、Transportation、その他もユーザーが選択した色を使用
        color: newOptionColor,
        order: options.length, // 最後に追加
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
      const oldLabel = options[editingOptionIndex].label;
      const updatedOptions = [...options];
      
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
        updatedOptions.splice(editingOptionIndex, 1);
      } else {
        // ラベルが変更された場合
        updatedOptions[editingOptionIndex] = {
          label: newOptionText.trim(),
          color: newOptionColor,
          order: updatedOptions[editingOptionIndex].order,
        };
      }
      
      onOptionsChange(updatedOptions);
      if (value === oldLabel) {
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

  // 並び替えボタンのハンドラー
  const handleMoveUp = (index: number) => {
    if (index === 0 || !onOptionsChange) return;
    const option = displayedOptions[index];
    // displayedOptionsの順序に基づいてoptionsを更新
    const updatedOptions = [...options];
    const originalIndex = updatedOptions.findIndex((opt) => opt.label === option.label);
    if (originalIndex === -1 || originalIndex === 0) return;
    
    const temp = updatedOptions[originalIndex];
    updatedOptions[originalIndex] = updatedOptions[originalIndex - 1];
    updatedOptions[originalIndex - 1] = temp;
    // orderを更新
    updatedOptions.forEach((opt, i) => {
      opt.order = i;
    });
    onOptionsChange(updatedOptions);
  };

  const handleMoveDown = (index: number) => {
    if (index === displayedOptions.length - 1 || !onOptionsChange) return;
    const option = displayedOptions[index];
    // displayedOptionsの順序に基づいてoptionsを更新
    const updatedOptions = [...options];
    const originalIndex = updatedOptions.findIndex((opt) => opt.label === option.label);
    if (originalIndex === -1 || originalIndex === updatedOptions.length - 1) return;
    
    const temp = updatedOptions[originalIndex];
    updatedOptions[originalIndex] = updatedOptions[originalIndex + 1];
    updatedOptions[originalIndex + 1] = temp;
    // orderを更新
    updatedOptions.forEach((opt, i) => {
      opt.order = i;
    });
    onOptionsChange(updatedOptions);
  };

  // 保存ボタンのハンドラー
  const handleSaveOrder = async () => {
    if ((!optionType && !stayOptionType) || !onOptionsChange) return;
    try {
      setIsSaving(true);
      // displayedOptionsの順序に基づいてoptionsを更新
      const updatedOptions = displayedOptions.map((opt, index) => {
        const originalOpt = options.find((o) => o.label === opt.label);
        return {
          ...originalOpt || opt,
          order: index,
        };
      });
      if (stayOptionType) {
        await saveStaySelectOptions(stayOptionType, updatedOptions);
      } else if (optionType) {
        await saveSelectOptions(optionType, updatedOptions);
      }
      Alert.alert("保存完了", "並び順を保存しました");
      onOptionsChange(updatedOptions);
    } catch (error) {
      console.error("Failed to save order:", error);
      Alert.alert("エラー", "並び順の保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedOption = displayedOptions.find((opt) => opt.label === value);

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
            
            {/* 並び替え設定（optionTypeまたはstayOptionTypeが指定されている場合のみ表示） */}
            {(optionType || stayOptionType) && onOptionsChange && (
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
            
            <ScrollView style={styles.optionsList}>
              {displayedOptions.map((option, index) => (
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
                          console.log("Edit button pressed for index:", index);
                          const originalIndex = options.findIndex((opt) => opt.label === option.label);
                          if (originalIndex !== -1) {
                            handleEditOption(originalIndex);
                          }
                        }}
                      >
                        <Text style={styles.editButtonText}>編集</Text>
                      </TouchableOpacity>
                      {!isPrefecture && (
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => {
                            console.log("Delete button pressed for index:", index);
                            const originalIndex = options.findIndex((opt) => opt.label === option.label);
                            if (originalIndex !== -1) {
                              handleDeleteOption(originalIndex);
                            }
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
                <TouchableOpacity
                    style={[
                      styles.addButton,
                      !newOptionText.trim() && styles.addButtonDisabled,
                    ]}
                    onPress={(e) => {
                      // 追加ボタンのクリックでモーダルが閉じないようにする
                      if (e && e.nativeEvent) {
                        e.stopPropagation();
                      }
                      handleAddNewOption();
                    }}
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

