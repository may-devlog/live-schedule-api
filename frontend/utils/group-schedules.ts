// スケジュールのグルーピングとソートの共通ロジック

import type { Schedule } from "../app/HomeScreen";

export type GroupingField = "group" | "category" | "area" | "target" | "lineup" | "seller" | "status" | "none";

export type MainGroupingField = "target" | "lineup" | "none";
export type SubGroupingField = "group" | "category" | "area" | "seller" | "status" | "none";

export type GroupedSchedule = {
  title: string;
  data: Schedule[];
};

export type NestedGroupedSchedule = {
  title: string;
  subGroups: GroupedSchedule[];
};

// 単一フィールドでのグルーピング（後方互換性のため保持）
export function groupSchedules(
  schedules: Schedule[],
  field: GroupingField,
  selectOptionsMap: Map<string, Map<string, number>>
): GroupedSchedule[] {
  if (field === "none") {
    return [{ title: "", data: schedules }];
  }

  const grouped = new Map<string, Schedule[]>();

  schedules.forEach((schedule) => {
    let groupKey: string;

    switch (field) {
      case "group":
        // GroupがNULLの場合はTitleを使用
        groupKey = schedule.group || schedule.title || "未設定";
        break;
      case "category":
        groupKey = schedule.category || "未設定";
        break;
      case "area":
        groupKey = schedule.area || "未設定";
        break;
      case "target":
        groupKey = schedule.target || "未設定";
        break;
      case "lineup":
        // Lineupはカンマ区切りで複数値がある場合は双方に表示
        if (schedule.lineup) {
          const lineupValues = schedule.lineup.split(",").map(v => v.trim()).filter(v => v);
          if (lineupValues.length > 0) {
            // 各値に対してスケジュールを追加
            lineupValues.forEach((value) => {
              if (!grouped.has(value)) {
                grouped.set(value, []);
              }
              grouped.get(value)!.push(schedule);
            });
          } else {
            groupKey = "未設定";
          }
        } else {
          groupKey = "未設定";
        }
        break;
      case "seller":
        groupKey = schedule.seller || "未設定";
        break;
      case "status":
        groupKey = schedule.status || "未設定";
        break;
      default:
        groupKey = "未設定";
    }

    // lineupの場合は既に処理済みなのでスキップ
    if (field !== "lineup") {
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey)!.push(schedule);
    }
  });

  // グループをソート
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const [titleA, dataA] = a;
    const [titleB, dataB] = b;
    
    // 未設定は最後に
    if (titleA === "未設定") return 1;
    if (titleB === "未設定") return -1;

    // groupの場合は、各グループに含まれる一番古い開演時間でソート
    if (field === "group") {
      const getEarliestDatetime = (schedules: Schedule[]): number => {
        return Math.min(...schedules.map(s => {
          try {
            return new Date(s.datetime).getTime();
          } catch {
            return Infinity;
          }
        }));
      };
      const timeA = getEarliestDatetime(dataA);
      const timeB = getEarliestDatetime(dataB);
      return timeA - timeB;
    }

    // その他のフィールドの場合は、選択肢のorderでソート
    const orderMap = selectOptionsMap.get(field);
    if (orderMap && orderMap.size > 0) {
      const orderA = orderMap.get(titleA);
      const orderB = orderMap.get(titleB);
      // 両方のorderが存在する場合はorderでソート
      if (orderA !== undefined && orderB !== undefined) {
        return orderA - orderB;
      }
      // 片方だけorderがある場合は、orderがある方を前に
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
    }

    // orderがない場合は文字列比較
    return titleA.localeCompare(titleB, "ja");
  });

  return sortedGroups.map(([title, data]) => ({ title, data }));
}

// スケジュールからグループキーを取得するヘルパー関数
function getGroupKey(schedule: Schedule, field: GroupingField): string[] {
  switch (field) {
    case "group":
      return [schedule.group || schedule.title || "未設定"];
    case "category":
      return [schedule.category || "未設定"];
    case "area":
      return [schedule.area || "未設定"];
    case "target":
      return [schedule.target || "未設定"];
    case "lineup":
      if (schedule.lineup) {
        const lineupValues = schedule.lineup.split(",").map(v => v.trim()).filter(v => v);
        return lineupValues.length > 0 ? lineupValues : ["未設定"];
      }
      return ["未設定"];
    case "seller":
      return [schedule.seller || "未設定"];
    case "status":
      return [schedule.status || "未設定"];
    default:
      return ["未設定"];
  }
}

