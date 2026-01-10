// カラーピッカーコンポーネント
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ScrollView,
  Platform,
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
  const [showAdvancedPicker, setShowAdvancedPicker] = useState(false);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hueSliderRef = useRef<HTMLCanvasElement | null>(null);
  const isDragging = useRef(false);
  const isDraggingHue = useRef(false);

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

  // RGBをHSVに変換
  const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    let h = 0;
    if (diff !== 0) {
      if (max === r) {
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        h = ((b - r) / diff + 2) / 6;
      } else {
        h = ((r - g) / diff + 4) / 6;
      }
    }
    const s = max === 0 ? 0 : diff / max;
    const v = max;
    return [h * 360, s * 100, v * 100];
  };

  // HSVをRGBに変換
  const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
    h = h / 360;
    s = s / 100;
    v = v / 100;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r = 0, g = 0, b = 0;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  // RGBを16進数に変換
  const rgbToHex = (r: number, g: number, b: number): string => {
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`.toUpperCase();
  };

  // 16進数をRGBに変換
  const hexToRgb = (hex: string): [number, number, number] | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : null;
  };

  // カラーコードからHSVを取得
  useEffect(() => {
    if (value && isValidColor(value)) {
      const rgb = hexToRgb(value);
      if (rgb) {
        const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        setHue(h);
        setSaturation(s);
        setBrightness(v);
      }
    }
  }, [value]);

  // カラーピッカーのCanvasを描画
  useEffect(() => {
    if (Platform.OS === "web" && canvasRef.current && showAdvancedPicker) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // 彩度と明度の2Dカラーピッカーを描画
      const imageData = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const s = (x / width) * 100;
          const v = 100 - (y / height) * 100;
          const [r, g, b] = hsvToRgb(hue, s, v);
          const index = (y * width + x) * 4;
          imageData.data[index] = r;
          imageData.data[index + 1] = g;
          imageData.data[index + 2] = b;
          imageData.data[index + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }, [hue, showAdvancedPicker]);

  // 色相スライダーのCanvasを描画
  useEffect(() => {
    if (Platform.OS === "web" && hueSliderRef.current && showAdvancedPicker) {
      const canvas = hueSliderRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // 色相スライダーを描画
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      for (let i = 0; i <= 360; i += 30) {
        const [r, g, b] = hsvToRgb(i, 100, 100);
        gradient.addColorStop(i / 360, rgbToHex(r, g, b));
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  }, [showAdvancedPicker]);

  // カラーピッカーのクリック/ドラッグ処理
  const handleCanvasMouseDown = (e: any) => {
    if (Platform.OS !== "web" || !canvasRef.current) return;
    isDragging.current = true;
    handleCanvasMouseMove(e);
  };

  const handleCanvasMouseMove = (e: any) => {
    if (Platform.OS !== "web" || !canvasRef.current || !isDragging.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = canvas.width;
    const height = canvas.height;

    if (x >= 0 && x <= width && y >= 0 && y <= height) {
      const s = Math.max(0, Math.min(100, (x / width) * 100));
      const v = Math.max(0, Math.min(100, 100 - (y / height) * 100));
      setSaturation(s);
      setBrightness(v);
      updateColorFromHsv(hue, s, v);
    }
  };

  const handleCanvasMouseUp = () => {
    isDragging.current = false;
  };

  // 色相スライダーのクリック/ドラッグ処理
  const handleHueSliderMouseDown = (e: any) => {
    if (Platform.OS !== "web" || !hueSliderRef.current) return;
    isDraggingHue.current = true;
    handleHueSliderMouseMove(e);
  };

  const handleHueSliderMouseMove = (e: any) => {
    if (Platform.OS !== "web" || !hueSliderRef.current || !isDraggingHue.current) return;
    const canvas = hueSliderRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = canvas.width;

    if (x >= 0 && x <= width) {
      const h = Math.max(0, Math.min(360, (x / width) * 360));
      setHue(h);
      updateColorFromHsv(h, saturation, brightness);
    }
  };

  const handleHueSliderMouseUp = () => {
    isDraggingHue.current = false;
  };

  // HSVから色を更新
  const updateColorFromHsv = (h: number, s: number, v: number) => {
    const [r, g, b] = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    setCustomColor(hex);
    onValueChange(hex);
  };

  // Web環境でのグローバルマウスイベント
  useEffect(() => {
    if (Platform.OS === "web" && showAdvancedPicker) {
      const handleMouseMove = (e: MouseEvent) => {
        if (isDragging.current) {
          handleCanvasMouseMove(e);
        }
        if (isDraggingHue.current) {
          handleHueSliderMouseMove(e);
        }
      };
      const handleMouseUp = () => {
        handleCanvasMouseUp();
        handleHueSliderMouseUp();
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [showAdvancedPicker, hue, saturation, brightness]);

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
            onPress={() => {
              // カスタムカラーピッカーを表示
              setShowAdvancedPicker(!showAdvancedPicker);
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
        
        {/* カスタムカラーピッカー（Web環境のみ） */}
        {Platform.OS === "web" && showAdvancedPicker && (
          <View style={styles.advancedPickerContainer}>
            {/* 彩度と明度の2Dカラーピッカー */}
            <View style={styles.canvasWrapper}>
              {/* @ts-ignore - Web環境でのみ使用されるHTML要素 */}
              <canvas
                ref={canvasRef}
                width={200}
                height={200}
                style={styles.colorCanvas}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />
              {/* 選択位置のインジケーター */}
              <View
                style={[
                  styles.colorIndicator,
                  {
                    left: `${saturation}%`,
                    top: `${100 - brightness}%`,
                  },
                ]}
              />
            </View>
            
            {/* 色相スライダー */}
            <View style={styles.hueSliderWrapper}>
              {/* @ts-ignore - Web環境でのみ使用されるHTML要素 */}
              <canvas
                ref={hueSliderRef}
                width={200}
                height={20}
                style={styles.hueCanvas}
                onMouseDown={handleHueSliderMouseDown}
                onMouseMove={handleHueSliderMouseMove}
                onMouseUp={handleHueSliderMouseUp}
                onMouseLeave={handleHueSliderMouseUp}
              />
              {/* 選択位置のインジケーター */}
              <View
                style={[
                  styles.hueIndicator,
                  {
                    left: `${(hue / 360) * 100}%`,
                  },
                ]}
              />
            </View>
            
            {/* 選択された色のプレビュー */}
            <View style={styles.selectedColorPreview}>
              <View
                style={[
                  styles.selectedColorBox,
                  { backgroundColor: customColor },
                ]}
              />
              <Text style={styles.selectedColorText}>{customColor}</Text>
            </View>
          </View>
        )}
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
  advancedPickerContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9e9e7",
  },
  canvasWrapper: {
    position: "relative",
    marginBottom: 16,
  },
  colorCanvas: {
    width: "100%",
    maxWidth: 200,
    height: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    cursor: "crosshair",
  },
  colorIndicator: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "transparent",
    transform: [{ translateX: -8 }, { translateY: -8 }],
    pointerEvents: "none",
  },
  hueSliderWrapper: {
    position: "relative",
    marginBottom: 16,
  },
  hueCanvas: {
    width: "100%",
    maxWidth: 200,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    cursor: "pointer",
  },
  hueIndicator: {
    position: "absolute",
    width: 4,
    height: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#37352f",
    borderRadius: 2,
    transform: [{ translateX: -2 }],
    pointerEvents: "none",
  },
  selectedColorPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedColorBox: {
    width: 40,
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e9e9e7",
  },
  selectedColorText: {
    fontSize: 14,
    fontFamily: "monospace",
    color: "#37352f",
  },
});

