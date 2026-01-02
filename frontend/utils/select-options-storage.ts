// 選択肢の永続化ユーティリティ
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SelectOption } from "../types/select-option";
import {
  stringArrayToOptions,
  optionsToStringArray,
  getDefaultColorForLabel,
} from "../types/select-option";
import { authenticatedFetch, getApiUrl } from "./api";

const STORAGE_KEYS = {
  CATEGORIES: "@select_options:categories",
  AREAS: "@select_options:areas",
  TARGETS: "@select_options:targets",
  SELLERS: "@select_options:sellers",
  STATUSES: "@select_options:statuses",
  TRANSPORTATIONS: "@select_options:transportations",
} as const;

// デフォルトの選択肢（文字列配列）
const DEFAULT_CATEGORIES = ["ワンマン", "対バン", "フェス", "イベント", "舞台", "その他"];
// 47都道府県の標準順
const DEFAULT_AREAS = [
  "北海道",
  "青森", "岩手", "宮城", "秋田", "山形", "福島",
  "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
  "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜",
  "静岡", "愛知", "三重", "滋賀", "京都", "大阪", "兵庫",
  "奈良", "和歌山", "鳥取", "島根", "岡山", "広島", "山口",
  "徳島", "香川", "愛媛", "高知", "福岡", "佐賀", "長崎",
  "熊本", "大分", "宮崎", "鹿児島", "沖縄"
];
const DEFAULT_TARGETS: string[] = [];
const DEFAULT_SELLERS = ["チケットぴあ", "イープラス", "ローチケ", "その他"];
const DEFAULT_STATUSES = ["Canceled", "Pending", "Keep", "Done"];
const DEFAULT_TRANSPORTATIONS = ["🚄 新幹線", "✈️ 飛行機", "🚃 在来線", "🚌 バス", "🚗 車", "🚕 タクシー", "その他"];

