// 交通・宿泊の詳細画面で「紐づく親スケジュール」を表示するためのカード。
// NotionRelationの選択済みカード表示と、共有/公開ページの読み取り専用表示の両方で使う。
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { NotionTag } from "./notion-tag";
import { getOptionColor, getOptionColorSync } from "../utils/get-option-color";

type ScheduleLinkCardProps = {
  date?: string | null;
  title: string;
  area?: string | null;
  onPress?: () => void;
  onRemove?: () => void;
};

export function ScheduleLinkCard({ date, title, area, onPress, onRemove }: ScheduleLinkCardProps) {
  const [areaColor, setAreaColor] = useState<string | undefined>(() =>
    area ? getOptionColorSync(area, "AREAS") : undefined
  );

  useEffect(() => {
    let active = true;
    if (area) {
      getOptionColor(area, "AREAS").then((color) => {
        if (active) setAreaColor(color);
      });
    } else {
      setAreaColor(undefined);
    }
    return () => {
      active = false;
    };
  }, [area]);

  const Wrapper: React.ElementType = onPress ? TouchableOpacity : View;

  return (
    <Wrapper style={styles.cardContainer} onPress={onPress} activeOpacity={onPress ? 0.7 : undefined}>
      <View style={styles.cardContent}>
        {!!date && <Text style={styles.cardDate}>{date}</Text>}
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!area && <NotionTag label={area} color={areaColor} />}
      </View>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
          <Text style={styles.removeIcon}>×</Text>
        </TouchableOpacity>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f7f6f3",
    borderWidth: 1,
    borderColor: "#e9e9e7",
    borderRadius: 3,
    padding: 12,
    gap: 8,
  },
  cardContent: {
    flex: 1,
    gap: 6,
  },
  cardDate: {
    fontSize: 11,
    color: "#9b9a97",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#37352f",
  },
  removeButton: {
    padding: 4,
  },
  removeIcon: {
    fontSize: 18,
    color: "#9b9a97",
  },
});
