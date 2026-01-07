// 宿泊情報のグルーピングとソートの共通ロジック

export type Stay = {
  id: number;
  schedule_id: number;
  check_in: string;
  check_out: string;
  hotel_name: string;
  website?: string | null;
  fee: number;
  breakfast_flag: boolean;
  deadline?: string | null;
  penalty?: number | null;
  status: string;
};

export type GroupedStay = {
  title: string;
  data: Stay[];
};

export function groupStays(
  stays: Stay[],
  field: "website" | "none",
  selectOptionsMap: Map<string, Map<string, number>>
): GroupedStay[] {
  if (field === "none") {
    return [{ title: "", data: stays }];
  }

  const grouped = new Map<string, Stay[]>();

  stays.forEach((stay) => {
    let groupKey: string;

    switch (field) {
      case "website":
        groupKey = stay.website || "未設定";
        break;
      default:
        groupKey = "未設定";
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey)!.push(stay);
  });

  // グループをソート
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const [titleA, dataA] = a;
    const [titleB, dataB] = b;
    
    // 未設定は最後に
    if (titleA === "未設定") return 1;
    if (titleB === "未設定") return -1;

    // 予約サイトの場合は、選択肢のorderでソート
    const orderMap = selectOptionsMap.get("website");
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

