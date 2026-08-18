// 選択肢の永続化ユーティリティ
// AsyncStorageを動的インポートで循環依存を回避
import type { SelectOption } from "../types/select-option";
// 動的インポートで循環依存を回避（authenticatedFetch, getApiUrl）

// 色の決定ロジックを関数内に移動してモジュール読み込み時の実行を回避
function getDefaultColorForLabel(
  label: string,
  isPrefecture: boolean = false,
  isCategory: boolean = false,
  isSeller: boolean = false
): string {
  const DEFAULT_COLORS = [
    "#FEE2E2", "#FEF3C7", "#D1FAE5", "#DBEAFE", "#E9D5FF", "#FCE7F3",
    "#E5E7EB", "#FED7AA", "#ECFCCB", "#CCFBF1", "#E0E7FF", "#F3E8FF",
  ];

  // ステータス用の固定カラー（ライブ予定・宿泊で共通）
  const STATUS_COLORS: Record<string, string> = {
    Canceled: "#E5E7EB", // gray
    Keep: "#BFDBFE",     // blue
    Done: "#D1FAE5",     // green
    // Pending は既存のロジックのまま
  };

  const PREFECTURE_REGIONS: Record<string, string> = {
    "北海道": "北海道",
    "青森": "東北", "岩手": "東北", "宮城": "東北", "秋田": "東北", "山形": "東北", "福島": "東北",
    "茨城": "関東", "栃木": "関東", "群馬": "関東", "埼玉": "関東", "千葉": "関東", "東京": "関東", "神奈川": "関東",
    "新潟": "甲信越", "富山": "甲信越", "石川": "甲信越", "福井": "甲信越", "山梨": "甲信越", "長野": "甲信越",
    "岐阜": "東海", "静岡": "東海", "愛知": "東海", "三重": "東海",
    "滋賀": "近畿", "京都": "近畿", "大阪": "近畿", "兵庫": "近畿", "奈良": "近畿", "和歌山": "近畿",
    "鳥取": "中国", "島根": "中国", "岡山": "中国", "広島": "中国", "山口": "中国",
    "徳島": "四国", "香川": "四国", "愛媛": "四国", "高知": "四国",
    "福岡": "九州", "佐賀": "九州", "長崎": "九州", "熊本": "九州", "大分": "九州", "宮崎": "九州", "鹿児島": "九州", "沖縄": "九州",
  };

  const REGION_COLORS: Record<string, string> = {
    "北海道": "#DBEAFE", "東北": "#E9D5FF", "関東": "#FCA5A5", "甲信越": "#FED7AA",
    "東海": "#86EFAC", "近畿": "#FEF3C7", "中国": "#CCFBF1", "四国": "#ECFCCB", "九州": "#FCE7F3",
  };

  const CATEGORY_COLORS: Record<string, string> = {
    "ワンマン": "#FED7AA", "フェス": "#FEE2E2", "イベント": "#D1FAE5", "舞台": "#E9D5FF", "その他": "#E5E7EB",
  };

  const SELLER_COLORS: Record<string, string> = {
    "チケットぴあ": "#BFDBFE", "イープラス": "#F9D5E5", "ローチケ": "#93C5FD", "その他": "#E5E7EB",
  };

  // ステータス名に対しては固定色を優先的に適用
  if (STATUS_COLORS[label]) {
    return STATUS_COLORS[label];
  }

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
  
  const hash = label.split("").reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}

