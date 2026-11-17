import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme, type ThemeColors } from "../contexts/ThemeContext";
import { authenticatedFetch, getApiUrl } from "../utils/api";
import type { SelectOption } from "../types/select-option";

type ImportPreview = {
  title: string | null;
  date: string | null;
  open: string | null;
  start: string | null;
  end: string | null;
  area: string | null;
  venue: string | null;
  warnings: string[];
  source_type: "url" | "image";
};

type Props = {
  areas: SelectOption[];
  onApply: (preview: ImportPreview & { area: string | null }) => void;
};

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const IMAGE_MIME_BY_EXTENSION: Record<string, typeof ALLOWED_IMAGE_MIME_TYPES[number]> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

function resolveAllowedImageMimeType(mimeType?: string | null, fileName?: string | null) {
  const normalizedMimeType = mimeType?.toLowerCase();
  if (normalizedMimeType && ALLOWED_IMAGE_MIME_TYPES.includes(normalizedMimeType as typeof ALLOWED_IMAGE_MIME_TYPES[number])) {
    return normalizedMimeType as typeof ALLOWED_IMAGE_MIME_TYPES[number];
  }
  if (!normalizedMimeType && fileName) {
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    return IMAGE_MIME_BY_EXTENSION[extension] || null;
  }
  return null;
}

const labels: { key: keyof Pick<ImportPreview, "title" | "date" | "open" | "start" | "end" | "area" | "venue">; label: string }[] = [
  { key: "title", label: "タイトル" },
  { key: "date", label: "日付" },
  { key: "open", label: "開場" },
  { key: "start", label: "開演" },
  { key: "end", label: "終演" },
  { key: "area", label: "エリア" },
  { key: "venue", label: "会場" },
];

function showError(message: string) {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("自動入力", message);
}

