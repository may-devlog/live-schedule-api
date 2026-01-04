// Notion風のタグコンポーネント
import React from "react";
import { View, Text, StyleSheet } from "react-native";

type TagProps = {
  label: string;
  color?: string;
};

// カラーコードからRGB値を取得
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  // #を削除
  const cleanHex = hex.replace("#", "");
  
  // 3桁の場合は6桁に変換
  const fullHex = cleanHex.length === 3
    ? cleanHex.split("").map(char => char + char).join("")
    : cleanHex;
  
  if (fullHex.length !== 6) return null;
  
  const r = parseInt(fullHex.substring(0, 2), 16);
  const g = parseInt(fullHex.substring(2, 4), 16);
  const b = parseInt(fullHex.substring(4, 6), 16);
  
  return { r, g, b };
};

// 色の明度（luminance）を計算（0-1の値、0が黒、1が白）
const getLuminance = (r: number, g: number, b: number): number => {
  // RGB値を0-1の範囲に正規化
  const [rs, gs, bs] = [r, g, b].map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  
  // 相対輝度を計算
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

// 背景色に応じた文字色を決定
const getTextColor = (backgroundColor: string): string => {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return "#37352f"; // デフォルト（黒）
  
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  // 明度が0.5より大きい場合は黒、小さい場合は白
  return luminance > 0.5 ? "#37352f" : "#ffffff";
};

export function NotionTag({ label, color = "#e9e9e7" }: TagProps) {
  const textColor = getTextColor(color);
  
  return (
    <View style={[styles.tag, { backgroundColor: color }]}>
      <Text style={[styles.tagText, { color: textColor }]}>{label}</Text>
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

