// 出演者名などの読み仮名（ひらがな）をバックエンド経由で解決し、
// 真の五十音順でソートするための共通ロジック。
// バックエンド側で「手動修正ファイル → キャッシュ → AI解決」の順に解決するため、
// このモジュールはAPIを呼ぶだけで、キャッシュそのものはバックエンドに任せている。

import { authenticatedFetch, getApiUrl } from "./api";
import type { SelectOption } from "../types/select-option";

// アプリのセッション内で読み仮名をメモリキャッシュし、同じ名前について
// 何度もAPIを呼ばないようにする。
const readingCache = new Map<string, string>();

// 指定したラベル群の読み仮名を解決する。既にキャッシュ済みのラベルはAPIを呼ばず、
// 未解決のラベルだけまとめて /reading に問い合わせる。
export async function fetchReadings(labels: string[]): Promise<Map<string, string>> {
  const uniqueLabels = Array.from(
    new Set(labels.filter((label) => label && label.trim() !== ""))
  );
  const missing = uniqueLabels.filter((label) => !readingCache.has(label));

  if (missing.length > 0) {
    try {
      const res = await authenticatedFetch(getApiUrl("/reading"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: missing }),
      });
      if (res.ok) {
        const data = await res.json();
        const readings: Record<string, string> = data.readings ?? {};
        for (const [name, reading] of Object.entries(readings)) {
          readingCache.set(name, reading);
        }
      } else {
        console.error("[fetchReadings] API returned status", res.status);
      }
    } catch (error) {
      console.error("[fetchReadings] Failed to resolve readings:", error);
    }
  }

  return readingCache;
}

// 読み仮名（ひらがな）で2つのラベルを比較する。解決できていないラベルは
// 元の文字列で比較する（未解決分は従来のlocaleCompare相当にフォールバックする）。
export function compareByReading(
  labelA: string,
  labelB: string,
  readings: Map<string, string>
): number {
  const readingA = readings.get(labelA) ?? labelA;
  const readingB = readings.get(labelB) ?? labelB;
  return readingA.localeCompare(readingB, "ja");
}

// SelectOption配列を読み仮名の五十音順でソートする（AI解決込み）。
export async function sortByKanaOrder(
  options: SelectOption[]
): Promise<SelectOption[]> {
  const readings = await fetchReadings(options.map((option) => option.label));
  return [...options].sort((a, b) => compareByReading(a.label, b.label, readings));
}
