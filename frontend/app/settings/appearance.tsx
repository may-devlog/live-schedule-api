// app/settings/appearance.tsx - 外観設定（Scheme: Light/Dark、Accent Color）
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../../components/GenBGTBrand";
import { AppTabBar } from "../../components/AppTabBar";
import {
  ACCENT_OPTIONS,
  SCHEME_OPTIONS,
  useTheme,
  type AccentKey,
  type SchemeKey,
} from "../../contexts/ThemeContext";

// アクセントカラーのスウォッチ表示用（テーマ本体のトークンとは独立した固定値）
const ACCENT_SWATCH: Record<AccentKey, string> = {
  black: "#18181B",
  blue: "#2563EB",
  green: "#16A34A",
  orange: "#EA580C",
  pink: "#DB2777",
  purple: "#7C3AED",
};

export default function AppearanceSettingsScreen() {
  const { scheme, accent, colors, setScheme, setAccent } = useTheme();
  const [updating, setUpdating] = useState(false);

  const showAlert = (title: string, message?: string) => {
    if (Platform.OS === "web") {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSelectScheme = async (next: SchemeKey) => {
    if (next === scheme || updating) return;
    setUpdating(true);
    try {
      await setScheme(next);
    } catch (e: any) {
      showAlert("エラー", e.message || "外観設定の更新に失敗しました");
    } finally {
      setUpdating(false);
    }
  };

  const handleSelectAccent = async (next: AccentKey) => {
    if (next === accent || updating) return;
    setUpdating(true);
    try {
      await setAccent(next);
    } catch (e: any) {
      showAlert("エラー", e.message || "外観設定の更新に失敗しました");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader active="archive" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: colors.ink }]}>外観</Text>
        <Text style={[styles.description, { color: colors.muted }]}>
          アプリの配色を設定します。
        </Text>

        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Scheme</Text>
        <View style={[styles.group, { borderColor: colors.border }]}>
          {SCHEME_OPTIONS.map((option, index) => {
            const selected = option.key === scheme;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.row,
                  index < SCHEME_OPTIONS.length - 1 && [styles.rowDivider, { borderColor: colors.border }],
                ]}
                onPress={() => handleSelectScheme(option.key)}
                disabled={updating}
              >
                <Text style={[styles.rowLabel, { color: colors.ink }]}>{option.label}</Text>
                <RadioIndicator selected={selected} color={colors.accent} />
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Accent Color</Text>
        <View style={[styles.group, { borderColor: colors.border }]}>
          {ACCENT_OPTIONS.map((option, index) => {
            const selected = option.key === accent;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.row,
                  index < ACCENT_OPTIONS.length - 1 && [styles.rowDivider, { borderColor: colors.border }],
                ]}
                onPress={() => handleSelectAccent(option.key)}
                disabled={updating}
              >
                <View style={styles.rowLabelWithSwatch}>
                  <View style={[styles.swatch, { backgroundColor: ACCENT_SWATCH[option.key] }]} />
                  <Text style={[styles.rowLabel, { color: colors.ink }]}>{option.label}</Text>
                </View>
                <RadioIndicator selected={selected} color={colors.accent} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <AppTabBar active="archive" homePath="/" archivePath={`/year/${new Date().getFullYear()}`} />
    </View>
  );
}

function RadioIndicator({ selected, color }: { selected: boolean; color: string }) {
  return (
    <View
      style={[
        styles.radioOuter,
        selected ? { backgroundColor: color, borderColor: color } : { borderColor: "#C9C4D1" },
      ]}
    >
      {selected && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
  description: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginBottom: 8, marginTop: 4 },
  group: { borderWidth: 1, borderRadius: 12, marginBottom: 24, overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1 },
  rowLabel: { fontSize: 16, fontWeight: "600" },
  rowLabelWithSwatch: { flexDirection: "row", alignItems: "center", gap: 12 },
  swatch: { width: 20, height: 20, borderRadius: 10 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
