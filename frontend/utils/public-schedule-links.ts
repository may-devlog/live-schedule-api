// 公開/共有スケジュールへのリンク先を組み立てる共通関数。
// PublicSchedule.id は常にpublic_id（推測困難なランダムID）なので、
// 引数を { id: string } に限定することで、内部連番id（Schedule.id: number）を
// 誤って渡した場合に型エラーで気づけるようにしている。
export function publicScheduleHref(schedule: { id: string }): `/public/${string}` {
  return `/public/${schedule.id}`;
}

export function shareScheduleHref(shareId: string, schedule: { id: string }): `/share/${string}/schedules/${string}` {
  return `/share/${shareId}/schedules/${schedule.id}`;
}
