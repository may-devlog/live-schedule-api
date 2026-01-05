// Notion風のDate/Timeピッカーコンポーネント
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

// Web用のHTML input要素の型定義
declare global {
  namespace JSX {
    interface IntrinsicElements {
      input: React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;
    }
  }
}

type NotionDatePickerProps = {
  label: string;
  value?: string | null;
  onValueChange: (value: string | null) => void;
  mode?: "date" | "time" | "datetime";
  placeholder?: string;
  required?: boolean;
  maxDate?: string | null; // YYYY-MM-DD or YYYY-MM-DD HH:MM format
};

export function NotionDatePicker({
  label,
  value,
  onValueChange,
  mode = "date",
  placeholder = "選択してください",
  required = false,
  maxDate,
}: NotionDatePickerProps) {
  // ヘルパー関数を先に定義
  const parseValueToDate = (val: string, m: "date" | "time" | "datetime"): Date | null => {
    try {
      if (m === "date") {
        const [year, month, day] = val.split("-").map(Number);
        if (year && month && day) {
          return new Date(year, month - 1, day);
        }
      } else if (m === "time") {
        const [hours, minutes] = val.split(":").map(Number);
        if (hours !== undefined && minutes !== undefined) {
          const d = new Date();
          d.setHours(hours, minutes, 0, 0);
          return d;
        }
      } else if (m === "datetime") {
        // YYYY-MM-DD HH:MM 形式
        const [datePart, timePart] = val.split(" ");
        if (datePart && timePart) {
          const [year, month, day] = datePart.split("-").map(Number);
          const [hours, minutes] = timePart.split(":").map(Number);
          if (year && month && day && hours !== undefined && minutes !== undefined) {
            return new Date(year, month - 1, day, hours, minutes, 0, 0);
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const [showPicker, setShowPicker] = useState(false);
  const [tempValue, setTempValue] = useState(value || "");
  
  // tempDateを計算（valueが変更されたときに更新）
  const getTempDate = (): Date => {
    if (value) {
      const parsed = parseValueToDate(value, mode);
      if (parsed) {
        return parsed;
      }
    }
    return new Date();
  };
  
  const [tempDate, setTempDate] = useState<Date>(getTempDate());

  // valueが変更されたときにtempDateとtempValueを更新
  React.useEffect(() => {
    if (value) {
      const parsed = parseValueToDate(value, mode);
      if (parsed) {
        setTempDate(parsed);
      }
      setTempValue(value);
    } else {
      setTempValue("");
      setTempDate(new Date());
    }
  }, [value, mode]);

  const formatDateToString = (date: Date, m: "date" | "time" | "datetime"): string => {
    if (m === "date") {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } else if (m === "time") {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    } else {
      // datetime
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
  };

  // maxDateをDateオブジェクトに変換
  const getMaxDate = (): Date | undefined => {
    if (!maxDate) return undefined;
    const parsed = parseValueToDate(maxDate, mode);
    return parsed || undefined;
  };

  const handleCalendarChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "web") {
      // Webの場合は直接処理
      if (selectedDate) {
        const formatted = formatDateToString(selectedDate, mode);
        setTempValue(formatted);
        setTempDate(selectedDate);
        // Webでは自動的に決定される
        onValueChange(formatted);
        setShowPicker(false);
      }
    } else if (Platform.OS === "android") {
      if (event.type === "set" && selectedDate) {
        const formatted = formatDateToString(selectedDate, mode);
        onValueChange(formatted);
        setTempValue(formatted);
        setTempDate(selectedDate);
        setShowPicker(false);
      } else if (event.type === "dismissed") {
        // キャンセルされた場合
        setShowPicker(false);
      }
    } else {
      // iOS
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const handleCalendarConfirm = () => {
    const formatted = formatDateToString(tempDate, mode);
    onValueChange(formatted);
    setTempValue(formatted);
    setShowPicker(false);
  };

  const handleConfirm = () => {
    if (tempValue.trim()) {
      // maxDateのバリデーション
      if (maxDate) {
        const selectedDate = parseValueToDate(tempValue.trim(), mode);
        const maxDateObj = parseValueToDate(maxDate, mode);
        if (selectedDate && maxDateObj && selectedDate > maxDateObj) {
          // エラーは親コンポーネントで処理するため、ここでは何もしない
          // 親コンポーネントでバリデーションを行う
        }
      }
      onValueChange(tempValue.trim());
      // 手入力で値が設定されたら、tempDateも更新
      const parsed = parseValueToDate(tempValue.trim(), mode);
      if (parsed) {
        setTempDate(parsed);
      }
    } else {
      onValueChange(null);
    }
    setShowPicker(false);
  };

  const handleClear = () => {
    onValueChange(null);
    setTempValue("");
  };

  const getPlaceholder = () => {
    if (mode === "date") return "YYYY-MM-DD";
    if (mode === "time") return "HH:MM";
    return "YYYY-MM-DD HH:MM";
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => setShowPicker(true)}
      >
        <Text style={[styles.selectText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
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
        visible={showPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowPicker(false);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowPicker(false);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => {
              e.stopPropagation();
            }}
            style={{ width: "100%", alignItems: "center" }}
          >
            <View 
              style={styles.modalContent} 
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                e.stopPropagation();
                return true;
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
              }}
            >
            <Text style={styles.modalTitle}>{label}</Text>
            
            {/* カレンダーと手入力を同じ画面に表示 */}
            <View style={styles.pickerContainer}>
              {/* カレンダー */}
              {Platform.OS === "web" ? (
                // Webの場合はHTMLのinput要素を使用
                <View style={styles.webInputWrapper}>
                  <input
                    type={mode === "date" ? "date" : mode === "time" ? "time" : "datetime-local"}
                    value={
                      mode === "date"
                        ? tempValue || ""
                        : mode === "time"
                        ? tempValue || ""
                        : tempValue ? tempValue.replace(" ", "T") : ""
                    }
                    max={
                      maxDate
                        ? mode === "datetime"
                          ? maxDate.replace(" ", "T")
                          : maxDate
                        : undefined
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        let formatted = val;
                        if (mode === "datetime") {
                          // datetime-localからYYYY-MM-DD HH:MM形式に変換
                          formatted = val.replace("T", " ");
                        }
                        setTempValue(formatted);
                        const parsed = parseValueToDate(formatted, mode);
                        if (parsed) {
                          setTempDate(parsed);
                        }
                      } else {
                        setTempValue("");
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "14px",
                      border: "1px solid #e9e9e7",
                      borderRadius: "3px",
                      backgroundColor: "#f7f6f3",
                      color: "#37352f",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                </View>
              ) : Platform.OS === "ios" ? (
                <DateTimePicker
                  value={tempDate}
                  mode={mode === "datetime" ? "datetime" : mode === "time" ? "time" : "date"}
                  display="spinner"
                  onChange={handleCalendarChange}
                  style={styles.picker}
                  maximumDate={getMaxDate()}
                />
              ) : (
                // Androidの場合はModal外で表示
                <View style={styles.androidPickerContainer}>
                  <Text style={styles.androidPickerHint}>カレンダーを選択してください</Text>
                </View>
              )}
              
              {/* 手入力フィールド */}
              <Text style={styles.inputLabel}>または手入力</Text>
              <View
                pointerEvents="box-none"
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => {
                  e.stopPropagation();
                  return true;
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                }}
              >
                <TextInput
                  style={styles.input}
                  value={tempValue}
                  onChangeText={setTempValue}
                  placeholder={getPlaceholder()}
                  placeholderTextColor="#9b9a97"
                  onFocus={() => {
                    // フォーカス時に何もしない
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                  }}
                  onPressIn={(e) => {
                    e.stopPropagation();
                  }}
                  onPressOut={(e) => {
                    e.stopPropagation();
                  }}
                  editable={true}
                />
              </View>
            </View>
            
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={(e) => {
                  e.stopPropagation();
                  setTempValue(value || "");
                  setTempDate(getTempDate());
                  setShowPicker(false);
                }}
              >
                <Text style={styles.cancelButtonText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleConfirm();
                }}
              >
                <Text style={styles.confirmButtonText}>決定</Text>
              </TouchableOpacity>
            </View>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      
      {Platform.OS === "android" && showPicker && (
        <DateTimePicker
          value={tempDate}
          mode={mode === "datetime" ? "datetime" : mode === "time" ? "time" : "date"}
          display="default"
          onChange={handleCalendarChange}
          maximumDate={getMaxDate()}
        />
      )}
      
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
  selectText: {
    fontSize: 14,
    color: "#37352f",
    flex: 1,
  },
  placeholder: {
    color: "#9b9a97",
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
    maxWidth: 400,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 16,
  },
  input: {
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
  webInputWrapper: {
    marginBottom: 16,
    width: "100%",
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
  optionRow: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 3,
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    alignItems: "center",
  },
  optionButtonText: {
    color: "#37352f",
    fontSize: 14,
    fontWeight: "500",
  },
  pickerContainer: {
    marginBottom: 16,
  },
  picker: {
    height: 200,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 6,
    marginTop: 16,
  },
  androidPickerContainer: {
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  androidPickerHint: {
    fontSize: 14,
    color: "#787774",
    textAlign: "center",
  },
});

