// ホテル名をマスクするユーティリティ
export function maskHotelName(hotelName: string, isAuthenticated: boolean): string {
  if (isAuthenticated) {
    return hotelName;
  }
  
  // 非ログイン状態の場合、すべての文字を「*」で置き換える
  return '*'.repeat(hotelName.length);
}