export function ScheduleImportCard({ areas, onApply }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [sourceType, setSourceType] = useState<"url" | "image">("url");
  const [url, setUrl] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const dropZoneRef = useRef<any>(null);

  const setSelectedImage = useCallback((dataUrl: string, fileName: string | null) => {
    const dataUrlMimeType = dataUrl.match(/^data:([^;,]+);base64,/)?.[1]?.toLowerCase();
    if (!resolveAllowedImageMimeType(dataUrlMimeType, fileName)) {
      throw new Error("JPEG、PNG、WebP、GIF画像のみ使用できます");
    }
    if (dataUrl.length > 7_100_000) throw new Error("画像サイズは5MB以下にしてください");
    setImageDataUrl(dataUrl);
    setImageName(fileName || "選択した画像");
    setPreview(null);
  }, []);

  const pickImage = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, base64: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error("画像を読み込めませんでした");
      const mimeType = resolveAllowedImageMimeType(asset.mimeType, asset.fileName);
      if (!mimeType) throw new Error("JPEG、PNG、WebP、GIF画像のみ使用できます");
      const dataUrl = `data:${mimeType};base64,${asset.base64}`;
      setSelectedImage(dataUrl, asset.fileName || null);
    } catch (error: any) {
      showError(error.message || "画像を読み込めませんでした");
    }
  };

  const readDroppedFile = useCallback((file?: File) => {
    if (!file) return;
    if (!resolveAllowedImageMimeType(file.type, file.name)) return showError("JPEG、PNG、WebP、GIF画像のみ使用できます");
    if (file.size > 5 * 1024 * 1024) return showError("画像サイズは5MB以下にしてください");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (typeof reader.result !== "string") throw new Error("画像を読み込めませんでした");
        setSelectedImage(reader.result, file.name);
      } catch (error: any) {
        showError(error.message || "画像を読み込めませんでした");
      }
    };
    reader.onerror = () => showError("画像を読み込めませんでした");
    reader.readAsDataURL(file);
  }, [setSelectedImage]);

  useEffect(() => {
    if (Platform.OS !== "web" || sourceType !== "image") return;
    const dropZone = dropZoneRef.current as HTMLElement | null;
    if (!dropZone?.addEventListener) return;

    let dragDepth = 0;
    const containsFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes("Files");
    const handleDragEnter = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setIsDragging(true);
    };
    const handleDragOver = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setIsDragging(false);
    };
    const handleDrop = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth = 0;
      setIsDragging(false);
      readDroppedFile(event.dataTransfer?.files?.[0]);
    };

    dropZone.addEventListener("dragenter", handleDragEnter);
    dropZone.addEventListener("dragover", handleDragOver);
    dropZone.addEventListener("dragleave", handleDragLeave);
    dropZone.addEventListener("drop", handleDrop);
    return () => {
      dropZone.removeEventListener("dragenter", handleDragEnter);
      dropZone.removeEventListener("dragover", handleDragOver);
      dropZone.removeEventListener("dragleave", handleDragLeave);
      dropZone.removeEventListener("drop", handleDrop);
    };
  }, [readDroppedFile, sourceType]);

  const analyze = async () => {
    if (sourceType === "url" && !url.trim()) return showError("URLを入力してください");
    if (sourceType === "image" && !imageDataUrl) return showError("画像を選択してください");
    try {
      setLoading(true);
      setPreview(null);
      const res = await authenticatedFetch(getApiUrl("/schedule-import/preview"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: sourceType, url: sourceType === "url" ? url.trim() : null, image_data_url: sourceType === "image" ? imageDataUrl : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error === "premium_required" ? "自動入力はプレミアムプラン限定の機能です" : data.error || "情報を読み取れませんでした");
      setPreview(data as ImportPreview);
    } catch (error: any) {
      showError(error.message || "情報を読み取れませんでした");
    } finally {
      setLoading(false);
    }
  };

  const applyPreview = () => {
    if (!preview) return;
    const normalized = preview.area?.replace(/[都道府県]$/, "") || null;
    const matchedArea = normalized
      ? areas.find((option) => option.label.replace(/[都道府県]$/, "") === normalized)?.label || null
      : null;
    if (preview.area && !matchedArea) {
      showError(`エリア「${preview.area}」は選択肢にないため、エリア以外を反映します。エリアは手動で選択してください。`);
    }
    onApply({ ...preview, area: matchedArea });
  };

  const foundCount = preview ? labels.filter(({ key }) => preview[key]).length : 0;

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconCircle}><Ionicons name="sparkles-outline" size={20} color={colors.accent} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>URLまたは画像から自動入力</Text>
          <Text style={styles.description}>イベント情報を解析し、入力候補を作成します。</Text>
        </View>
      </View>
      <View style={styles.tabs}>
        {(["url", "image"] as const).map((type) => (
          <TouchableOpacity key={type} style={[styles.tab, sourceType === type && styles.tabActive]} onPress={() => { setSourceType(type); setPreview(null); }}>
            <Ionicons name={type === "url" ? "link-outline" : "image-outline"} size={16} color={sourceType === type ? colors.accentContrastText : colors.muted} />
            <Text style={[styles.tabText, sourceType === type && styles.tabTextActive]}>{type === "url" ? "URL" : "画像"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {sourceType === "url" ? (
        <TextInput style={styles.input} value={url} onChangeText={(value) => { setUrl(value); setPreview(null); }} placeholder="https://example.com/event" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      ) : (
        <View ref={dropZoneRef} style={[styles.imagePicker, isDragging && styles.imagePickerDragging]}>
          <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
            {imageDataUrl ? <Image source={{ uri: imageDataUrl }} style={styles.thumbnail} /> : <View style={styles.imagePlaceholder}><Ionicons name="cloud-upload-outline" size={27} color={colors.accent} /></View>}
            <View style={styles.imageCopy}><Text style={styles.imageTitle}>{imageName || (Platform.OS === "web" ? "クリックまたはドラッグ＆ドロップ" : "スクリーンショットを選択")}</Text><Text style={styles.imageHint}>JPEG・PNG・WebP・GIF、5MBまで</Text></View>
            <Text style={styles.chooseText}>{imageDataUrl ? "変更" : "選択"}</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity style={[styles.analyzeButton, loading && styles.disabled]} onPress={analyze} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.accentContrastText} /> : <><Ionicons name="sparkles" size={17} color={colors.accentContrastText} /><Text style={styles.analyzeText}>情報を読み取る</Text></>}
      </TouchableOpacity>
      {preview && (
        <View style={styles.results}>
          <View style={styles.resultHeader}><Text style={styles.resultTitle}>{foundCount}項目を抽出しました</Text><Text style={styles.resultHint}>内容を確認してフォームに反映してください。</Text></View>
          <View style={styles.resultGrid}>
            {labels.map(({ key, label }) => (
              <View key={key} style={[styles.resultItem, key === "title" || key === "venue" ? styles.resultWide : null]}>
                <Text style={styles.resultLabel}>{label}</Text><Text style={[styles.resultValue, !preview[key] && styles.missing]} numberOfLines={2}>{preview[key] || "見つかりませんでした"}</Text>
              </View>
            ))}
          </View>
          {preview.warnings.length > 0 && <View style={styles.warning}><Ionicons name="alert-circle-outline" size={18} color="#C2410C" /><Text style={styles.warningText}>{preview.warnings.join("\n")}</Text></View>}
          <TouchableOpacity style={styles.applyButton} onPress={applyPreview}><Text style={styles.applyText}>フォームに反映</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 24, marginBottom: 20 },
  headingRow: { flexDirection: "row", alignItems: "center" },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginRight: 12 },
  headingCopy: { flex: 1 }, title: { color: colors.ink, fontSize: 17, fontWeight: "800" }, description: { color: colors.muted, fontSize: 12, marginTop: 3 },
  tabs: { flexDirection: "row", marginTop: 20, marginBottom: 14, gap: 8 },
  tab: { minWidth: 92, flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center", paddingVertical: 9, borderRadius: 18, backgroundColor: colors.accentSoft },
  tabActive: { backgroundColor: colors.accent }, tabText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, tabTextActive: { color: colors.accentContrastText },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.surface, fontSize: 14 },
  imagePicker: { minHeight: 72, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: 10 },
  imagePickerButton: { flex: 1, padding: 10, flexDirection: "row", alignItems: "center" },
  imagePickerDragging: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  imagePlaceholder: { width: 50, height: 50, borderRadius: 8, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }, thumbnail: { width: 50, height: 50, borderRadius: 8, resizeMode: "cover" },
  imageCopy: { flex: 1, marginHorizontal: 12 }, imageTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" }, imageHint: { color: colors.muted, fontSize: 11, marginTop: 4 }, chooseText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  analyzeButton: { marginTop: 14, minHeight: 46, borderRadius: 9, backgroundColor: colors.accent, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.6 }, analyzeText: { color: colors.accentContrastText, fontSize: 13, fontWeight: "700" },
  results: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 20, paddingTop: 18 }, resultHeader: { marginBottom: 12 }, resultTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" }, resultHint: { color: colors.muted, fontSize: 11, marginTop: 3 },
  resultGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, resultItem: { flexGrow: 1, flexBasis: 130, minWidth: 120, backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: 11 }, resultWide: { flexBasis: "100%" }, resultLabel: { color: colors.muted, fontSize: 10, marginBottom: 3 }, resultValue: { color: colors.ink, fontSize: 13 }, missing: { color: colors.muted, fontStyle: "italic" },
  warning: { marginTop: 12, padding: 11, backgroundColor: "#FFF7ED", borderRadius: 8, flexDirection: "row", alignItems: "flex-start", gap: 8 }, warningText: { color: "#9A3412", fontSize: 11, lineHeight: 17, flex: 1 },
  applyButton: { marginTop: 14, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: colors.accent, alignItems: "center", justifyContent: "center" }, applyText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
});
