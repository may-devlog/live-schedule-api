// 選択肢の色情報を取得するユーティリティ
import type { SelectOption } from "../types/select-option";
import { getDefaultColorForLabel } from "../types/select-option";
import { loadSelectOptions, loadStaySelectOptions } from "./select-options-storage";

// キャッシュ用
const colorCache: Record<string, string> = {};

// 選択肢の色を取得（非同期）
export async function getOptionColor(
  label: string,
  optionType: "CATEGORIES" | "AREAS" | "TARGETS" | "SELLERS" | "STATUSES" | "TRANSPORTATIONS" | "WEBSITE"
): Promise<string> {
  const cacheKey = `${optionType}:${label}`;
  if (colorCache[cacheKey]) {
    return colorCache[cacheKey];
  }

  try {
    let options: SelectOption[];
    if (optionType === "WEBSITE") {
      // WEBSITEはSTAY_STORAGE_KEYSに属するため、loadStaySelectOptionsを使用
      options = await loadStaySelectOptions("WEBSITE");
    } else {
      options = await loadSelectOptions(optionType);
    }
    const option = options.find((opt) => opt.label === label);
    // AREASの場合は都道府県として扱う
    // CATEGORIESの場合はカテゴリとして扱う
    const isPrefecture = optionType === "AREAS";
    const isCategory = optionType === "CATEGORIES";
    const color = option?.color || getDefaultColorForLabel(label, isPrefecture, isCategory);
    colorCache[cacheKey] = color;
    return color;
  } catch (error) {
    console.error(`Error getting color for ${label}:`, error);
    const isPrefecture = optionType === "AREAS";
    const isCategory = optionType === "CATEGORIES";
    return getDefaultColorForLabel(label, isPrefecture, isCategory);
  }
}

// 同期版（キャッシュから取得、なければデフォルト色）
export function getOptionColorSync(label: string, optionType?: "CATEGORIES" | "AREAS" | "TARGETS" | "SELLERS" | "STATUSES" | "TRANSPORTATIONS" | "WEBSITE"): string {
  // キャッシュから探す
  if (optionType) {
    const cacheKey = `${optionType}:${label}`;
    if (colorCache[cacheKey]) {
      return colorCache[cacheKey];
    }
  } else {
    for (const [key, color] of Object.entries(colorCache)) {
      if (key.endsWith(`:${label}`)) {
        return color;
      }
    }
  }
  // キャッシュになければデフォルト色
  const isPrefecture = optionType === "AREAS";
  const isCategory = optionType === "CATEGORIES";
  return getDefaultColorForLabel(label, isPrefecture, isCategory);
}

