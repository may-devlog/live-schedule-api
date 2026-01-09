// 往復フラグを考慮した総費用を計算する共通ロジック

import type { Schedule } from "../app/HomeScreen";

export type TrafficInfo = {
  fare: number;
  return_flag: boolean;
};

export type TrafficBySchedule = Map<number, TrafficInfo[]>;

/**
 * 往復フラグを考慮した総費用を計算
 * @param schedule スケジュール情報
 * @param trafficBySchedule スケジュールIDをキーとした交通情報のMap
 * @returns 往復フラグを考慮した総費用（交通情報がない場合は既存のtotal_costを返す）
 */
export function calculateTotalCostWithReturnFlag(
  schedule: Schedule,
  trafficBySchedule: Map<number, TrafficInfo[]>
): number | null {
  if (!schedule.total_cost) return null;
  
  // 交通情報を取得
  const traffics = trafficBySchedule.get(schedule.id);
  if (!traffics || traffics.length === 0) {
    // 交通情報がない場合は、既存のtotal_costをそのまま返す
    return schedule.total_cost;
  }
  
  // 往復フラグを考慮した交通費を計算
  const trafficCostWithReturn = traffics.reduce((sum, traffic) => {
    return sum + (traffic.return_flag ? traffic.fare * 2 : traffic.fare);
  }, 0);
  
  // 既存のtotal_costから、元のtotal_fareを引いて、新しいtrafficCostWithReturnを足す
  // total_cost = ticket_fee + drink_fee + travel_cost
  // travel_cost = total_fare + stay_fee
  // つまり、total_cost = ticket_fee + drink_fee + total_fare + stay_fee
  const ticketFee = schedule.ticket_fee || 0;
  const drinkFee = schedule.drink_fee || 0;
  const stayFee = schedule.stay_fee || 0;
  const originalTotalFare = schedule.total_fare || 0;
  
  // 新しいtotal_cost = ticket_fee + drink_fee + (trafficCostWithReturn) + stay_fee
  const newTotalCost = ticketFee + drinkFee + trafficCostWithReturn + stayFee;
  
  return newTotalCost;
}

