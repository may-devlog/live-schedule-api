import React from 'react';
import { StaticInfoPage } from '@/components/StaticInfoPage';

export default function TermsScreen() {
  return <StaticInfoPage title="利用規約" lead="GenBGTをご利用いただく際の基本的なルールです。" notice="これはサービス準備中の暫定版です。正式公開前に運営者情報、準拠法、問い合わせ窓口を確定して更新します。" sections={[
    { heading: 'アカウント管理', body: '利用者は正確な情報を登録し、認証情報を自身の責任で安全に管理するものとします。第三者による利用が判明した場合は、速やかに認証情報を変更してください。' },
    { heading: '禁止事項', body: '法令に違反する行為、第三者の権利を侵害する行為、サービスへの不正アクセス、過度な負荷を与える行為、他者になりすます行為を禁止します。' },
    { heading: '共有機能', body: '共有URLを公開した場合、そのURLを知る第三者が共有情報を閲覧できます。公開範囲と登録内容を確認したうえで利用してください。' },
    { heading: 'サービスの変更・停止', body: '保守、安全性確保、その他必要な場合に、事前の通知なくサービスの一部を変更または停止することがあります。' },
  ]} />;
}