// stringArrayToOptionsを直接実装して循環依存を回避
function stringArrayToOptions(
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

// optionsToStringArrayを直接実装
const optionsToStringArray = (options: SelectOption[]): string[] => {
  return options.map((opt) => opt.label);
};

const STORAGE_KEYS = {
  CATEGORIES: "@select_options:categories",
  AREAS: "@select_options:areas",
  TARGETS: "@select_options:targets",
  SELLERS: "@select_options:sellers",
  STATUSES: "@select_options:statuses",
  TRANSPORTATIONS: "@select_options:transportations",
  GROUPS: "@select_options:groups",
} as const;

const STAY_STORAGE_KEYS = {
  WEBSITE: "@stay_select_options:website",
  STATUS: "@stay_select_options:status",
} as const;

// デフォルトの選択肢（文字列配列）
const DEFAULT_CATEGORIES = ["ワンマン", "対バン", "フェス", "イベント", "舞台", "その他"];
// 47都道府県の標準順
const DEFAULT_AREAS = [
  "北海道",
  "青森", "岩手", "宮城", "秋田", "山形", "福島",
  "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
  "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜",
  "静岡", "愛知", "三重", "滋賀", "京都", "大阪", "兵庫",
  "奈良", "和歌山", "鳥取", "島根", "岡山", "広島", "山口",
  "徳島", "香川", "愛媛", "高知", "福岡", "佐賀", "長崎",
  "熊本", "大分", "宮崎", "鹿児島", "沖縄"
];
const DEFAULT_TARGETS: string[] = [];
const DEFAULT_SELLERS = ["チケットぴあ", "イープラス", "ローチケ", "その他"];
const DEFAULT_STATUSES = ["Canceled", "Pending", "Keep", "Done"];
const DEFAULT_TRANSPORTATIONS = ["✈️ 飛行機", "🚄 新幹線", "🚅 特急", "🚃 在来線", "🚌 バス", "🚗 車", "🚕 タクシー", "その他"];
const DEFAULT_GROUPS: string[] = [];

// デフォルト選択肢を取得する関数
function getDefaultOptions(
  key: keyof typeof STORAGE_KEYS
): SelectOption[] {
  const defaults: Record<keyof typeof STORAGE_KEYS, string[]> = {
    CATEGORIES: DEFAULT_CATEGORIES,
    AREAS: DEFAULT_AREAS,
    TARGETS: DEFAULT_TARGETS,
    SELLERS: DEFAULT_SELLERS,
    STATUSES: DEFAULT_STATUSES,
    TRANSPORTATIONS: DEFAULT_TRANSPORTATIONS,
    GROUPS: DEFAULT_GROUPS,
  };
  const isPrefecture = key === "AREAS";
  const isCategory = key === "CATEGORIES";
  const isSeller = key === "SELLERS";
  const options = stringArrayToOptions(defaults[key], undefined, isPrefecture, isCategory, isSeller);
  // orderプロパティを確実に設定
  const optionsWithOrder = options.map((opt, index) => ({
    ...opt,
    order: index,
  }));
  if (key === "TRANSPORTATIONS") {
    return optionsWithOrder.map((opt) => {
      // 特急の色を薄い黄色に設定
      if (opt.label === "🚅 特急") {
        return {
          ...opt,
          color: "#FEF9C3", // 薄い黄色
        };
      }
      // その他の色をグレーに設定
      if (opt.label === "その他") {
        return {
          ...opt,
          color: "#E5E7EB", // グレー
        };
      }
      return {
        ...opt,
        color: opt.color || "#E5E7EB",
      };
    });
  }
  return optionsWithOrder;
}

// データベースの選択肢にデフォルト選択肢の色情報のみを補完する関数
// 一度でも保存されたDBの内容（項目の有無・並び順）を正として扱い、
// ユーザーが削除・並び替えたデフォルト項目を復元したり上書きしたりしない
function mergeOptionsWithDefaults(
  dbOptions: SelectOption[],
  defaultOptions: SelectOption[]
): SelectOption[] {
  const defaultColorMap = new Map<string, string | undefined>();
  defaultOptions.forEach((opt) => {
    defaultColorMap.set(opt.label, opt.color);
  });

  // 色が未設定の項目にのみ、デフォルトの色を補完する
  const merged = dbOptions.map((opt) => ({
    ...opt,
    color: opt.color || defaultColorMap.get(opt.label),
  }));

  // orderでソートして返す（DBに保存された並び順をそのまま尊重する）
  return merged.sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : Infinity;
    const orderB = b.order !== undefined ? b.order : Infinity;
    return orderA - orderB;
  });
}

