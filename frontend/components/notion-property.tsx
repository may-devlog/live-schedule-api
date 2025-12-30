// Notion風のプロパティ表示コンポーネント
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

type PropertyProps = {
  label: string;
  value?: string | number | null;
  children?: React.ReactNode;
  onPress?: () => void;
};

export function NotionProperty({ label, value, children, onPress }: PropertyProps) {
  const content = children || (
    <Text style={styles.value}>{value ?? "-"}</Text>
  );

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      style={styles.propertyRow}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.valueContainer}>{content}</View>
    </Wrapper>
  );
}

type PropertyBlockProps = {
  children: React.ReactNode;
  title?: string;
};

export function NotionPropertyBlock({ children, title }: PropertyBlockProps) {
  return (
    <View style={styles.block}>
      {title && <Text style={styles.blockTitle}>{title}</Text>}
      <View style={styles.properties}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 24,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#37352f",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  properties: {
    backgroundColor: "#ffffff",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    overflow: "hidden",
  },
  propertyRow: {
    flexDirection: "row",
    minHeight: 36,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  labelContainer: {
    width: 140,
    paddingRight: 12,
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    color: "#787774",
    fontWeight: "500",
  },
  valueContainer: {
    flex: 1,
    justifyContent: "center",
  },
  value: {
    fontSize: 14,
    color: "#37352f",
    lineHeight: 20,
  },
});

