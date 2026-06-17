# desktop-quickaction — macOS クイックアクション「予定を追加」

Slack・LINE・メール等あらゆる macOS アプリで  
テキスト選択 → 右クリック → 「予定を追加」→ 確認ダイアログ → Google Calendar 登録。

## 仕組み

```
選択テキスト
  → クイックアクション (~/Library/Services/予定を追加.workflow)
  → add-event.mjs (Node CLI)
  → Gemini API 解析
  → osascript 確認ダイアログ（タイトル編集可）
  → GAS createEvent POST
  → osascript 通知（成功 or エラー）
```

## 設定ファイル（秘密管理）

`../chrome-extension/config.defaults.local.json` を自動参照（Chrome拡張と共有）。
別途設定不要。Chrome拡張の設定が完了していれば即使える。

## インストール（初回のみ）

workflow バンドルは `~/Library/Services/予定を追加.workflow` に設置済み。  
macOS にサービスを認識させるには以下の手順を龍偉が1回だけ実施：

### 方法 A: キーボードショートカット設定から有効化（推奨）

1. Apple メニュー → システム設定 → キーボード
2. 「キーボードショートカット...」→ 左サイドバー「サービス」→「テキスト」
3. 「予定を追加」にチェックを入れる（なければ一覧をスクロール）
4. 任意でショートカットキーを割り当て

### 方法 B: ターミナルで即時更新

```bash
/System/Library/CoreServices/pbs -update
```

実行後、アプリを再起動すると右クリックメニューに表示される。

### 使い方

1. 任意のアプリでテキストを選択
2. 右クリック → 「サービス」→ 「予定を追加」
3. 確認ダイアログでタイトルを確認・編集 → 「登録」
4. 通知で完了を確認

## CLI テスト

```bash
cd desktop-quickaction

# dry-run（解析のみ・ダイアログなし・実登録なし）
node add-event.mjs --dry-run "2026年7月20日(月)14:00〜15:00 スポンサーMTG オンライン https://zoom.us/j/999"

# no-confirm（確認ダイアログ省略・実登録）
node add-event.mjs --no-confirm "テストイベントDELETE 明日の15時から1時間"

# stdin 入力
echo "来週月曜 10:00 チームMTG" | node add-event.mjs --dry-run
```

## node パス

`/opt/homebrew/bin/node` (v25.8.1) をハードコード。  
nvm 等で場所が変わった場合は `document.wflow` の COMMAND_STRING を更新する：

```bash
which node  # 実パスを確認してから
```

## ファイル構成

```
desktop-quickaction/
├── add-event.mjs          # Node CLI 本体
└── README.md              # このファイル

~/Library/Services/
└── 予定を追加.workflow/
    └── Contents/
        ├── Info.plist     # Services メタデータ
        └── document.wflow # Automator アクション定義
```
