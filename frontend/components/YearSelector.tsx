// components/YearSelector.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";

type YearSelectorProps = {
  availableYears: number[];
  currentYear: string | null;
  onSelectYear: (year: number) => void;
};

export function YearSelector({ availableYears, currentYear, onSelectYear }: YearSelectorProps) {
  if (Platform.OS === "web") {
    // Web版はプルダウン形式（HTMLのselectを使用）
    return (
      <View style={styles.container}>
        {/* @ts-ignore - Web環境でのみ使用されるHTML要素 */}
        <select
          value={currentYear || ""}
          onChange={(e: any) => {
            const year = parseInt(e.target.value, 10);
            if (!isNaN(year)) {
              onSelectYear(year);
            }
          }}
          style={{
            padding: "8px 12px",
            fontSize: "14px",
            borderRadius: "3px",
            border: "1px solid #e9e9e7",
            backgroundColor: "#ffffff",
            color: "#37352f",
            fontWeight: "500",
            cursor: "pointer",
            minWidth: "120px",
          }}
        >
          <option value="">年を選択</option>
          {availableYears.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </View>
    );
  }

  // モバイル版はTouchableOpacityで実装（Pickerは後で追加可能）
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => {
          // モバイル版では、最初の年を選択（後でモーダルを追加可能）
          if (availableYears.length > 0) {
            onSelectYear(availableYears[0]);
          }
        }}
      >
        <Text style={styles.pickerButtonText}>
          {currentYear || "年を選択"}
        </Text>
        <Text style={styles.pickerButtonArrow}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
  },
  pickerButtonText: {
    fontSize: 14,
    color: "#37352f",
    fontWeight: "500",
  },
  pickerButtonArrow: {
    fontSize: 10,
    color: "#787774",
    marginLeft: 8,
  },
});

