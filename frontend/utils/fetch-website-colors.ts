// 予約サイトの色情報を取得する共通ロジック

import type { Stay } from "./group-stays";
import { getOptionColor } from "./get-option-color";

export async function fetchWebsiteColors(
  stays: Stay[]
): Promise<Map<string, string>> {
  const colorMap = new Map<string, string>();
  const uniqueWebsites = new Set<string>();
  
  // ユニークな予約サイトを収集
  stays.forEach((stay) => {
    if (stay.website) {
      uniqueWebsites.add(stay.website);
    }
  });
  
  // 並列で色を取得
  const colorPromises = Array.from(uniqueWebsites).map(async (website) => {
    const color = await getOptionColor(website, "WEBSITE");
    return { website, color };
  });
  
  const results = await Promise.all(colorPromises);
  results.forEach(({ website, color }) => {
    colorMap.set(website, color);
  });
  
  return colorMap;
}

