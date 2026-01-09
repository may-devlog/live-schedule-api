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
  // 各スケジュールの交通情報を並列で取得
  const trafficPromises = schedules.map(async (schedule) => {
    try {
      let trafficRes: Response;
      if (isAuthenticated) {
        trafficRes = await authenticatedFetch(getApiUrl(`/traffic?schedule_id=${schedule.id}`));
      } else {
        // 共有ページ用
        trafficRes = await fetch(getApiUrl(`/public/traffic?schedule_id=${schedule.id}`));
      }
      
      if (trafficRes.ok) {
        const trafficList: TrafficInfo[] = await trafficRes.json();
        return { scheduleId: schedule.id, trafficList };
      }
      return { scheduleId: schedule.id, trafficList: [] };
    } catch (e) {
      console.error(`Error fetching traffic for schedule ${schedule.id}:`, e);
      return { scheduleId: schedule.id, trafficList: [] };
    }
  });
  
  const trafficResults = await Promise.all(trafficPromises);
  const trafficMap = new Map<number, TrafficInfo[]>();
  trafficResults.forEach(({ scheduleId, trafficList }) => {
    if (trafficList.length > 0) {
      trafficMap.set(scheduleId, trafficList);
    }
  });
  
  return trafficMap;
}

