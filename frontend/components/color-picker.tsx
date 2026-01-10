// カラーピッカーコンポーネント
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ScrollView,
} from "react-native";
// DEFAULT_COLORSを直接定義して循環依存を回避
const DEFAULT_COLORS = [
  "#FEE2E2", "#FEF3C7", "#D1FAE5", "#DBEAFE", "#E9D5FF", "#FCE7F3",
  "#E5E7EB", "#FED7AA", "#ECFCCB", "#CCFBF1", "#E0E7FF", "#F3E8FF",
];

type ColorPickerProps = {
  value?: string;
  onValueChange: (color: string) => void;
  label?: string;
  inline?: boolean; // 親モーダル内で使用する場合はtrue（インライン表示）
};

export function ColorPicker({
  value,
  onValueChange,
  label = "色を選択",
  inline = false,
}: ColorPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [showInlinePicker, setShowInlinePicker] = useState(false);
  const [customColor, setCustomColor] = useState(value || "#3B82F6");

  // valueが変更されたときにcustomColorも更新
  useEffect(() => {
    if (value) {
      setCustomColor(value);
    }
  }, [value]);

  const handleColorSelect = (color: string) => {
    onValueChange(color);
    setModalVisible(false);
    setShowInlinePicker(false);
  };

  // 3桁のカラーコードを6桁に変換（#RGB → #RRGGBB）
  const expandColorCode = (color: string): string => {
    if (color.length === 4 && color.startsWith("#")) {
      // #RGB形式を#RRGGBB形式に変換
      const r = color[1];
      const g = color[2];
      const b = color[3];
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return color.toUpperCase();
  };

  const handleCustomColorSubmit = () => {
    if (isValidColor(customColor)) {
      // 3桁の場合は6桁に変換
      const expandedColor = expandColorCode(customColor);
      onValueChange(expandedColor);
      setModalVisible(false);
      setShowInlinePicker(false);
    }
  };

  const isValidColor = (color: string): boolean => {
    // カラーコードのバリデーション（#RGBまたは#RRGGBB形式）
    return /^#[0-9A-Fa-f]{3}$/.test(color) || /^#[0-9A-Fa-f]{6}$/.test(color);
  };

  // インライン表示用のコンテンツ
  const renderPickerContent = () => (
    <View>
      <Text style={styles.modalTitle}>色を選択</Text>

      <ScrollView style={styles.colorsList}>
        <Text style={styles.sectionTitle}>プリセット色</Text>
        <View style={styles.colorGrid}>
          {DEFAULT_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorOption,
                { backgroundColor: color },
                value === color && styles.colorOptionSelected,
              ]}
              onPress={(e) => {
                if (e && e.nativeEvent) {
                  e.stopPropagation();
                }
                handleColorSelect(color);
              }}
            >
              {value === color && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>カスタム色</Text>
        <View style={styles.customColorContainer}>
          <TouchableOpacity
            style={[
              styles.colorPreviewLarge,
              {
                backgroundColor: isValidColor(customColor)
                  ? customColor
                  : "#E5E7EB",
              },
            ]}
            onPress={(e) => {
              if (e && e.nativeEvent) {
                e.stopPropagation();
              }
              // 色見本をクリックしたときにカラーピッカーを表示
              if (inline) {
                setShowInlinePicker(true);
              } else {
                setModalVisible(true);
              }
            }}
          />
          <TextInput
            style={[
              styles.colorInput,
              !isValidColor(customColor) && styles.colorInputError,
            ]}
            value={customColor}
            onChangeText={setCustomColor}
            placeholder="#RGB または #RRGGBB"
            placeholderTextColor="#9b9a97"
            maxLength={7}
            autoCapitalize="none"
            onFocus={(e) => {
              if (e && e.nativeEvent) {
                e.stopPropagation();
              }
            }}
            onTouchStart={(e) => {
              if (e && e.nativeEvent) {
                e.stopPropagation();
              }
            }}
          />
          <TouchableOpacity
            style={[
              styles.submitButton,
              !isValidColor(customColor) && styles.submitButtonDisabled,
            ]}
            onPress={(e) => {
              if (e && e.nativeEvent) {
                e.stopPropagation();
              }
              handleCustomColorSubmit();
            }}
            disabled={!isValidColor(customColor)}
          >
            <Text style={styles.submitButtonText}>適用</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {inline && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setShowInlinePicker(false)}
        >
          <Text style={styles.closeButtonText}>閉じる</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={styles.colorButton}
        onPress={() => {
          if (inline) {
            setShowInlinePicker(true);
          } else {
            setModalVisible(true);
          }
        }}
      >
        <View
          style={[
            styles.colorPreview,
            { backgroundColor: value || "#3B82F6" },
          ]}
        />
        <Text style={styles.colorText}>{value || "#3B82F6"}</Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>

      {/* インライン表示（親モーダル内で使用する場合） */}
      {inline && showInlinePicker && (
        <View
          style={styles.inlinePickerContainer}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onTouchStart={(e) => {
            if (e && e.nativeEvent) {
              e.stopPropagation();
            }
          }}
          onTouchEnd={(e) => {
            if (e && e.nativeEvent) {
              e.stopPropagation();
            }
          }}
        >
          {renderPickerContent()}
        </View>
      )}

      {/* モーダル表示（通常の使用） */}
      {!inline && (
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
            {renderPickerContent()}
          </View>
        </TouchableOpacity>
      </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 6,
  },
  colorButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e9e9e7",
  },
  colorPreviewLarge: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    marginRight: 12,
  },
  colorText: {
    fontSize: 14,
    color: "#37352f",
    flex: 1,
    fontFamily: "monospace",
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
    maxWidth: 400,
    maxHeight: "70%",
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 16,
  },
  colorsList: {
    maxHeight: 400,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#787774",
    marginTop: 12,
    marginBottom: 8,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 6,
    margin: 4,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorOptionSelected: {
    borderColor: "#37352f",
  },
  checkmark: {
    fontSize: 18,
    color: "#ffffff",
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  customColorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  colorInput: {
    flex: 1,
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "monospace",
    color: "#37352f",
    marginRight: 8,
  },
  colorInputError: {
    borderColor: "#d93025",
  },
  submitButton: {
    backgroundColor: "#37352f",
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
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
  inlinePickerContainer: {
    marginTop: 12,
    padding: 16,
    backgroundColor: "#f7f6f3",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9e9e7",
  },
});

