// Areaの色情報を取得する共通ロジック

import type { Schedule } from "../app/HomeScreen";
import { getOptionColor } from "./get-option-color";

export async function fetchAreaColors(
  schedules: Schedule[]
): Promise<Map<number, string>> {
  const uniqueAreas = Array.from(new Set(schedules.map((schedule) => schedule.area).filter(Boolean))) as string[];
  const colorsByArea = new Map(
    await Promise.all(uniqueAreas.map(async (area) => [area, await getOptionColor(area, "AREAS")] as const))
  );
  const colorMap = new Map<number, string>();
  for (const schedule of schedules) {
    if (schedule.area) {
      colorMap.set(schedule.id, colorsByArea.get(schedule.area)!);
    }
  }
  return colorMap;
}
