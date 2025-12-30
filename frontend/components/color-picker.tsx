// カラーピッカーコンポーネント
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ScrollView,
} from "react-native";
import { DEFAULT_COLORS } from "../types/select-option";

type ColorPickerProps = {
  value?: string;
  onValueChange: (color: string) => void;
  label?: string;
};

export function ColorPicker({
  value,
  onValueChange,
  label = "色を選択",
}: ColorPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [customColor, setCustomColor] = useState(value || "#3B82F6");

  const handleColorSelect = (color: string) => {
    onValueChange(color);
    setModalVisible(false);
  };

  const handleCustomColorSubmit = () => {
    if (isValidColor(customColor)) {
      onValueChange(customColor);
      setModalVisible(false);
    }
  };

  const isValidColor = (color: string): boolean => {
    // カラーコードのバリデーション（#RRGGBB形式）
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={styles.colorButton}
        onPress={() => setModalVisible(true)}
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
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
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
                    onPress={() => handleColorSelect(color)}
                  >
                    {value === color && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>カスタム色</Text>
              <View style={styles.customColorContainer}>
                <View
                  style={[
                    styles.colorPreviewLarge,
                    {
                      backgroundColor: isValidColor(customColor)
                        ? customColor
                        : "#E5E7EB",
                    },
                  ]}
                />
                <TextInput
                  style={[
                    styles.colorInput,
                    !isValidColor(customColor) && styles.colorInputError,
                  ]}
                  value={customColor}
                  onChangeText={setCustomColor}
                  placeholder="#RRGGBB"
                  placeholderTextColor="#9b9a97"
                  maxLength={7}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    !isValidColor(customColor) && styles.submitButtonDisabled,
                  ]}
                  onPress={handleCustomColorSubmit}
                  disabled={!isValidColor(customColor)}
                >
                  <Text style={styles.submitButtonText}>適用</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
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
});

