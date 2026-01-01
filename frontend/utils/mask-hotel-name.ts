// ホテル名をマスクするユーティリティ
export function maskHotelName(hotelName: string, isAuthenticated: boolean): string {
  if (isAuthenticated) {
    return hotelName;
  }
  
  // 非ログイン状態の場合、最初の1文字だけ表示して残りを「*」で置き換える
  if (hotelName.length <= 1) {
    return hotelName;
  }
  
  const firstChar = hotelName[0];
  const masked = '*'.repeat(hotelName.length - 1);
  return firstChar + masked;
}

