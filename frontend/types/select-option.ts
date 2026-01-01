// 選択肢の型定義（色情報付き）
export type SelectOption = {
  label: string;
  color?: string; // カラーコード（例: "#FF5733"）
};

// 選択肢のデフォルト色（Notion風の薄いパステルカラー）
export const DEFAULT_COLORS = [
  "#FEE2E2", // red (薄い赤)
  "#FEF3C7", // amber (薄い黄色)
  "#D1FAE5", // emerald (薄い緑)
  "#DBEAFE", // blue (薄い青)
  "#E9D5FF", // violet (薄い紫)
  "#FCE7F3", // pink (薄いピンク)
  "#E5E7EB", // gray (薄いグレー)
  "#FED7AA", // orange (薄いオレンジ)
  "#ECFCCB", // lime (薄いライム)
  "#CCFBF1", // teal (薄いティール)
  "#E0E7FF", // indigo (薄いインディゴ)
  "#F3E8FF", // purple (薄いパープル)
];

// 都道府県の地方マッピング（47都道府県の標準順）
const PREFECTURE_REGIONS: Record<string, string> = {
  // 北海道地方
  "北海道": "北海道",
  // 東北地方
  "青森": "東北",
  "岩手": "東北",
  "宮城": "東北",
  "秋田": "東北",
  "山形": "東北",
  "福島": "東北",
  // 関東地方
  "茨城": "関東",
  "栃木": "関東",
  "群馬": "関東",
  "埼玉": "関東",
  "千葉": "関東",
  "東京": "関東",
  "神奈川": "関東",
  // 甲信越・北陸地方
  "新潟": "甲信越",
  "富山": "甲信越",
  "石川": "甲信越",
  "福井": "甲信越",
  "山梨": "甲信越",
  "長野": "甲信越",
  // 東海地方（静岡・愛知・岐阜・三重）
  "岐阜": "東海",
  "静岡": "東海",
  "愛知": "東海",
  "三重": "東海",
  // 近畿地方
  "滋賀": "近畿",
  "京都": "近畿",
  "大阪": "近畿",
  "兵庫": "近畿",
  "奈良": "近畿",
  "和歌山": "近畿",
  // 中国地方
  "鳥取": "中国",
  "島根": "中国",
  "岡山": "中国",
  "広島": "中国",
  "山口": "中国",
  // 四国地方
  "徳島": "四国",
  "香川": "四国",
  "愛媛": "四国",
  "高知": "四国",
  // 九州地方
  "福岡": "九州",
  "佐賀": "九州",
  "長崎": "九州",
  "熊本": "九州",
  "大分": "九州",
  "宮崎": "九州",
  "鹿児島": "九州",
  "沖縄": "九州",
};

// 地方ごとの色マッピング（Notion風の薄いパステルカラー）
const REGION_COLORS: Record<string, string> = {
  "北海道": "#DBEAFE", // blue (薄い青)
  "東北": "#E9D5FF", // violet (薄い紫)
  "関東": "#FEE2E2", // red (薄い赤)
  "甲信越": "#FED7AA", // orange (薄いオレンジ)
  "東海": "#D1FAE5", // emerald (薄い緑)
  "近畿": "#FEF3C7", // amber (薄い黄色)
  "中国": "#CCFBF1", // teal (薄いティール)
  "四国": "#ECFCCB", // lime (薄いライム)
  "九州": "#FCE7F3", // pink (薄いピンク)
};

// カテゴリごとの色マッピング（Notion風の薄いパステルカラー）
const CATEGORY_COLORS: Record<string, string> = {
  "フェス": "#FEE2E2", // red (薄い赤)
  "イベント": "#D1FAE5", // emerald (薄い緑)
  "舞台": "#E9D5FF", // violet (薄い紫)
  "その他": "#E5E7EB", // gray (薄いグレー)
};

// Sellerごとの色マッピング（公式ロゴの色をイメージ）
const SELLER_COLORS: Record<string, string> = {
  "チケットぴあ": "#BFDBFE", // blue (チケットぴあの公式ロゴの青)
  "イープラス": "#F9D5E5", // pink (イープラスの公式ロゴのピンク)
  "ローチケ": "#007aff", // blue (ローチケの公式ロゴの青)
  "その他": "#E5E7EB", // gray (薄いグレー)
};

// 選択肢を文字列配列からSelectOption配列に変換
export function stringArrayToOptions(
  strings: string[],
  colorMap?: Record<string, string>,
  isPrefecture: boolean = false,
  isCategory: boolean = false,
  isSeller: boolean = false
): SelectOption[] {
  return strings.map((str) => ({
    label: str,
    color: colorMap?.[str] || getDefaultColorForLabel(str, isPrefecture, isCategory, isSeller),
  }));
}

// ラベルからデフォルト色を生成
// isPrefectureがtrueの場合、都道府県として地方ごとに同じ色を割り当て
// isCategoryがtrueの場合、カテゴリとして特定の色を割り当て
// isSellerがtrueの場合、Sellerとして特定の色を割り当て
export function getDefaultColorForLabel(
  label: string,
  isPrefecture: boolean = false,
  isCategory: boolean = false,
  isSeller: boolean = false
): string {
  if (isPrefecture) {
    const region = PREFECTURE_REGIONS[label];
    if (region && REGION_COLORS[region]) {
      return REGION_COLORS[region];
    }
  }
  
  if (isCategory) {
    if (CATEGORY_COLORS[label]) {
      return CATEGORY_COLORS[label];
    }
  }
  
  if (isSeller) {
    if (SELLER_COLORS[label]) {
      return SELLER_COLORS[label];
    }
  }
  
  // 都道府県でもカテゴリでもSellerでもない場合、またはマッピングにない場合はハッシュベースで色を決定
  const hash = label.split("").reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}

// SelectOption配列から文字列配列に変換
export function optionsToStringArray(options: SelectOption[]): string[] {
  return options.map((opt) => opt.label);
}

