// 選択肢の順序情報を取得する共通ロジック

import { loadSelectOptions, loadStaySelectOptions, loadSelectOptionsSortOrder } from "./select-options-storage";
import { sortByKanaOrder, sortByOrder } from "../types/select-option";

export type SelectOptionsMap = {
  orderMap: Map<string, Map<string, number>>;
  sortOrderMap: Map<string, string>; // 'kana' または 'custom'
};

export async function loadSelectOptionsMap(
  shareId?: string
): Promise<SelectOptionsMap> {
  const [categories, areas, targets, sellers, statuses, groups, websites, stayStatuses] = await Promise.all([
    loadSelectOptions("CATEGORIES", shareId),
    loadSelectOptions("AREAS", shareId),
    loadSelectOptions("TARGETS", shareId),
    loadSelectOptions("SELLERS", shareId),
    loadSelectOptions("STATUSES", shareId),
    loadSelectOptions("GROUPS", shareId),
    loadStaySelectOptions("WEBSITE", shareId),
    loadStaySelectOptions("STATUS", shareId),
  ]);

  // 並び順の設定を取得（五十音順/カスタム順）
  const sortOrderMap = new Map<string, string>();
  if (!shareId) {
    // 共有ページの場合は並び順の設定を取得しない（デフォルトでカスタム順）
    try {
      const [targetSortOrder, lineupSortOrder] = await Promise.all([
        loadSelectOptionsSortOrder("TARGETS"),
        loadSelectOptionsSortOrder("TARGETS"), // LINEUPSはTARGETSと同じ選択肢を使用
      ]);
      sortOrderMap.set("target", targetSortOrder);
      sortOrderMap.set("lineup", lineupSortOrder);
    } catch (error) {
      console.error("Error loading sort order:", error);
    }
  }

  const orderMap = new Map<string, Map<string, number>>();
  
  // 各選択肢タイプのorder情報をマップに保存
  // 五十音順の場合は五十音順でソート、カスタム順の場合はorderでソート
  const getSortedOptions = (options: typeof categories, sortOrder: string) => {
    if (sortOrder === 'kana') {
      return sortByKanaOrder(options);
    } else {
      return sortByOrder(options);
    }
  };

  const categoryOrder = new Map<string, number>();
  categories.forEach((opt, idx) => {
    categoryOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("category", categoryOrder);

  const areaOrder = new Map<string, number>();
  areas.forEach((opt, idx) => {
    areaOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("area", areaOrder);

  // targetとlineupは並び順の設定に基づいてソート
  const targetSortOrder = sortOrderMap.get("target") || 'custom';
  const sortedTargets = getSortedOptions(targets, targetSortOrder);
  const targetOrder = new Map<string, number>();
  sortedTargets.forEach((opt, idx) => {
    targetOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("target", targetOrder);
  
  // lineupもtargetと同じ選択肢を使用し、同じ並び順設定を適用
  const lineupSortOrder = sortOrderMap.get("lineup") || targetSortOrder;
  const sortedLineups = getSortedOptions(targets, lineupSortOrder);
  const lineupOrder = new Map<string, number>();
  sortedLineups.forEach((opt, idx) => {
    lineupOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("lineup", lineupOrder);

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

  const stayStatusOrder = new Map<string, number>();
  stayStatuses.forEach((opt, idx) => {
    stayStatusOrder.set(opt.label, opt.order !== undefined ? opt.order : idx);
  });
  orderMap.set("stay_status", stayStatusOrder);

  return { orderMap, sortOrderMap };
}

