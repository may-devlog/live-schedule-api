// Areaの色情報を取得する共通ロジック

import type { Schedule } from "../app/HomeScreen";
import { getOptionColor } from "./get-option-color";

export async function fetchAreaColors(
  schedules: Schedule[]
): Promise<Map<number, string>> {
  const colorMap = new Map<number, string>();
  for (const schedule of schedules) {
    if (schedule.area) {
      const color = await getOptionColor(schedule.area, "AREAS");
      colorMap.set(schedule.id, color);
    }
  }
  return colorMap;
}

