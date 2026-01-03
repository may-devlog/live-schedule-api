// app/public/[id].tsx - 公開ページ（閲覧専用）
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { getApiUrl } from "../../utils/api";
import { NotionProperty, NotionPropertyBlock } from "../../components/notion-property";
import { NotionTag } from "../../components/notion-tag";
import { getOptionColor } from "../../utils/get-option-color";
import { loadSelectOptions } from "../../utils/select-options-storage";
import type { Schedule } from "../HomeScreen";
import { maskHotelName } from "../../utils/mask-hotel-name";

type TrafficSummary = {
  id: number;
  schedule_id: number;
  date: string;
  order: number;
  transportation?: string | null;
  from: string;
  to: string;
  notes?: string | null;
  fare: number;
  miles?: number | null;
  return_flag: boolean;
  total_fare?: number | null;
  total_miles?: number | null;
};

type StaySummary = {
  id: number;
  schedule_id: number;
  check_in: string;
  check_out: string;
  hotel_name: string;
  fee: number;
  breakfast_flag: boolean;
  deadline?: string | null;
  penalty?: number | null;
  status: string;
};

export default function PublicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [trafficSummaries, setTrafficSummaries] = useState<TrafficSummary[]>([]);
  const [staySummaries, setStaySummaries] = useState<StaySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 選択肢の色情報
  const [categoryColor, setCategoryColor] = useState<string | null>(null);
  const [areaColor, setAreaColor] = useState<string | null>(null);
  const [targetColor, setTargetColor] = useState<string | null>(null);
  const [sellerColor, setSellerColor] = useState<string | null>(null);
  const [statusColor, setStatusColor] = useState<string | null>(null);
  const [targetOptions, setTargetOptions] = useState<any[]>([]);
  const [lineupOptions, setLineupOptions] = useState<Array<{ label: string; color: string }>>([]);

  useEffect(() => {
    if (!id) return;

    const fetchDetail = async () => {
      try {
        setLoading(true);
        setError(null);

        // 公開スケジュールを取得（認証不要）
        const res = await fetch(getApiUrl(`/public/schedules/${id}`));
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("公開されていないスケジュールです");
          }
          throw new Error(`status: ${res.status}`);
        }
        const found: Schedule = await res.json();
        setSchedule(found);

        await fetchTrafficAndStay(found.id);
        
        // TargetとLineupの選択肢を読み込んでフィルタリング
        const targets = await loadSelectOptions("TARGETS");
        const targetOptionLabels = targets.map(opt => opt.label);
        
        // Target: 選択肢に存在する場合のみ表示
        let targetColor: string = "#E5E7EB"; // デフォルト色
        if (found.target && targetOptionLabels.includes(found.target)) {
          // 選択肢に存在する場合は色情報を取得
          const targetOption = targets.find(opt => opt.label === found.target);
          if (targetOption) {
            targetColor = targetOption.color || "#E5E7EB";
          }
        }
        setTargetColor(targetColor);
        
        // Lineup: 選択肢に存在する値のみ表示
        let validLineupOptions: Array<{ label: string; color: string }> = [];
        if (found.lineup) {
          const lineupValues = found.lineup.split(",").map(v => v.trim()).filter(v => v);
          
          // 選択肢に存在する値のみ処理
          validLineupOptions = await Promise.all(
            lineupValues
              .filter(label => targetOptionLabels.includes(label))
              .map(async (label) => {
                // 選択肢に存在する場合は色情報を取得
                const option = targets.find(opt => opt.label === label);
                return {
                  label,
                  color: option?.color || "#E5E7EB"
                };
              })
          );
        }
        setLineupOptions(validLineupOptions);
        
        // 選択肢の色情報を取得
        if (found.category) {
          const color = await getOptionColor(found.category, "CATEGORIES");
          setCategoryColor(color);
        }
        if (found.area) {
          const color = await getOptionColor(found.area, "AREAS");
          setAreaColor(color);
        }
        if (found.seller) {
          const color = await getOptionColor(found.seller, "SELLERS");
          setSellerColor(color);
        }
        if (found.status) {
          const color = await getOptionColor(found.status, "STATUSES");
          setStatusColor(color);
        }
      } catch (e: any) {
        setError(e.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  const fetchTrafficAndStay = async (scheduleId: number) => {
    // Traffic 一覧（schedule_id ごと）
    try {
      const res = await fetch(getApiUrl(`/public/traffic?schedule_id=${scheduleId}`));
      if (res.ok) {
        const list: TrafficSummary[] = await res.json();
        // DateとOrderでソート
        list.sort((a, b) => {
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          return a.order - b.order;
        });
        setTrafficSummaries(list);
      }
    } catch {
      // とりあえず無視
    }

    // Stay 一覧（schedule_id ごと）
    try {
      const res = await fetch(getApiUrl(`/public/stay?schedule_id=${scheduleId}`));
      if (res.ok) {
        const list: StaySummary[] = await res.json();
        setStaySummaries(list);
      }
    } catch {
      // 無視
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#333333" />
      </View>
    );
  }

  if (error || !schedule) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error || "スケジュールが見つかりません"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{schedule.title}</Text>

        <NotionPropertyBlock label="Event Info">
          {schedule.date && (
            <NotionProperty label="Date" value={schedule.date} />
          )}
          {schedule.open && (
            <NotionProperty label="Open" value={schedule.open} />
          )}
          {schedule.start && (
            <NotionProperty label="Start" value={schedule.start} />
          )}
          {schedule.end && (
            <NotionProperty label="End" value={schedule.end} />
          )}
          {schedule.notes && (
            <NotionProperty label="Notes" value={schedule.notes} />
          )}
          {schedule.category && (
            <NotionProperty
              label="Category"
              value={
                <NotionTag
                  label={schedule.category}
                  color={categoryColor || undefined}
                />
              }
            />
          )}
          {schedule.area && (
            <NotionProperty
              label="Area"
              value={
                <NotionTag
                  label={schedule.area}
                  color={areaColor || undefined}
                />
              }
            />
          )}
          <NotionProperty label="Venue" value={schedule.venue} />
          <NotionProperty label="Lineup">
            {lineupOptions.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {lineupOptions.map((opt) => (
                  <NotionTag key={opt.label} label={opt.label} color={opt.color} />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyValue}>-</Text>
            )}
          </NotionProperty>
          {schedule.target && (
            <NotionProperty
              label="Target"
              value={
                <NotionTag
                  label={schedule.target}
                  color={targetColor || undefined}
                />
              }
            />
          )}
        </NotionPropertyBlock>

        <NotionPropertyBlock label="Cost">
          {schedule.seller && (
            <NotionProperty
              label="Seller"
              value={
                <NotionTag
                  label={schedule.seller}
                  color={sellerColor || undefined}
                />
              }
            />
          )}
          {schedule.ticket_fee !== null && schedule.ticket_fee !== undefined && (
            <NotionProperty
              label="Ticket Fee"
              value={`¥${schedule.ticket_fee.toLocaleString()}`}
            />
          )}
          {schedule.drink_fee !== null && schedule.drink_fee !== undefined && (
            <NotionProperty
              label="Drink Fee"
              value={`¥${schedule.drink_fee.toLocaleString()}`}
            />
          )}
          {schedule.total_fare !== null && schedule.total_fare !== undefined && (
            <NotionProperty
              label="Total Fare"
              value={`¥${schedule.total_fare.toLocaleString()}`}
            />
          )}
          {schedule.stay_fee !== null && schedule.stay_fee !== undefined && (
            <NotionProperty
              label="Stay Fee"
              value={`¥${schedule.stay_fee.toLocaleString()}`}
            />
          )}
          {schedule.travel_cost !== null && schedule.travel_cost !== undefined && (
            <NotionProperty
              label="Travel Cost"
              value={`¥${schedule.travel_cost.toLocaleString()}`}
            />
          )}
          {schedule.total_cost !== null && schedule.total_cost !== undefined && (
            <NotionProperty
              label="Total Cost"
              value={`¥${schedule.total_cost.toLocaleString()}`}
            />
          )}
        </NotionPropertyBlock>

        <NotionPropertyBlock label="Status">
          {schedule.status && (
            <NotionProperty
              label="Status"
              value={
                <NotionTag
                  label={schedule.status}
                  color={statusColor || undefined}
                />
              }
            />
          )}
        </NotionPropertyBlock>

        {/* Traffic */}
        <NotionPropertyBlock label="Traffic">
          {trafficSummaries.length === 0 ? (
            <Text style={styles.emptyText}>交通情報がありません</Text>
          ) : (
            trafficSummaries.map((traffic) => (
              <View key={traffic.id} style={styles.trafficItem}>
                <NotionProperty
                  label="Date"
                  value={traffic.date}
                />
                <NotionProperty
                  label="Order"
                  value={traffic.order.toString()}
                />
                {traffic.transportation && (
                  <NotionProperty
                    label="Transportation"
                    value={traffic.transportation}
                  />
                )}
                <NotionProperty
                  label="From"
                  value={traffic.from}
                />
                <NotionProperty
                  label="To"
                  value={traffic.to}
                />
                {traffic.notes && (
                  <NotionProperty
                    label="Notes"
                    value={traffic.notes}
                  />
                )}
                <NotionProperty
                  label="Fare"
                  value={`¥${traffic.fare.toLocaleString()}`}
                />
                {traffic.miles !== null && traffic.miles !== undefined && (
                  <NotionProperty
                    label="Miles"
                    value={traffic.miles.toString()}
                  />
                )}
                <NotionProperty
                  label="Return"
                  value={traffic.return_flag ? "Yes" : "No"}
                />
              </View>
            ))
          )}
        </NotionPropertyBlock>

        {/* Stay */}
        <NotionPropertyBlock label="Stay">
          {staySummaries.length === 0 ? (
            <Text style={styles.emptyText}>宿泊情報がありません</Text>
          ) : (
            staySummaries.map((stay) => (
              <View key={stay.id} style={styles.stayItem}>
                <NotionProperty
                  label="Check In"
                  value={stay.check_in}
                />
                <NotionProperty
                  label="Check Out"
                  value={stay.check_out}
                />
                <NotionProperty
                  label="Hotel Name"
                  value={maskHotelName(stay.hotel_name, false)}
                />
                <NotionProperty
                  label="Fee"
                  value={`¥${stay.fee.toLocaleString()}`}
                />
                <NotionProperty
                  label="Breakfast"
                  value={stay.breakfast_flag ? "Yes" : "No"}
                />
                {stay.deadline && (
                  <NotionProperty
                    label="Deadline"
                    value={stay.deadline}
                  />
                )}
                {stay.penalty !== null && stay.penalty !== undefined && (
                  <NotionProperty
                    label="Penalty"
                    value={`${stay.penalty}%`}
                  />
                )}
                <NotionProperty
                  label="Status"
                  value={stay.status}
                />
              </View>
            ))
          )}
        </NotionPropertyBlock>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 24,
    color: "#37352f",
  },
  errorText: {
    color: "#d32f2f",
    fontSize: 16,
  },
  emptyValue: {
    fontSize: 14,
    color: "#787774",
    textAlign: "center",
    marginTop: 20,
  },
  emptyText: {
    color: "#787774",
    fontSize: 14,
    fontStyle: "italic",
    marginVertical: 8,
  },
  trafficItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
  stayItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e9e9e7",
  },
});

