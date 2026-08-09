import React from 'react';
import { StaticInfoPage } from '@/components/StaticInfoPage';

export default function GuideScreen() {
  return <StaticInfoPage title="GenBGTの使い方" lead="ライブの予定から当日の移動、宿泊、思い出までをひとつの場所で管理できます。" sections={[
    { heading: '1. ライブを登録する', body: 'ホーム画面の新規作成から、公演名・日時・会場・出演者などを登録します。登録した予定はカレンダーとNEXT LIVEに反映されます。' },
    { heading: '2. 交通・宿泊をまとめる', body: 'ライブ詳細から交通経路と宿泊情報を追加できます。費用もイベント単位で確認できます。' },
    { heading: '3. 共有ページを公開する', body: 'メニューで共有をONにすると、専用URLからスケジュールを公開できます。ホテル名など一部の情報は共有画面でマスクされます。' },
    { heading: '4. アーカイブを振り返る', body: '終了したライブは年別アーカイブから確認できます。ログイン状態では宿泊の記録も切り替えて表示できます。' },
  ]} />;
}
