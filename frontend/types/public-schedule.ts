// 公開ページ・共有ページ（/public, /share）専用の型定義
// これらのAPIはURLに使う内部連番の代わりに推測困難なランダムID（public_id）を使うため、
// 認証済みCRUD用の Schedule/Traffic/Stay 型（id: number）とは別に定義する

export type PublicSchedule = {
  id: string; // = public_id
  title: string;
  group: string | null;
  datetime: string;
  date?: string | null;
  open?: string | null;
  start?: string | null;
  end?: string | null;
  notes?: string | null;
  category?: string | null;
  area: string;
  venue: string;
  target?: string | null;
  lineup?: string | null;
  seller?: string | null;
  ticket_fee?: number | null;
  drink_fee?: number | null;
  total_fare?: number | null;
  stay_fee?: number | null;
  travel_cost?: number | null;
  total_cost?: number | null;
  status: string;
  related_schedule_ids: string[];
  is_public: boolean;
};

export type PublicTraffic = {
  id: string; // = public_id
  schedule_id: string; // = 親スケジュールのpublic_id
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

export type PublicStay = {
  id: string; // = public_id
  schedule_id: string; // = 親スケジュールのpublic_id
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
