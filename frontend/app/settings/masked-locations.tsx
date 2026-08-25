// app/settings/masked-locations.tsx
import React, { useState, useEffect } from "react";
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
import { authenticatedFetch, getApiUrl } from "../../utils/api";
import { AppHeader } from "../../components/GenBGTBrand";
import { AppTabBar } from "../../components/AppTabBar";
import { useTheme, type ThemeColors, type SchemeKey } from "../../contexts/ThemeContext";

type MaskedLocation = {
  id: number;
  user_id: number;
  location_name: string;
  created_at?: string;
  updated_at?: string;
};

export default function MaskedLocationsScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const styles = getStyles(colors, scheme);
  const [locations, setLocations] = useState<MaskedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newLocationName, setNewLocationName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch(getApiUrl("/masked-locations"));
      if (res.ok) {
        const data: MaskedLocation[] = await res.json();
        setLocations(data);
      } else {
        const error = await res.json();
        throw new Error(error.error || "取得に失敗しました");
      }
    } catch (e: any) {
      console.error("Fetch locations error:", e);
      if (Platform.OS === "web") {
        window.alert(`エラー\n\n${e.message || "取得に失敗しました"}`);
      } else {
        Alert.alert("エラー", e.message || "取得に失敗しました");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newLocationName.trim()) {
      if (Platform.OS === "web") {
        window.alert("エラー\n\n駅名を入力してください");
      } else {
        Alert.alert("エラー", "駅名を入力してください");
      }
      return;
    }

    try {
      setSubmitting(true);
      const res = await authenticatedFetch(getApiUrl("/masked-locations"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_name: newLocationName.trim(),
        }),
      });

      if (res.ok) {
        const newLocation: MaskedLocation = await res.json();
        setLocations([...locations, newLocation]);
        setNewLocationName("");
        if (Platform.OS === "web") {
          window.alert("追加しました");
        } else {
          Alert.alert("成功", "追加しました");
        }
      } else {
        const error = await res.json();
        throw new Error(error.error || "追加に失敗しました");
      }
    } catch (e: any) {
      console.error("Add location error:", e);
      if (Platform.OS === "web") {
        window.alert(`エラー\n\n${e.message || "追加に失敗しました"}`);
      } else {
        Alert.alert("エラー", e.message || "追加に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (location: MaskedLocation) => {
    setEditingId(location.id);
    setEditingName(location.location_name);
  };

  const handleSaveEdit = async (id: number) => {
    if (!editingName.trim()) {
      if (Platform.OS === "web") {
        window.alert("エラー\n\n駅名を入力してください");
      } else {
        Alert.alert("エラー", "駅名を入力してください");
      }
      return;
    }

    try {
      setSubmitting(true);
      const res = await authenticatedFetch(getApiUrl(`/masked-locations/${id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_name: editingName.trim(),
        }),
      });

      if (res.ok) {
        const updated: MaskedLocation = await res.json();
        setLocations(locations.map((loc) => (loc.id === id ? updated : loc)));
        setEditingId(null);
        setEditingName("");
        if (Platform.OS === "web") {
          window.alert("更新しました");
        } else {
          Alert.alert("成功", "更新しました");
        }
      } else {
        const error = await res.json();
        throw new Error(error.error || "更新に失敗しました");
      }
    } catch (e: any) {
      console.error("Update location error:", e);
      if (Platform.OS === "web") {
        window.alert(`エラー\n\n${e.message || "更新に失敗しました"}`);
      } else {
        Alert.alert("エラー", e.message || "更新に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleDelete = (id: number, locationName: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(`「${locationName}」を削除しますか？`)) {
        deleteLocation(id);
      }
    } else {
      Alert.alert(
        "削除確認",
        `「${locationName}」を削除しますか？`,
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "削除",
            style: "destructive",
            onPress: () => deleteLocation(id),
          },
        ]
      );
    }
  };

  const deleteLocation = async (id: number) => {
    try {
      setSubmitting(true);
      const res = await authenticatedFetch(getApiUrl(`/masked-locations/${id}`), {
        method: "DELETE",
      });

      if (res.ok) {
        setLocations(locations.filter((loc) => loc.id !== id));
        if (Platform.OS === "web") {
          window.alert("削除しました");
        } else {
          Alert.alert("成功", "削除しました");
        }
      } else {
        const error = await res.json();
        throw new Error(error.error || "削除に失敗しました");
      }
    } catch (e: any) {
      console.error("Delete location error:", e);
      if (Platform.OS === "web") {
        window.alert(`エラー\n\n${e.message || "削除に失敗しました"}`);
      } else {
        Alert.alert("エラー", e.message || "削除に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
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
        <Text style={styles.title}>出発地・到着地マスク設定</Text>
        <Text style={styles.description}>
          共有ページでマスクしたい駅名を設定します。設定した駅名は「***」として表示されます。
        </Text>

        {/* 追加フォーム */}
        <View style={styles.addSection}>
          <Text style={styles.sectionTitle}>新規追加</Text>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={newLocationName}
              onChangeText={setNewLocationName}
              placeholder="駅名を入力"
              placeholderTextColor={colors.muted}
              editable={!submitting}
            />
            <TouchableOpacity
              style={[styles.addButton, submitting && styles.buttonDisabled]}
              onPress={handleAdd}
              disabled={submitting}
            >
              <Text style={styles.addButtonText}>追加</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 一覧 */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>設定済み駅名</Text>
          {locations.length === 0 ? (
            <Text style={styles.emptyText}>設定がありません</Text>
          ) : (
            locations.map((location) => (
              <View key={location.id} style={styles.listItem}>
                {editingId === location.id ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.input}
                      value={editingName}
                      onChangeText={setEditingName}
                      editable={!submitting}
                    />
                    <TouchableOpacity
                      style={[styles.saveButton, submitting && styles.buttonDisabled]}
                      onPress={() => handleSaveEdit(location.id)}
                      disabled={submitting}
                    >
                      <Text style={styles.saveButtonText}>保存</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.cancelButton, submitting && styles.buttonDisabled]}
                      onPress={handleCancelEdit}
                      disabled={submitting}
                    >
                      <Text style={styles.cancelButtonText}>キャンセル</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.itemRow}>
                    <Text style={styles.locationName}>{location.location_name}</Text>
                    <View style={styles.buttonRow}>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => handleEdit(location)}
                        disabled={submitting}
                      >
                        <Text style={styles.editButtonText}>編集</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDelete(location.id, location.location_name)}
                        disabled={submitting}
                      >
                        <Text style={styles.deleteButtonText}>削除</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <AppTabBar active="archive" homePath="/" archivePath={`/year/${new Date().getFullYear()}`} />
    </View>
  );
}

const getStyles = (colors: ThemeColors, scheme: SchemeKey) => StyleSheet.create({
  container: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    color: colors.ink,
  },
  description: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 24,
    lineHeight: 20,
  },
  addSection: {
    marginBottom: 32,
  },
  listSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: colors.ink,
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  addButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: "center",
  },
  addButtonText: {
    color: colors.accentContrastText,
    fontSize: 16,
    fontWeight: "600",
  },
  listItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  editRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  locationName: {
    fontSize: 16,
    color: colors.ink,
    flex: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  editButtonText: {
    color: colors.ink,
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: scheme === "dark" ? "rgba(220,38,38,0.16)" : "#FEF2F2",
    borderWidth: 1,
    borderColor: scheme === "dark" ? "rgba(220,38,38,0.35)" : "#FECACA",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  deleteButtonText: {
    color: scheme === "dark" ? "#F87171" : "#DC2626",
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: scheme === "dark" ? "rgba(16,185,129,0.18)" : "#ECFDF5",
    borderWidth: 1,
    borderColor: scheme === "dark" ? "rgba(16,185,129,0.4)" : "#A7F3D0",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saveButtonText: {
    color: scheme === "dark" ? "#34D399" : "#059669",
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cancelButtonText: {
    color: colors.ink,
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    padding: 24,
  },
});