// 選択肢を読み込む（データベース優先、フォールバックはローカルストレージ）
export async function loadSelectOptions(
  key: keyof typeof STORAGE_KEYS,
  shareId?: string // 共有ページ用のshare_id（オプション）
): Promise<SelectOption[]> {
  const defaultOptions = getDefaultOptions(key);
  // 動的インポートで循環依存を回避
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  
  try {
    // まずデータベースから読み込む
    try {
      // 動的インポートで循環依存を回避
      const { authenticatedFetch, getApiUrl } = await import("./api");
      let res: Response;
      if (shareId) {
        // 共有ページの場合は共有用エンドポイントを使用
        res = await fetch(getApiUrl(`/share/${shareId}/select-options/${key.toLowerCase()}`));
      } else {
        // 通常の場合は認証付きエンドポイントを使用
        res = await authenticatedFetch(getApiUrl(`/select-options/${key.toLowerCase()}`));
      }
      if (res.ok) {
        const data = await res.json();
        // 新しい形式（{ options, sort_order, exists }）と古い形式（配列）の両方に対応
        const options: SelectOption[] = Array.isArray(data) ? data : (data.options || []);
        const sortOrder = Array.isArray(data) ? 'custom' : (data.sort_order || 'custom');
        // existsは「一度でも保存されたレコードが存在するか」を表す。
        // 古い形式（配列のみ）を返すサーバーとの互換のため、その場合は配列の中身で代用する
        const existsOnServer = Array.isArray(data) ? options.length > 0 : data.exists === true;

        if (existsOnServer) {
          console.log(`[SelectOptions] Loaded ${options.length} options from ${shareId ? 'shared' : 'database'} for ${key}:`, options.map(opt => ({ label: opt.label, order: opt.order })));
          // データベースの選択肢に色情報のみ補完する（項目の有無・並び順はDBの内容を正とする）
          const merged = mergeOptionsWithDefaults(options, defaultOptions);
          console.log(`[SelectOptions] Merged ${merged.length} options for ${key}:`, merged.map(opt => ({ label: opt.label, order: opt.order })));
          // データベースに保存されている場合は、ローカルストレージにも保存（キャッシュ）
          await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(merged));
          // sort_orderも保存
          await AsyncStorage.setItem(`${STORAGE_KEYS[key]}_sort_order`, sortOrder);
          return merged;
        }
      }
    } catch (error) {
      console.log(`[SelectOptions] Failed to load from database, falling back to local storage:`, error);
    }

    // データベースにない場合は、ローカルストレージから読み込む
    const stored = await AsyncStorage.getItem(STORAGE_KEYS[key]);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 既存のデータが文字列配列の場合は変換
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === "string") {
          // AREASの場合は都道府県として扱う
          // CATEGORIESの場合はカテゴリとして扱う
          // SELLERSの場合はSellerとして扱う
          const isPrefecture = key === "AREAS";
          const isCategory = key === "CATEGORIES";
          const isSeller = key === "SELLERS";
          const options = stringArrayToOptions(parsed, undefined, isPrefecture, isCategory, isSeller);
          // orderを付与（デフォルト順序に基づく）
          const defaultOptions = getDefaultOptions(key);
          const defaultOrderMap = new Map<string, number>();
          defaultOptions.forEach((opt, idx) => {
            defaultOrderMap.set(opt.label, idx);
          });
          const optionsWithOrder = options.map((opt) => ({
            ...opt,
            order: defaultOrderMap.get(opt.label) ?? Infinity,
          }));
          // orderでソートして返す
          return optionsWithOrder.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : Infinity;
            const orderB = b.order !== undefined ? b.order : Infinity;
            return orderA - orderB;
          });
        }
        // 既存のSelectOption配列の場合、AREASの場合は色を再計算し、不足している都道府県を追加
        if (key === "AREAS") {
          const existingOptions = (parsed as SelectOption[]).map((opt) => ({
            ...opt,
            color: opt.color || getDefaultColorForLabel(opt.label, true, false),
          }));
          // デフォルトの都道府県リストと比較して、不足している都道府県を追加
          const existingLabels = new Set(existingOptions.map((opt) => opt.label));
          const missingPrefectures = DEFAULT_AREAS.filter(
            (pref) => !existingLabels.has(pref)
          );
          // orderを付与（デフォルト順序に基づく）
          const defaultOrderMap = new Map<string, number>();
          DEFAULT_AREAS.forEach((pref, idx) => {
            defaultOrderMap.set(pref, idx);
          });
          const optionsWithOrder = existingOptions.map((opt) => ({
            ...opt,
            order: opt.order !== undefined ? opt.order : (defaultOrderMap.get(opt.label) ?? Infinity),
          }));
          if (missingPrefectures.length > 0) {
            const missingOptions = stringArrayToOptions(
              missingPrefectures,
              undefined,
              true,
              false
            );
            const missingWithOrder = missingOptions.map((opt) => ({
              ...opt,
              order: defaultOrderMap.get(opt.label) ?? Infinity,
            }));
            const allOptions = [...optionsWithOrder, ...missingWithOrder];
            // orderでソートして返す
            return allOptions.sort((a, b) => {
              const orderA = a.order !== undefined ? a.order : Infinity;
              const orderB = b.order !== undefined ? b.order : Infinity;
              return orderA - orderB;
            });
          }
          // orderでソートして返す
          return optionsWithOrder.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : Infinity;
            const orderB = b.order !== undefined ? b.order : Infinity;
            return orderA - orderB;
          });
        }
        // 既存のSelectOption配列の場合、CATEGORIESの場合は色を再計算
        if (key === "CATEGORIES") {
          const options = (parsed as SelectOption[]).map((opt) => ({
            ...opt,
            color: opt.color || getDefaultColorForLabel(opt.label, false, true, false),
          }));
          // orderでソートして返す
          return options.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : Infinity;
            const orderB = b.order !== undefined ? b.order : Infinity;
            return orderA - orderB;
          });
        }
        // 既存のSelectOption配列の場合、SELLERSの場合は色を再計算
        // また、「ローソンチケット」を「ローチケ」に変換
        if (key === "SELLERS") {
          const updatedOptions = (parsed as SelectOption[]).map((opt) => {
            // 「ローソンチケット」を「ローチケ」に変換
            let label = opt.label;
            if (label === "ローソンチケット") {
              label = "ローチケ";
            }
            return {
              ...opt,
              label,
              color: opt.color || getDefaultColorForLabel(label, false, false, true),
            };
          });
          // 重複を除去（変換後のラベルで）
          const uniqueOptions = Array.from(
            new Map(updatedOptions.map(opt => [opt.label, opt])).values()
          );
          // 変更があった場合は保存
          const hasChanges = parsed.some((opt: SelectOption, idx: number) => 
            opt.label !== uniqueOptions[idx]?.label
          ) || uniqueOptions.length !== parsed.length;
          if (hasChanges) {
            await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(uniqueOptions));
          }
          // orderでソートして返す
          return uniqueOptions.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : Infinity;
            const orderB = b.order !== undefined ? b.order : Infinity;
            return orderA - orderB;
          });
        }
        // 既存のSelectOption配列の場合、TARGETSの場合は「Band B」「Band C」を「Artist B」「Artist C」に変換
        if (key === "TARGETS") {
          const existingOptions = (parsed as SelectOption[]).map((opt) => {
            // Band B, Band CをArtist B, Artist Cに変換
            let label = opt.label;
            if (label === "Band B") label = "Artist B";
            if (label === "Band C") label = "Artist C";
            return {
              ...opt,
              label,
              color: opt.color || getDefaultColorForLabel(label, false, false, false),
            };
          });
          // 重複を除去（変換後のラベルで）
          const uniqueOptions = Array.from(
            new Map(existingOptions.map(opt => [opt.label, opt])).values()
          );
          // 変更があった場合は保存（Band B/Cの変換があった場合）
          const hasChanges = parsed.some((opt: SelectOption, idx: number) => 
            opt.label !== uniqueOptions[idx]?.label
          );
          if (hasChanges) {
            await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(uniqueOptions));
          }
          // orderでソートして返す
          return uniqueOptions.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : Infinity;
            const orderB = b.order !== undefined ? b.order : Infinity;
            return orderA - orderB;
          });
        }
        // TRANSPORTATIONSの場合は、色が設定されていない場合のみデフォルトで薄いグレーに
        if (key === "TRANSPORTATIONS") {
          const options = (parsed as SelectOption[]).map((opt) => {
            // 特急の色を薄い黄色に設定
            if (opt.label === "🚅 特急") {
              return {
                ...opt,
                color: "#FEF9C3", // 薄い黄色
              };
            }
            // その他の色をグレーに設定
            if (opt.label === "その他") {
              return {
                ...opt,
                color: "#E5E7EB", // グレー
              };
            }
            return {
              ...opt,
              color: opt.color || "#E5E7EB", // 色が設定されていない場合のみ薄いグレー（デフォルト）
            };
          });
          // orderでソートして返す
          return options.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : Infinity;
            const orderB = b.order !== undefined ? b.order : Infinity;
            return orderA - orderB;
          });
        }
        return parsed as SelectOption[];
      }
    }
  } catch (error) {
    console.error(`Error loading ${key}:`, error);
  }

  // デフォルト値を返す（orderを付与し、orderでソート）
  const optionsWithOrder = defaultOptions.map((opt, index) => ({
    ...opt,
    order: index,
  }));
  // orderでソートして返す
  return optionsWithOrder.sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : Infinity;
    const orderB = b.order !== undefined ? b.order : Infinity;
    return orderA - orderB;
  });
}