// グループをソートするヘルパー関数
function sortGroups(
  groups: Array<[string, Schedule[]]>,
  field: GroupingField,
  selectOptionsMap: Map<string, Map<string, number>>
): Array<[string, Schedule[]]> {
  return groups.sort((a, b) => {
    const [titleA, dataA] = a;
    const [titleB, dataB] = b;
    
    // 未設定は最後に
    if (titleA === "未設定") return 1;
    if (titleB === "未設定") return -1;

    // groupの場合は、各グループに含まれる一番古い開演時間でソート
    if (field === "group") {
      const getEarliestDatetime = (schedules: Schedule[]): number => {
        return Math.min(...schedules.map(s => {
          try {
            return new Date(s.datetime).getTime();
          } catch {
            return Infinity;
          }
        }));
      };
      const timeA = getEarliestDatetime(dataA);
      const timeB = getEarliestDatetime(dataB);
      return timeA - timeB;
    }

    // その他のフィールドの場合は、選択肢のorderでソート
    const orderMap = selectOptionsMap.get(field);
    if (orderMap && orderMap.size > 0) {
      const orderA = orderMap.get(titleA);
      const orderB = orderMap.get(titleB);
      // 両方のorderが存在する場合はorderでソート
      if (orderA !== undefined && orderB !== undefined) {
        return orderA - orderB;
      }
      // 片方だけorderがある場合は、orderがある方を前に
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
    }

    // orderがない場合は文字列比較
    return titleA.localeCompare(titleB, "ja");
  });
}

// メインとサブの2段階グルーピング
export function groupSchedulesNested(
  schedules: Schedule[],
  mainField: MainGroupingField,
  subField: SubGroupingField,
  selectOptionsMap: Map<string, Map<string, number>>
): NestedGroupedSchedule[] {
  // 両方とも"none"の場合はグルーピングなし
  if (mainField === "none" && subField === "none") {
    return [{ title: "", subGroups: [{ title: "", data: schedules }] }];
  }

  // メインのみ"none"の場合は、サブのみでグルーピング
  if (mainField === "none") {
    const subGroups = groupSchedules(schedules, subField, selectOptionsMap);
    return [{ title: "", subGroups }];
  }

  // サブのみ"none"の場合は、メインのみでグルーピング
  if (subField === "none") {
    const mainGroups = groupSchedules(schedules, mainField, selectOptionsMap);
    return mainGroups.map(group => ({
      title: group.title,
      subGroups: [{ title: "", data: group.data }]
    }));
  }

  // 両方とも設定されている場合は2段階グルーピング
  const nested = new Map<string, Map<string, Schedule[]>>();

  schedules.forEach((schedule) => {
    const mainKeys = getGroupKey(schedule, mainField);
    const subKeys = getGroupKey(schedule, subField);

    mainKeys.forEach((mainKey) => {
      if (!nested.has(mainKey)) {
        nested.set(mainKey, new Map());
      }
      const subMap = nested.get(mainKey)!;

      subKeys.forEach((subKey) => {
        if (!subMap.has(subKey)) {
          subMap.set(subKey, []);
        }
        subMap.get(subKey)!.push(schedule);
      });
    });
  });

  // メイングループをソート
  const sortedMainGroups = Array.from(nested.entries()).sort((a, b) => {
    const [titleA] = a;
    const [titleB] = b;
    
    // 未設定は最後に
    if (titleA === "未設定") return 1;
    if (titleB === "未設定") return -1;

    // メインフィールドのorderでソート
    const orderMap = selectOptionsMap.get(mainField);
    if (orderMap && orderMap.size > 0) {
      const orderA = orderMap.get(titleA);
      const orderB = orderMap.get(titleB);
      if (orderA !== undefined && orderB !== undefined) {
        return orderA - orderB;
      }
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
    }

    return titleA.localeCompare(titleB, "ja");
  });

  // 各メイングループ内でサブグループをソート
  return sortedMainGroups.map(([mainTitle, subMap]) => {
    const subGroups = sortGroups(Array.from(subMap.entries()), subField, selectOptionsMap);
    return {
      title: mainTitle,
      subGroups: subGroups.map(([subTitle, data]) => ({
        title: subTitle,
        data
      }))
    };
  });
}

