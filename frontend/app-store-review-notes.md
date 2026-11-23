# App Store審査メモ（再提出用）

以下をApp Store Connectの「App Reviewに関する情報」>「メモ」に貼り付け、`[SCREEN_RECORDING_URL]`を実際の動画URLに置き換える。
ユーザー名とパスワードはメモ本文ではなく、同じ画面の「サインイン情報」欄に入力する。

---

Thank you for reviewing GenBGT. We tested the submitted build on a physical iPad running the latest available iPadOS.

1. Physical-device screen recording

Recording URL: [SCREEN_RECORDING_URL]

The recording starts by launching GenBGT from the iPad Home Screen and demonstrates login, the calendar, viewing and editing a sample live schedule, managing transportation and accommodation information, the yearly archive, notification settings, and the in-app account-deletion screen.

Account registration is not offered in the iOS app. The iOS app provides login for an existing account and in-app account deletion. There is no public user search, public sharing, user-generated-content feed, purchase flow, checkout link, subscription-management link, or prompt to purchase in the iOS app.

2. Purpose, target audience, problem, and value

GenBGT is a personal organizer for people who attend concerts and other live events, particularly users who travel to events in Japan. It solves the problem of event schedules, transportation, accommodation, venues, and related expenses being scattered across separate calendars, notes, and booking records. The app lets each user privately manage this information in one place.

3. Setup and access instructions

- Launch the app and sign in with the demo credentials supplied in the App Review Information sign-in fields.
- The demo account is verified and contains a private sample schedule named “GenBGT Sample Live.”
- On Home, use the calendar or “NEXT LIVE” card to open the sample schedule.
- The schedule detail screen shows the event date, venue, transportation, accommodation, and expense information.
- Use the create/edit controls to add or update a schedule.
- Open Archive to review schedules by year.
- Open the bell icon or Account menu to review notification settings.
- To access account deletion, open the Account menu, select “退会,” and follow the confirmation flow. Reviewers may cancel before the final deletion so the supplied demo account remains available throughout review.

No sample file is required. The backend API and demo account will remain available throughout the review period.

4. External services, tools, and platforms

- GenBGT backend API hosted on Amazon Web Services (AWS): authentication and private user data storage.
- Expo / React Native / EAS: application framework and build delivery.
- Expo Notifications and Apple Push Notification service (APNs): optional push notifications.
- Resend: transactional email such as email verification and password reset.
- Stripe is used only on the separately operated web service. The submitted iOS app has no payment, purchase, checkout, plan-change, external-payment link, or call to action for paid services.
- Anthropic Claude is used only by an optional schedule-import feature on the web service. That feature is not available in the submitted iOS build.

5. Regional differences

The app is distributed in Japan and provides the same iOS features to all users in the supported region. The primary user interface language is Japanese. There are no region-specific feature or content differences within the supported region.

6. Regulated industries and protected third-party material

GenBGT is a personal schedule and travel-expense organizer. It does not provide medical, financial, legal, gambling, or other regulated services. The submitted app does not bundle or distribute protected third-party media. Event names, venues, transportation, accommodation, and expenses are private records entered by the user for personal organization.

---

## iPad実機録画手順

録画前に、TestFlightで最新のビルド6をインストールし、iPadOSを利用可能な最新版へ更新する。

1. iPadのホーム画面を表示する。
2. コントロールセンターから画面収録を開始し、3秒のカウントダウンを待つ。
3. GenBGTをタップして起動する。
4. 審査用アカウントでログインする。
5. ホーム画面のカレンダーと「NEXT LIVE」を表示する。
6. 「GenBGT Sample Live」を開き、予定詳細を下までゆっくり表示する。
7. 編集画面を開き、編集可能であることを示して保存せず戻る。
8. 交通・宿泊情報を開いて内容を表示する。
9. アーカイブ画面を開く。
10. 通知設定を開く。
11. アカウントメニューから「退会」を開き、最終確認の直前でキャンセルする。
12. iPadのホーム画面へ戻り、画面収録を停止する。

目安は2〜4分。パスワード入力部分は録画に映さないか、提出前に確実にマスクする。