// ホテル用選択肢を読み込む（データベース優先、フォールバックはローカルストレージ）
export async function loadStaySelectOptions(
  key: keyof typeof STAY_STORAGE_KEYS,
  shareId?: string // 共有ページ用のshare_id（オプション）
): Promise<SelectOption[]> {
  // 動的インポートで循環依存を回避
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  
  try {
    // まずデータベースから読み込む
    try {
      // 動的インポートで循環依存を回避
      const { authenticatedFetch, getApiUrl } = await import("./api");
      let res: Response;
      if (shareId) {
        // 共有ページの場合は共有用エンドポイントを使用
        res = await fetch(getApiUrl(`/share/${shareId}/stay-select-options/${key}`));
      } else {
        // 通常の場合は認証付きエンドポイントを使用
        res = await authenticatedFetch(getApiUrl(`/stay-select-options/${key}`));
      }
      if (res.ok) {
        const data = await res.json();
        // 新しい形式（{ options, exists }）と古い形式（配列）の両方に対応
        const options: SelectOption[] = Array.isArray(data) ? data : (data.options || []);
        console.log(`[StaySelectOptions] Loaded ${options.length} options from ${shareId ? 'shared' : 'database'} for ${key}:`, options.map((opt) => ({ label: opt.label, color: opt.color })));
        // サーバーからの正常な応答は、中身が空であっても現在の正しい状態として信頼する。
        // 古い端末キャッシュにフォールバックすると、サーバー側でデータが失われた場合に
        // それに気づけないまま古い(誤った)色が表示され続けてしまう。
        await AsyncStorage.setItem(STAY_STORAGE_KEYS[key], JSON.stringify(options));
        return options;
      } else {
        console.log(`[StaySelectOptions] Fetch for ${key} returned non-ok status: ${res.status}, falling back to local storage`);
      }
    } catch (error) {
      console.log(`[StaySelectOptions] Failed to load ${key} from database, falling back to local storage:`, error);
    }

    // データベースにない場合は、ローカルストレージから読み込む
    const stored = await AsyncStorage.getItem(STAY_STORAGE_KEYS[key]);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === "string") {
          // stringArrayToOptionsを使用せず、直接SelectOption[]を作成して循環依存を回避
          // STATUSの場合は色を設定
          if (key === "STATUS") {
            return (parsed as string[]).map((str: string) => ({
              label: str,
              color: getDefaultColorForLabel(str, false, false, false),
            }));
          }
          return (parsed as string[]).map((str: string) => ({ label: str }));
        }
        // STATUSの場合は色が設定されていない場合にデフォルト色を設定
        if (key === "STATUS") {
          return (parsed as SelectOption[]).map((opt) => ({
            ...opt,
            color: opt.color || getDefaultColorForLabel(opt.label, false, false, false),
          }));
        }
        return parsed as SelectOption[];
      }
    }
  } catch (error) {
    console.error(`Error loading stay ${key}:`, error);
  }

  // デフォルト値を返す
  return [];
}

