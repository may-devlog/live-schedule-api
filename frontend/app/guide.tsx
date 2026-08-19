import React from 'react';
import { StaticInfoPage } from '@/components/StaticInfoPage';

export default function GuideScreen() {
  return <StaticInfoPage title="GenBGTの使い方" lead="ライブの予定はもちろん、当日の移動や宿泊、費用まで、まとめてひとつの場所で管理できます。" sections={[
    {
      heading: '1. ライブの予定を登録する',
      body: '公演名・日時・会場・出演者・グループなどを登録します。グループ・カテゴリ・エリア・お目当てなどの選択肢は自分で自由に作成でき、色や並び順（五十音順・カスタム順）も自由にカスタマイズできます。登録した予定はカレンダーとNEXT LIVEに反映されます。',
      images: [
        { source: require('@/assets/images/guide/schedule-new-form.png'), caption: 'ライブの登録画面' },
        { source: require('@/assets/images/guide/select-options-reorder.png'), caption: '選択肢は自分で作成でき、↑↓で並び順も自由に変更できます', aspectRatio: 1333 / 1600 },
        { source: require('@/assets/images/guide/select-options-color.png'), caption: '選択肢ごとに色も自由にカスタマイズできます', aspectRatio: 1333 / 1600 },
      ],
    },
    {
      heading: '2. 交通・宿泊情報を紐づける',
      body: 'スケジュール詳細から交通（区間・往復・費用）と宿泊（チェックイン・チェックアウト・料金・キャンセル期限）を追加できます。費用は自動集計され、遠征全体の合計金額としてまとめて確認できます。',
      images: [
        { source: require('@/assets/images/guide/schedule-traffic-stay.png'), caption: '交通・宿泊情報を紐づけると遠征費合計が自動で計算されます' },
      ],
    },
    {
      heading: '3. 関連スケジュールで同一遠征をまとめる',
      body: '同じ遠征（遠征初日・2日目や、同じ旅程の複数公演など）のスケジュール同士を「関連スケジュール」として紐づけられます。詳細画面から他の日程へすぐに移動でき、遠征全体を見渡せます。',
      images: [
        { source: require('@/assets/images/guide/related-schedule-picker.png'), caption: '関連スケジュールの選択画面。同一遠征の予定をまとめて紐づけられます' },
      ],
    },
    {
      heading: '4. 出発地・到着地をマスクして安全に共有する',
      body: '設定画面で自分の最寄駅などをあらかじめ登録しておくと、共有ページ上ではその駅名が「***」に置き換わって表示されます。宿泊先のホテル名も、ログインしていない閲覧者には表示されません。行動範囲を知られる心配なく、安心して予定を共有できます。',
      images: [
        { source: require('@/assets/images/guide/masked-locations.png'), caption: 'マスクしたい駅名をあらかじめ登録' },
        { source: require('@/assets/images/guide/share-page-masked.png'), caption: '共有ページでは出発駅が「***」に、宿泊先の名前は非表示になります' },
      ],
    },
    {
      heading: '5. 共有ページを公開する',
      body: 'アカウントメニューの「共有化」をONにすると、専用URLからスケジュールを公開できます。家族や友人はログインなしで、カレンダーや遠征の詳細を閲覧できます。',
      images: [
        { source: require('@/assets/images/guide/share-page-anonymous.png'), caption: '共有ページはログインなしで閲覧できます' },
      ],
    },
    {
      heading: '6. カレンダー・アーカイブで振り返る',
      body: 'カレンダー表示で日程を一目で確認できるほか、終了したライブは年別アーカイブからいつでも振り返れます。',
      images: [
        { source: require('@/assets/images/guide/calendar.png'), caption: '登録した予定はカレンダーに反映されます' },
      ],
    },
    {
      heading: '7. 通知を受け取る',
      body: '宿泊のキャンセル料発生日時が近づくと、メールまたはアプリのプッシュ通知でお知らせします。設定画面からON・OFFを切り替えられます（プッシュ通知はスマートフォンアプリのみの対応です）。',
      images: [
        { source: require('@/assets/images/guide/notification-settings.png'), caption: '通知設定画面' },
      ],
    },
    {
      heading: '8. プレミアムプランでできること',
      body: 'プレミアムプラン（月額400円、初回1ヶ月の無料トライアルあり）に登録すると、共有ページの公開と、アーカイブの無制限閲覧（無料プランは直近2年分まで）が可能になります。設定はアカウントメニューからいつでも変更できます。',
      images: [
        { source: require('@/assets/images/guide/account-menu-premium.png'), caption: '共有化やプレミアムプランの設定はアカウントメニューから', aspectRatio: 977 / 1600 },
      ],
    },
  ]} />;
}
