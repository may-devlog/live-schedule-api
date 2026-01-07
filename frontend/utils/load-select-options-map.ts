// 選択肢の順序情報を取得する共通ロジック

import { loadSelectOptions, loadStaySelectOptions } from "./select-options-storage";

export async function loadSelectOptionsMap(
  shareId?: string
): Promise<Map<string, Map<string, number>>> {
  const [categories, areas, targets, sellers, statuses, groups, websites] = await Promise.all([
    loadSelectOptions("CATEGORIES", shareId),
    loadSelectOptions("AREAS", shareId),
    loadSelectOptions("TARGETS", shareId),
    loadSelectOptions("SELLERS", shareId),
    loadSelectOptions("STATUSES", shareId),
    loadSelectOptions("GROUPS", shareId),
    loadStaySelectOptions("WEBSITE", shareId),
  ]);

  const orderMap = new Map<string, Map<string, number>>();
  
  // 各選択肢タイプのorder情報をマップに保存
  // loadSelectOptionsで取得した選択肢は既にorderでソートされているので、その順序を使用
  const categoryOrder = new Map<string, number>();
  categories.forEach((opt, idx) => {
    // opt.orderが存在する場合はそれを使用、存在しない場合は配列のインデックスを使用
    categoryOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("category", categoryOrder);

  const areaOrder = new Map<string, number>();
  areas.forEach((opt, idx) => {
    areaOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("area", areaOrder);

  const targetOrder = new Map<string, number>();
  targets.forEach((opt, idx) => {
    targetOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("target", targetOrder);
  orderMap.set("lineup", targetOrder); // LineupもTargetと同じ選択肢を使用

  const sellerOrder = new Map<string, number>();
  sellers.forEach((opt, idx) => {
    sellerOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("seller", sellerOrder);

  const statusOrder = new Map<string, number>();
  statuses.forEach((opt, idx) => {
    statusOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("status", statusOrder);

  const groupOrder = new Map<string, number>();
  groups.forEach((opt, idx) => {
    groupOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("group", groupOrder);

  const websiteOrder = new Map<string, number>();
  websites.forEach((opt, idx) => {
    websiteOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("website", websiteOrder);

  return orderMap;
}

