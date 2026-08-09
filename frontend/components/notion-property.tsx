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
  alignValue?: "left" | "right";
};

export function NotionProperty({ label, value, children, onPress, isLast, alignValue = "left" }: PropertyProps) {
  const content = children || (
    <Text style={[styles.value, alignValue === "right" && styles.valueRight]}>{value ?? "-"}</Text>
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
      <View style={[styles.valueContainer, alignValue === "right" && styles.valueContainerRight]}>
        <View style={[styles.valueContent, alignValue === "right" && styles.valueContentRight]}>{content}</View>
      </View>
    </Wrapper>
  );
}

type PropertyBlockProps = {
  children: React.ReactNode;
  title?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  collapsibleOnMobile?: boolean;
};

export function NotionPropertyBlock({ children, title, iconName, collapsibleOnMobile = true }: PropertyBlockProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCollapsible = isMobile && collapsibleOnMobile;
  const [expanded, setExpanded] = useState(!isCollapsible);

  useEffect(() => {
    setExpanded(!isCollapsible);
  }, [isCollapsible]);

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
          onPress={() => isCollapsible && setExpanded((value) => !value)}
          disabled={!isCollapsible}
          accessibilityRole={isCollapsible ? "button" : undefined}
          accessibilityState={isCollapsible ? { expanded } : undefined}
        >
          {!!iconName && <Ionicons name={iconName} size={22} color="#5B21B6" style={styles.blockIcon} />}
          <Text style={styles.blockTitle}>{title}</Text>
          {isCollapsible && <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#7C3AED" />}
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
    flexDirection: "row",
    alignItems: "center",
  },
  blockIcon: { marginRight: 10 },
  blockTitleContainerMobile: {
    minHeight: 42,
    paddingHorizontal: 0,
    marginBottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  blockTitle: {
    fontSize: 18,
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
    fontSize: 13,
    color: "#3F3948",
    fontWeight: "400",
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
    lineHeight: 21,
    fontWeight: "400",
  },
  valueContainerRight: { alignItems: "flex-end" },
  valueContent: { width: "100%" },
  valueContentRight: { alignItems: "flex-end" },
  valueRight: { textAlign: "right", fontVariant: ["tabular-nums"] },
});
