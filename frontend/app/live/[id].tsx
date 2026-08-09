import { useLocalSearchParams } from "expo-router";
import React from "react";
import ScheduleDetailScreen from "../share/[share_id]/schedules/[id]";

export default function AuthenticatedScheduleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ScheduleDetailScreen authenticated scheduleId={id} />;
}