// 選択肢を保存する（データベースに保存し、成功した場合のみローカルストレージにも保存）
export async function saveSelectOptions(
  key: keyof typeof STORAGE_KEYS,
  options: SelectOption[],
  sortOrder?: string // 'kana' または 'custom'
): Promise<void> {
  // 動的インポートで循環依存を回避
  const { authenticatedFetch, getApiUrl } = await import("./api");
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  // まずデータベースに保存
  const url = getApiUrl(`/select-options/${key.toLowerCase()}`);
  // sortOrderが指定されていない場合は、ローカルストレージから取得を試みる
  let finalSortOrder = sortOrder;
  if (!finalSortOrder) {
    try {
      const stored = await AsyncStorage.getItem(`${STORAGE_KEYS[key]}_sort_order`);
      finalSortOrder = stored || 'custom';
    } catch {
      finalSortOrder = 'custom';
    }
  }
  const payload = { options, sort_order: finalSortOrder };
  console.log(`[SelectOptions] Saving ${key} to database:`, url);
  console.log(`[SelectOptions] Payload:`, JSON.stringify(payload, null, 2));
  
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  console.log(`[SelectOptions] Response status:`, res.status);
  console.log(`[SelectOptions] Response headers:`, Object.fromEntries(res.headers.entries()));
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[SelectOptions] Failed to save ${key} to database:`, res.status, errorText);
    throw new Error(`Failed to save ${key} to database: ${res.status} ${errorText}`);
  }
  
  // データベースへの保存が成功した場合のみ、ローカルストレージにも保存（キャッシュ）
  const result = await res.json();
  console.log(`[SelectOptions] Successfully saved ${key} to database:`, result);
  
  // データベースへの保存が成功した場合のみ、ローカルストレージにも保存
  await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(options));
  await AsyncStorage.setItem(`${STORAGE_KEYS[key]}_sort_order`, finalSortOrder);
  console.log(`[SelectOptions] Saved ${key} to local storage`);
}

// 選択肢の並び順を取得する
export async function loadSelectOptionsSortOrder(
  key: keyof typeof STORAGE_KEYS
): Promise<string> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  try {
    const stored = await AsyncStorage.getItem(`${STORAGE_KEYS[key]}_sort_order`);
    return stored || 'custom';
  } catch {
    return 'custom';
  }
}

// 選択肢の並び順を保存する（データベースにも保存）
export async function saveSelectOptionsSortOrder(
  key: keyof typeof STORAGE_KEYS,
  sortOrder: string
): Promise<void> {
  // 動的インポートで循環依存を回避
  const { authenticatedFetch, getApiUrl } = await import("./api");
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  
  // 現在の選択肢を取得（データベースから、またはローカルストレージから）
  let currentOptions: SelectOption[] = [];
  try {
    // まずデータベースから取得を試みる
    const res = await authenticatedFetch(getApiUrl(`/select-options/${key.toLowerCase()}`));
    if (res.ok) {
      const data = await res.json();
      // 新しい形式（{ options, sort_order }）と古い形式（配列）の両方に対応
      currentOptions = Array.isArray(data) ? data : (data.options || []);
    }
  } catch (error) {
    console.log(`[SelectOptions] Failed to load from database, trying local storage:`, error);
  }
  
  // データベースにない場合は、ローカルストレージから読み込む
  if (currentOptions.length === 0) {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS[key]);
      if (stored) {
        currentOptions = JSON.parse(stored);
      }
    } catch (error) {
      console.error(`[SelectOptions] Failed to load from local storage:`, error);
    }
  }
  
  // 選択肢が空の場合は、デフォルト選択肢を使用
  if (currentOptions.length === 0) {
    const defaultOptions = getDefaultOptions(key);
    currentOptions = defaultOptions;
  }
  
  // データベースに保存（選択肢とsort_orderの両方を更新）
  const url = getApiUrl(`/select-options/${key.toLowerCase()}`);
  const payload = { options: currentOptions, sort_order: sortOrder };
  console.log(`[SelectOptions] Saving sort order for ${key} to database:`, url);
  console.log(`[SelectOptions] Payload:`, JSON.stringify(payload, null, 2));
  
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  console.log(`[SelectOptions] Response status:`, res.status);
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[SelectOptions] Failed to save sort order for ${key} to database:`, res.status, errorText);
    throw new Error(`Failed to save sort order for ${key} to database: ${res.status} ${errorText}`);
  }
  
  // データベースへの保存が成功した場合のみ、ローカルストレージにも保存（キャッシュ）
  const result = await res.json();
  console.log(`[SelectOptions] Successfully saved sort order for ${key} to database:`, result);
  
  await AsyncStorage.setItem(`${STORAGE_KEYS[key]}_sort_order`, sortOrder);
  console.log(`[SelectOptions] Saved sort order for ${key} to local storage`);
}

