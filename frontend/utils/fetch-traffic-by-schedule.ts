// スケジュールの交通情報を並列取得する共通ロジック

import { authenticatedFetch, getApiUrl } from "./api";
import type { TrafficInfo } from "./calculate-total-cost";

type Schedule = {
  id: number;
};

/**
 * スケジュールの交通情報を並列取得
 * @param schedules スケジュールの配列
 * @param isAuthenticated 認証済みかどうか（trueの場合はauthenticatedFetchを使用）
 * @param shareId 共有ページ用のshare_id（オプション、認証済みでない場合のみ使用）
 * @returns スケジュールIDをキーとした交通情報のMap
 */
export async function fetchTrafficBySchedule(
  schedules: Schedule[],
  isAuthenticated: boolean = true,
  shareId?: string
): Promise<Map<number, TrafficInfo[]>> {
  const trafficMap = new Map<number, TrafficInfo[]>();
  if (schedules.length === 0) return trafficMap;

  try {
    const response = isAuthenticated
      ? await authenticatedFetch(getApiUrl('/traffic/all'))
      : await fetch(getApiUrl(`/share/${shareId}/traffic`));
    if (!response.ok) return trafficMap;

    const scheduleIds = new Set(schedules.map((schedule) => schedule.id));
    const traffics: (TrafficInfo & { schedule_id: number })[] = await response.json();
    traffics.forEach((traffic) => {
      if (!scheduleIds.has(traffic.schedule_id)) return;
      const current = trafficMap.get(traffic.schedule_id) ?? [];
      current.push(traffic);
      trafficMap.set(traffic.schedule_id, current);
    });
  } catch (error) {
    console.error('Error fetching archive traffic:', error);
  }
  return trafficMap;
}
