const pad = (value: number) => String(value).padStart(2, "0");

function oneMonthBefore(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const previousMonthLastDay = new Date(year, month, 0).getDate();
  // 前月に同日がない場合、JRの発売規則では「乗車月の1日」となる。
  return day > previousMonthLastDay
    ? new Date(year, month, 1, 10, 0, 0, 0)
    : new Date(year, month - 1, day, 10, 0, 0, 0);
}

function format(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 備考の商品名（部分一致）から予約開始日時を提案する。返り値は日本時間の画面形式。 */
export function suggestTrafficReservationStart(dateValue: string | null, notes: string): string | null {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return null;
  const travelDate = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (notes.includes("トクだ値")) {
    const start = oneMonthBefore(travelDate);
    start.setDate(start.getDate() - 7);
    start.setHours(14, 0, 0, 0);
    return format(start);
  }

  if (/EX早特1(?![0-9])/.test(notes)) {
    const start = new Date(travelDate);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return format(start);
  }

  // EX早特7、およびEX早特3/21など現行のその他早特は1か月前10:00発売。
  if (notes.includes("EX早特7") || notes.includes("EX早特")) {
    return format(oneMonthBefore(travelDate));
  }

  return null;
}
