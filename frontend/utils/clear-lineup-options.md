# Lineup選択肢をクリアする方法

本番環境のLineup（TARGETS）選択肢を空にするには、ブラウザの開発者ツールを使用します。

## 手順

1. **本番環境でアプリを開く**
   - 本番環境のURL（Cloudflare Pages）にアクセス

2. **ブラウザの開発者ツールを開く**
   - Windows/Linux: `F12` または `Ctrl + Shift + I`
   - Mac: `Cmd + Option + I`

3. **Applicationタブ（Chrome）またはStorageタブ（Firefox）を開く**
   - 左側のメニューから「Application」または「Storage」を選択

4. **Local Storageを展開**
   - 「Local Storage」をクリックして展開
   - 本番環境のURLを選択（例: `https://your-app.pages.dev`）

5. **TARGETSキーを削除**
   - `@select_options:targets` キーを探す
   - 右クリック → 「Delete」を選択
   - または、キーを選択して「Delete」キーを押す

6. **ページをリロード**
   - `F5` または `Cmd + R`（Mac）でページをリロード

## 確認方法

ページをリロード後、Lineupの選択肢が空になっていることを確認してください。
新規スケジュール作成画面や編集画面で、Lineupの選択肢が表示されないことを確認します。

## 注意事項

- この操作はブラウザごとに実行する必要があります
- 異なるブラウザやデバイスでは、それぞれ個別に削除する必要があります
- 削除後は、デフォルトの選択肢（「Artist A」）が表示される可能性があります

