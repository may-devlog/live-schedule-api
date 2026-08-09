// Notion風のプロパティ表示コンポーネント
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [expanded, setExpanded] = useState(!isMobile);

  useEffect(() => {
    setExpanded(!isMobile);
  }, [isMobile]);

  // 有効な子要素のみをフィルタリングして配列に変換
  const validChildren = React.Children.toArray(children).filter(
    (child) => React.isValidElement(child)
  );
  
  // 有効な子要素の数をカウント
  let validChildIndex = 0;
  
  return (
    <View style={styles.block}>
      {title && (
        <TouchableOpacity
          style={[styles.blockTitleContainer, isMobile && styles.blockTitleContainerMobile]}
          onPress={() => isMobile && setExpanded((value) => !value)}
          disabled={!isMobile}
          accessibilityRole={isMobile ? "button" : undefined}
          accessibilityState={isMobile ? { expanded } : undefined}
        >
          <Text style={styles.blockTitle}>{title}</Text>
          {isMobile && <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#7C3AED" />}
        </TouchableOpacity>
      )}
      {expanded && <View style={styles.properties}>
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
      </View>}
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
  blockTitleContainerMobile: {
    minHeight: 58,
    paddingHorizontal: 16,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: "#E8E3F1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#37352f",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F5F3FF",
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#7C3AED",
    letterSpacing: 0.3,
    width: "100%",
    flex: 1,
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
    minWidth: 0,
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
