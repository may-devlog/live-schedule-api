import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type BooleanSelectDisplayProps = {
  value: boolean;
};

export function BooleanSelectDisplay({ value }: BooleanSelectDisplayProps) {
  return (
    <View
      style={styles.container}
      accessibilityLabel={`${value ? "あり" : "なし"}（選択値）`}
    >
      <Text style={styles.text}>{value ? "あり" : "なし"}</Text>
      <Ionicons name="chevron-down" size={15} color="#6D28D9" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    minWidth: 88,
    minHeight: 34,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#8B5CF6",
    borderRadius: 7,
    backgroundColor: "#F5F0FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  text: {
    color: "#5B21B6",
    fontSize: 14,
    fontWeight: "600",
  },
});
