// Notion風のプロパティ表示コンポーネント
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

type PropertyProps = {
  label: string;
  value?: string | number | null;
  children?: React.ReactNode;
  onPress?: () => void;
  isLast?: boolean;
};

export function NotionProperty({ label, value, children, onPress, isLast }: PropertyProps) {
  const content = children || (
    <Text style={styles.value}>{value ?? "-"}</Text>
  );

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      style={[styles.propertyRow, isLast && styles.propertyRowLast]}
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
  // 有効な子要素のみをフィルタリングして配列に変換
  const validChildren = React.Children.toArray(children).filter(
    (child) => React.isValidElement(child)
  );
  
  // 有効な子要素の数をカウント
  let validChildIndex = 0;
  
  return (
    <View style={styles.block}>
      {title && (
        <View style={styles.blockTitleContainer}>
          <Text style={styles.blockTitle}>{title}</Text>
        </View>
      )}
      <View style={styles.properties}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            // 有効な子要素のインデックスを使用
            const currentIndex = validChildIndex;
            validChildIndex++;
            const isLast = currentIndex === validChildren.length - 1;
            return React.cloneElement(child as React.ReactElement<any>, {
              isLast,
            });
          }
          return child;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 24,
  },
  blockTitleContainer: {
    width: "100%",
    marginBottom: 12,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#37352f",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#37352f",
    letterSpacing: 0.3,
    width: "100%",
  },
  properties: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e9e9e7",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  propertyRow: {
    flexDirection: "row",
    minHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  propertyRowLast: {
    borderBottomWidth: 0,
  },
  labelContainer: {
    width: 140,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
    justifyContent: "center",
    backgroundColor: "#f7f6f3",
    borderRightWidth: 1,
    borderRightColor: "#e9e9e7",
  },
  label: {
    fontSize: 13,
    color: "#37352f",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  valueContainer: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: 14,
    paddingRight: 14,
    paddingVertical: 10,
  },
  value: {
    fontSize: 14,
    color: "#37352f",
    lineHeight: 20,
  },
});

