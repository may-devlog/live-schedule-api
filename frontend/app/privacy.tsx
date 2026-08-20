import React from 'react';
import { StaticInfoPage } from '@/components/StaticInfoPage';

export default function PrivacyScreen() {
  return <StaticInfoPage title="プライバシーポリシー" lead="GenBGTにおける利用者情報の基本的な取り扱い方針です。" sections={[
    { heading: '取得する情報', body: 'アカウント情報、ライブ・交通・宿泊の登録内容、共有設定、プロフィール画像、およびサービスの利用に必要な技術情報を取り扱います。' },
    { heading: '利用目的', body: '本人認証、登録内容の保存・表示、共有ページの提供、サービス改善、不具合対応および安全性確保のために使用します。' },
    { heading: '公開範囲', body: '共有機能を有効にした場合、共有ページに設定された情報とプロフィール画像が公開されます。ホテル名など、画面上でマスク対象としている情報は非公開表示になります。' },
    { heading: '第三者提供と安全管理', body: '法令に基づく場合を除き、利用者の同意なく個人情報を第三者へ提供しません。保存データへの不正アクセス、漏えい、改ざんを防ぐための措置を講じます。' },
  ]} />;
}
