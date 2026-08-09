import React from 'react';
import { StaticInfoPage } from '@/components/StaticInfoPage';

export default function ContactScreen() {
  return <StaticInfoPage title="お問い合わせ" lead="GenBGTへのご意見・不具合報告を受け付ける窓口です。" notice="現在、お問い合わせフォームを準備しています。送信・保存機能の公開までもうしばらくお待ちください。" sections={[
    { heading: 'お問い合わせフォームについて', body: '今後、このページから件名・お問い合わせ内容を送信できるようにする予定です。送信履歴の安全な保存と通知先メールの準備後に公開します。' },
    { heading: '不具合が発生した場合', body: '画面名、操作手順、表示されたメッセージ、発生日時を控えておくと、フォーム公開後の確認がスムーズです。パスワードなどの機密情報は記録しないでください。' },
  ]} />;
}
