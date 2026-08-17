// app/settings/delete-account.tsx - 退会（アカウント削除）
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";
import { AppHeader } from "../../components/GenBGTBrand";
import { AppTabBar } from "../../components/AppTabBar";

const brand = { violet: "#7C3AED", violetDark: "#5B21B6", ink: "#201B2C", muted: "#6B6675", border: "#E8E3F1" };

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  };

  const deleteAccount = async () => {
    try {
      setSubmitting(true);
      const res = await authenticatedFetch(getApiUrl("/auth/account"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "退会処理に失敗しました");
      }

      await logout();
      showAlert("退会が完了しました", "ご利用ありがとうございました。");
      router.replace("/login");
    } catch (e: any) {
      showAlert("エラー", e.message || "退会処理に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    if (!password) {
      showAlert("エラー", "パスワードを入力してください");
      return;
    }
    const message = "本当に退会しますか？全てのスケジュール・交通・宿泊のデータが削除され、復元することはできません。";
    if (Platform.OS === "web") {
      if (window.confirm(message)) deleteAccount();
    } else {
      Alert.alert("最終確認", message, [
        { text: "キャンセル", style: "cancel" },
        { text: "退会する", style: "destructive", onPress: deleteAccount },
      ]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <AppHeader active="archive" />
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={brand.violet} />
          <Text style={styles.backLinkText}>戻る</Text>
        </TouchableOpacity>

        <Text style={styles.title}>退会</Text>

        <View style={styles.warningBox}>
          <View style={styles.warningHeader}>
            <Ionicons name="warning-outline" size={18} color="#DC2626" />
            <Text style={styles.warningTitle}>ご注意ください</Text>
          </View>
          <Text style={styles.warningText}>
            退会すると、このアカウントに登録されている全てのスケジュール・交通・宿泊のデータが完全に削除されます。
          </Text>
          <Text style={styles.warningText}>
            削除されたデータを復元することはできません。あらかじめご了承のうえ、手続きを行ってください。
          </Text>
        </View>

        <Text style={styles.label}>確認のためパスワードを入力してください</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="パスワード"
          secureTextEntry
          editable={!submitting}
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.deleteButton, (submitting || !password) && styles.buttonDisabled]}
          onPress={confirmDelete}
          disabled={submitting || !password}
        >
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.deleteButtonText}>退会してアカウントを削除する</Text>}
        </TouchableOpacity>
      </ScrollView>
      <AppTabBar active="archive" homePath="/" archivePath={`/year/${new Date().getFullYear()}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  backLink: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12, alignSelf: "flex-start" },
  backLinkText: { color: brand.violet, fontSize: 14, fontWeight: "700" },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 16, color: brand.ink },
  warningBox: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", borderRadius: 12, padding: 16, marginBottom: 24, gap: 8 },
  warningHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  warningTitle: { color: "#DC2626", fontSize: 15, fontWeight: "800" },
  warningText: { color: "#7F1D1D", fontSize: 13, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: "700", color: brand.ink, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: "#FFFFFF", marginBottom: 24 },
  deleteButton: { backgroundColor: "#DC2626", borderRadius: 10, minHeight: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  deleteButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  buttonDisabled: { opacity: 0.5 },
});
