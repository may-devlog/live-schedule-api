// Notion風のタグコンポーネント
import React from "react";
import { View, Text, StyleSheet } from "react-native";

type TagProps = {
  label: string;
  color?: string;
};

export function NotionTag({ label, color = "#e9e9e7" }: TagProps) {
  return (
    <View style={[styles.tag, { backgroundColor: color }]}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    alignSelf: "flex-start",
    borderWidth: 0,
  },
  tagText: {
    fontSize: 12,
    color: "#37352f",
    fontWeight: "500",
  },
});

