// ホテル名をマスクするユーティリティ
export function maskHotelName(hotelName: string, isAuthenticated: boolean): string {
  if (isAuthenticated) {
    return hotelName;
  }
  
  // 非ログイン状態の場合、文字数が分からないように固定のマスク表示にする
  return '***';
}

