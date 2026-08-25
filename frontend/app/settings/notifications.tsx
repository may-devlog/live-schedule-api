// app/settings/notifications.tsx - 通知設定（メール／アプリのプッシュ通知）
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { getExpoPushToken, registerPushTokenWithServer } from "../../utils/pushNotifications";
import { AppHeader } from "../../components/GenBGTBrand";
import { AppTabBar } from "../../components/AppTabBar";
import { useTheme, type ThemeColors } from "../../contexts/ThemeContext";

type NotificationSettings = {
  email_enabled: boolean;
  push_enabled: boolean;
};

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const showAlert = (title: string, message?: string) => {
    if (Platform.OS === "web") {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch(getApiUrl("/notification-settings"));
      if (!res.ok) throw new Error("通知設定の取得に失敗しました");
      setSettings(await res.json());
    } catch (e: any) {
      showAlert("エラー", e.message || "通知設定の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (next: NotificationSettings) => {
    const previous = settings;
    setSettings(next);
    setUpdating(true);
    try {
      const res = await authenticatedFetch(getApiUrl("/notification-settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("通知設定の更新に失敗しました");
    } catch (e: any) {
      setSettings(previous);
      showAlert("エラー", e.message || "通知設定の更新に失敗しました");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleEmail = (value: boolean) => {
    if (!settings) return;
    updateSettings({ ...settings, email_enabled: value });
  };

  const handleTogglePush = async (value: boolean) => {
    if (!settings) return;

    if (!value) {
      updateSettings({ ...settings, push_enabled: false });
      return;
    }

    if (Platform.OS === "web") {
      showAlert("プッシュ通知はモバイルアプリでのみ利用できます", "スマートフォンアプリからON/OFFを設定してください。");
      return;
    }

    setUpdating(true);
    try {
      const token = await getExpoPushToken();
      if (!token) {
        showAlert(
          "プッシュ通知を有効にできませんでした",
          "端末の通知の許可設定をご確認ください。Expo Goでは動作しない場合があります。"
        );
        return;
      }
      await registerPushTokenWithServer(token);
      await updateSettings({ ...settings, push_enabled: true });
    } catch (e: any) {
      showAlert("エラー", e.message || "プッシュ通知の有効化に失敗しました");
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !settings) {
    return (
      <View style={styles.container}>
        <AppHeader active="archive" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
        <AppTabBar active="archive" homePath="/" archivePath={`/year/${new Date().getFullYear()}`} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader active="archive" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>通知設定</Text>
        <Text style={styles.description}>
          宿泊の取消料発生日時が近づいたときの通知方法を設定します。
        </Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>メール</Text>
            <Text style={styles.rowHelp}>登録したメールアドレス宛に通知します。</Text>
          </View>
          <Switch
            value={settings.email_enabled}
            onValueChange={handleToggleEmail}
            disabled={updating}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#ffffff"
          />
        </View>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>アプリ</Text>
            <Text style={styles.rowHelp}>この端末にプッシュ通知を送ります。</Text>
          </View>
          <Switch
            value={settings.push_enabled}
            onValueChange={handleTogglePush}
            disabled={updating}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#ffffff"
          />
        </View>
      </ScrollView>
      <AppTabBar active="archive" homePath="/" archivePath={`/year/${new Date().getFullYear()}`} />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { padding: 16 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 8, color: colors.ink },
  description: { fontSize: 14, color: colors.muted, marginBottom: 24, lineHeight: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  rowText: { flex: 1, paddingRight: 16 },
  rowTitle: { fontSize: 16, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  rowHelp: { fontSize: 12, color: colors.muted, lineHeight: 18 },
});
