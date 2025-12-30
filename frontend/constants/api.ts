// API設定
// 環境変数 EXPO_PUBLIC_API_BASE が設定されている場合はそれを使用
// 未設定の場合は、プラットフォームに応じて自動的に選択：
// - Web: "http://localhost:3000"
// - iOSシミュレータ: "http://localhost:3000"
// - Androidエミュレータ: "http://10.0.2.2:3000"
// - 実機: "http://10.26.2.22:3000" (ローカルネットワークのIPアドレス)
import { Platform } from "react-native";

const getDefaultApiBase = (): string => {
  // 環境変数が設定されている場合は優先
  if (process.env.EXPO_PUBLIC_API_BASE) {
    return process.env.EXPO_PUBLIC_API_BASE;
  }
  
  // Web または iOS シミュレータ
  if (Platform.OS === "web" || Platform.OS === "ios") {
    return "http://localhost:3000";
  }
  
  // Android エミュレータ
  if (Platform.OS === "android") {
    // Android エミュレータからホストマシンにアクセスする場合は 10.0.2.2 を使用
    return "http://10.0.2.2:3000";
  }
  
  // デフォルト（実機など）- IPアドレスを使用
  return "http://10.26.2.22:3000";
};

export const API_BASE = getDefaultApiBase();

// デバッグ用: 使用されているAPI_BASEをログ出力
if (process.env.NODE_ENV !== "production") {
  console.log("[API] API_BASE:", API_BASE);
}