// 選択肢を読み込む（データベース優先、フォールバックはローカルストレージ）
export async function loadSelectOptions(
  key: keyof typeof STORAGE_KEYS
): Promise<SelectOption[]> {
  try {
    // まずデータベースから読み込む
    try {
      const res = await authenticatedFetch(getApiUrl(`/select-options/${key.toLowerCase()}`));
      if (res.ok) {
        const options: SelectOption[] = await res.json();
        if (options.length > 0) {
          // データベースに保存されている場合は、ローカルストレージにも保存（キャッシュ）
          await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(options));
          return options;
        }
      }
    } catch (error) {
      console.log(`[SelectOptions] Failed to load from database, falling back to local storage:`, error);
    }

    // データベースにない場合は、ローカルストレージから読み込む
    const stored = await AsyncStorage.getItem(STORAGE_KEYS[key]);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 既存のデータが文字列配列の場合は変換
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === "string") {
          // AREASの場合は都道府県として扱う
          // CATEGORIESの場合はカテゴリとして扱う
          // SELLERSの場合はSellerとして扱う
          const isPrefecture = key === "AREAS";
          const isCategory = key === "CATEGORIES";
          const isSeller = key === "SELLERS";
          return stringArrayToOptions(parsed, undefined, isPrefecture, isCategory, isSeller);
        }
        // 既存のSelectOption配列の場合、AREASの場合は色を再計算し、不足している都道府県を追加
        if (key === "AREAS") {
          const existingOptions = (parsed as SelectOption[]).map((opt) => ({
            ...opt,
            color: opt.color || getDefaultColorForLabel(opt.label, true, false),
          }));
          // デフォルトの都道府県リストと比較して、不足している都道府県を追加
          const existingLabels = new Set(existingOptions.map((opt) => opt.label));
          const missingPrefectures = DEFAULT_AREAS.filter(
            (pref) => !existingLabels.has(pref)
          );
          if (missingPrefectures.length > 0) {
            const missingOptions = stringArrayToOptions(
              missingPrefectures,
              undefined,
              true,
              false
            );
            return [...existingOptions, ...missingOptions];
          }
          return existingOptions;
        }
        // 既存のSelectOption配列の場合、CATEGORIESの場合は色を再計算
        if (key === "CATEGORIES") {
          return (parsed as SelectOption[]).map((opt) => ({
            ...opt,
            color: opt.color || getDefaultColorForLabel(opt.label, false, true, false),
          }));
        }
        // 既存のSelectOption配列の場合、SELLERSの場合は色を再計算
        // また、「ローソンチケット」を「ローチケ」に変換
        if (key === "SELLERS") {
          const updatedOptions = (parsed as SelectOption[]).map((opt) => {
            // 「ローソンチケット」を「ローチケ」に変換
            let label = opt.label;
            if (label === "ローソンチケット") {
              label = "ローチケ";
            }
            return {
              ...opt,
              label,
              color: opt.color || getDefaultColorForLabel(label, false, false, true),
            };
          });
          // 重複を除去（変換後のラベルで）
          const uniqueOptions = Array.from(
            new Map(updatedOptions.map(opt => [opt.label, opt])).values()
          );
          // 変更があった場合は保存
          const hasChanges = parsed.some((opt: SelectOption, idx: number) => 
            opt.label !== uniqueOptions[idx]?.label
          ) || uniqueOptions.length !== parsed.length;
          if (hasChanges) {
            await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(uniqueOptions));
          }
          return uniqueOptions;
        }
        // 既存のSelectOption配列の場合、TARGETSの場合は「Band B」「Band C」を「Artist B」「Artist C」に変換
        if (key === "TARGETS") {
          const existingOptions = (parsed as SelectOption[]).map((opt) => {
            // Band B, Band CをArtist B, Artist Cに変換
            let label = opt.label;
            if (label === "Band B") label = "Artist B";
            if (label === "Band C") label = "Artist C";
            return {
              ...opt,
              label,
              color: opt.color || getDefaultColorForLabel(label, false, false, false),
            };
          });
          // 重複を除去（変換後のラベルで）
          const uniqueOptions = Array.from(
            new Map(existingOptions.map(opt => [opt.label, opt])).values()
          );
          // 変更があった場合は保存（Band B/Cの変換があった場合）
          const hasChanges = parsed.some((opt: SelectOption, idx: number) => 
            opt.label !== uniqueOptions[idx]?.label
          );
          if (hasChanges) {
            await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(uniqueOptions));
          }
          return uniqueOptions;
        }
        // TRANSPORTATIONSの場合は、色が設定されていない場合のみデフォルトで薄いグレーに
        if (key === "TRANSPORTATIONS") {
          return (parsed as SelectOption[]).map((opt) => ({
            ...opt,
            color: opt.color || "#E5E7EB", // 色が設定されていない場合のみ薄いグレー（デフォルト）
          }));
        }
        return parsed as SelectOption[];
      }
    }
  } catch (error) {
    console.error(`Error loading ${key}:`, error);
  }

  // デフォルト値を返す
  const defaults: Record<keyof typeof STORAGE_KEYS, string[]> = {
    CATEGORIES: DEFAULT_CATEGORIES,
    AREAS: DEFAULT_AREAS,
    TARGETS: DEFAULT_TARGETS,
    SELLERS: DEFAULT_SELLERS,
    STATUSES: DEFAULT_STATUSES,
    TRANSPORTATIONS: DEFAULT_TRANSPORTATIONS,
  };
  // AREASの場合は都道府県として扱う
  // CATEGORIESの場合はカテゴリとして扱う
  // SELLERSの場合はSellerとして扱う
  // TRANSPORTATIONSの場合はデフォルトで薄いグレーに（カスタマイズ可能）
  const isPrefecture = key === "AREAS";
  const isCategory = key === "CATEGORIES";
  const isSeller = key === "SELLERS";
  const options = stringArrayToOptions(defaults[key], undefined, isPrefecture, isCategory, isSeller);
  if (key === "TRANSPORTATIONS") {
    return options.map((opt) => ({
      ...opt,
      color: opt.color || "#E5E7EB", // 色が設定されていない場合のみ薄いグレー（デフォルト）
    }));
  }
  return options;
}

// 選択肢を保存する（データベースに保存し、成功した場合のみローカルストレージにも保存）
export async function saveSelectOptions(
  key: keyof typeof STORAGE_KEYS,
  options: SelectOption[]
): Promise<void> {
  // まずデータベースに保存
  const url = getApiUrl(`/select-options/${key.toLowerCase()}`);
  const payload = { options };
  console.log(`[SelectOptions] Saving ${key} to database:`, url);
  console.log(`[SelectOptions] Payload:`, JSON.stringify(payload, null, 2));
  
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  console.log(`[SelectOptions] Response status:`, res.status);
  console.log(`[SelectOptions] Response headers:`, Object.fromEntries(res.headers.entries()));
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[SelectOptions] Failed to save ${key} to database:`, res.status, errorText);
    throw new Error(`Failed to save ${key} to database: ${res.status} ${errorText}`);
  }
  
  // データベースへの保存が成功した場合のみ、ローカルストレージにも保存（キャッシュ）
  const result = await res.json();
  console.log(`[SelectOptions] Successfully saved ${key} to database:`, result);
  
  // データベースへの保存が成功した場合のみ、ローカルストレージにも保存
  await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(options));
  console.log(`[SelectOptions] Saved ${key} to local storage`);
}

