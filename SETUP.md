# セットアップガイド

## 必要なもの
- Google アカウント
- Gemini API キー（無料）
- 所要時間：約 5 〜 10 分

---

## STEP 1: Gemini API キーを取得する

1. https://aistudio.google.com/app/apikey を開く
2. 「APIキーを作成」をクリック
3. 表示されたキー（`AIza...`で始まる文字列）をコピーしておく

---

## STEP 2: Google Apps Script をデプロイする

GAS はカレンダー登録の中継サーバーとして機能します。以下の手順で自分用にデプロイしてください。

1. https://script.google.com を開き、「新しいプロジェクト」を作成
2. このリポジトリの `gas/parser-core.gs` の中身をエディタに貼り付ける
3. 左メニュー「プロジェクトの設定」→「スクリプトプロパティ」で以下を追加:
   - `GEMINI_API_KEY` : STEP 1 で取得した API キー
   - `CALENDAR_ID` : 登録先の Google カレンダー ID（通常は Gmail アドレス）
4. 右上の「デプロイ」→「新しいデプロイ」をクリック
5. 種類「ウェブアプリ」を選択、「アクセスできるユーザー」を「全員」に設定して「デプロイ」
6. 表示された **ウェブアプリ URL**（`https://script.google.com/macros/s/YOUR_GAS_DEPLOYMENT_ID/exec`）をコピーしておく

> ⚠️ スクリプトプロパティに API キーを保存するため、デプロイした GAS プロジェクトは他人と共有しないでください。

---

## STEP 3: Chrome 拡張機能をインストールする

1. Chrome を開き、アドレスバーに `chrome://extensions` と入力して開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このリポジトリの `chrome-extension/` フォルダを選択して開く
5. 拡張機能一覧に「予定追加ツール」が表示されれば OK

---

## STEP 4: 拡張機能を初期設定する

1. Chrome ツールバーの拡張機能アイコンをクリック
2. オンボーディング画面が開く
3. 以下を入力して「保存」:
   - **Gemini API キー**: STEP 1 でコピーしたキー
   - **GAS ウェブアプリ URL**: STEP 2 でコピーした URL

設定後、任意のウェブページでテキストを選択すると「＋予定」ボタンが表示されます。

---

## STEP 5（任意）: macOS クイックアクションを登録する

Safari やメールなど Chrome 以外のアプリでも使いたい場合。

1. `desktop-quickaction/quick-action-bundle/` の「予定を追加.workflow」をダブルクリック
2. 「Automator に追加」をクリック
3. `desktop-quickaction/add-event.mjs` の先頭にある `GAS_URL` を STEP 2 の URL に書き換える
4. Automator で「インストール」

---

## STEP 6（任意）: LINE 連携を設定する

LINE 経由でもカレンダー登録したい場合は `gas/LINE.gs` を追加デプロイします。  
詳細は `設定手順.md` の「LINE 連携」セクションを参照してください。

---

## トラブルシューティング

| 症状 | 確認ポイント |
|---|---|
| ボタンが表示されない | 拡張機能が有効か確認（chrome://extensions） |
| 「登録に失敗しました」と出る | GAS URL が正しいか確認。GAS を再デプロイして新しい URL に更新する |
| カレンダーに登録されない | GAS スクリプトプロパティの `CALENDAR_ID` が正しいか確認 |
| APIエラーが出る | Gemini API キーが有効か https://aistudio.google.com で確認 |
| GAS の権限エラー | GAS を開き「承認」を実行。Google アカウントでの許可が必要 |