// ホテル用選択肢を保存する（データベースに保存し、成功した場合のみローカルストレージにも保存）
export async function saveStaySelectOptions(
  key: keyof typeof STAY_STORAGE_KEYS,
  options: SelectOption[]
): Promise<void> {
  // 動的インポートで循環依存を回避
  const { authenticatedFetch, getApiUrl } = await import("./api");
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  // まずデータベースに保存
  const url = getApiUrl(`/stay-select-options/${key}`);
  const payload = { options };
  console.log(`[StaySelectOptions] Saving ${key} to database:`, url);
  console.log(`[StaySelectOptions] Payload:`, JSON.stringify(payload, null, 2));
  
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  console.log(`[StaySelectOptions] Response status:`, res.status);
  console.log(`[StaySelectOptions] Response headers:`, Object.fromEntries(res.headers.entries()));
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[StaySelectOptions] Failed to save ${key} to database:`, res.status, errorText);
    throw new Error(`Failed to save ${key} to database: ${res.status} ${errorText}`);
  }
  
  // データベースへの保存が成功した場合のみ、ローカルストレージにも保存（キャッシュ）
  const result = await res.json();
  console.log(`[StaySelectOptions] Successfully saved ${key} to database:`, result);
  
  // データベースへの保存が成功した場合のみ、ローカルストレージにも保存
  await AsyncStorage.setItem(STAY_STORAGE_KEYS[key], JSON.stringify(options));
  console.log(`[StaySelectOptions] Saved ${key} to local storage`);
}
