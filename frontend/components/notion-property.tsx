// Notion風のプロパティ表示コンポーネント
import React, { useEffect, useState } from "react";
import { Platform, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
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
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8E3F1",
    backgroundColor: "#FFFFFF",
    ...(Platform.OS === "web" ? ({ boxShadow: "0 10px 30px rgba(46,16,101,0.06)" } as any) : {}),
  },
  blockTitleContainer: {
    width: "100%",
    marginBottom: 16,
  },
  blockTitleContainerMobile: {
    minHeight: 42,
    paddingHorizontal: 0,
    marginBottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  blockTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#201B2C",
    width: "100%",
    flex: 1,
  },
  properties: {
    backgroundColor: "#FFFFFF",
  },
  propertyRow: {
    flexDirection: "row",
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: "#F0ECF5",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  propertyRowLast: {
    borderBottomWidth: 0,
  },
  labelContainer: {
    width: 126,
    paddingLeft: 0,
    paddingRight: 12,
    paddingVertical: 12,
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
    color: "#7A7484",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  valueContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingLeft: 8,
    paddingRight: 0,
    paddingVertical: 12,
  },
  value: {
    fontSize: 14,
    color: "#201B2C",
    lineHeight: 20,
  },
});
