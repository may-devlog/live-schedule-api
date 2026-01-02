# 選択肢の同期方法

Lineup（TARGETS）の選択肢は、ブラウザのローカルストレージ（AsyncStorage）に保存されています。
ローカル環境と本番環境で選択肢を同期するには、以下の手順を実行してください。

## 方法1: ブラウザの開発者ツールを使用（推奨）

### ローカル環境から選択肢をエクスポート

1. ローカル環境でアプリを開く
2. ブラウザの開発者ツール（F12）を開く
3. 「Application」タブ（Chrome）または「Storage」タブ（Firefox）を開く
4. 「Local Storage」を展開
5. `@select_options:targets` キーを探す
6. 値をコピー（JSON形式）

### 本番環境に選択肢をインポート

1. 本番環境でアプリを開く
2. ブラウザの開発者ツール（F12）を開く
3. 「Application」タブ（Chrome）または「Storage」タブ（Firefox）を開く
4. 「Local Storage」を展開
5. `@select_options:targets` キーを追加または編集
6. ローカルからコピーしたJSONを貼り付け
7. ページをリロード

## 方法2: コンソールコマンドを使用

### ローカル環境からエクスポート

ブラウザのコンソールで以下を実行：

```javascript
// TARGETS（Lineup）の選択肢をエクスポート
const targets = localStorage.getItem('@select_options:targets');
console.log('TARGETS:', targets);
// 出力されたJSONをコピー
```

### 本番環境にインポート

ブラウザのコンソールで以下を実行（`<JSON>`をエクスポートしたJSONに置き換え）：

```javascript
// TARGETS（Lineup）の選択肢をインポート
localStorage.setItem('@select_options:targets', '<JSON>');
// ページをリロード
location.reload();
```

## 注意事項

- 選択肢はブラウザごとに保存されるため、異なるブラウザやデバイスでは別々に設定する必要があります
- 選択肢を削除すると、その選択肢を使用しているスケジュールの表示に影響が出る可能性があります
- 選択肢の色情報も含まれるため、完全なJSONをコピーしてください

