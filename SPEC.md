# SPEC.md — tasks-manager 機能仕様書

最終更新: 2026-06-12 / 対象バージョン: v2.0.0
旧 SPEC.md（2026-05-06 バグ修正履歴）は `docs/CHANGELOG-2026-05.md` に退避。

> 本書は「現に動作している機能」の正本。リファクタリング（docs/tasks-manager-v1.1.5-refactor-plan.md）は本書の全機能を保持することを完了条件とする。

---

## 1. 目的・全体像

右端ホットゾーン常駐型の macOS サイドバーアプリ（Electron）。LINE からのタスク追加・Google カレンダー同期・予定登録を一元管理する。利用者は1名（個人運用・launchd 常駐）。

```
LINE → GAS (Webhook) → Google Sheets (タスク) / Google Calendar (予定)
                           ↑ doGet: action=list/update/add/events
Electron Renderer ←(window.api / IPC)→ main.js ←(HTTPS)→ GAS WebApp
                                        ←(HTTPS)→ Gemini API
Renderer ←(localhost:11434)→ Ollama (任意・ローカルLLM)
```

| レイヤー | ファイル | 役割 |
|---|---|---|
| メインプロセス | main.js | ウィンドウ・ホットゾーン・IPC・GAS/Gemini 通信・キャッシュ |
| ブリッジ | preload.js | Context Isolation 下で `window.api` を公開 |
| レンダラー | renderer.js + renderer/ (14モジュール) | UI・状態管理・同期ループ・自然言語解析 |
| GAS | gas/LINE.gs | LINE Bot・Sheets/Calendar 操作・朝の配信・OCR |
| 設定 | gas-config.json / .env / renderer/constants.js | §6 参照 |
| 永続化 | electron-store (tasks) / calendar-data.json / pending-events.json | ローカルデータ |

---

## 2. 機能仕様

### 2.1 サイドバー表示（ホットゾーン）
- 画面右端 6px・上 100px / 下 70px マージンの透明帯にマウスが触れて **200ms 滞在**で幅 324px のサイドバーがスライドイン（100ms）
- マウスアウト（デバウンス後）でスライドアウト（150ms）。直後 300ms はクールダウン（SLIDE_COOLDOWN）、hide 後 350ms は再発火抑制
- 📌 ピン留めで常時表示。トレイアイコンから表示/終了可能
- 除外アプリ（Lightroom / Capture One / Illustrator）前面中はホットゾーン無効＋サイドバー自動非表示
- ホットゾーン異常はヘルスチェック（30秒間隔）で自動修復。スリープ復帰・画面ロック解除時も修復
- ⚠️ タイミング値（200/300/350/100/150ms）は macOS 実機調整値。**変更禁止**

### 2.2 カレンダー
- 月カレンダー表示・日付選択。ハピネッツ試合日（constants.js の HAPPINETS_GAME_DAYS）を色付き表示
- 選択日の予定一覧表示（終日/時刻つき、場所、カレンダー名）
- 同期: 起動時に今日を GAS 同期。以後 30 秒間隔（SWR・最小再同期 60 秒）。キャッシュなし日付はクリック時に同期
- キャッシュ: main 側 calendar-data.json + メモリ（日付別インデックス）。3ヶ月超の過去分は1時間ごとに剪定。破損時はバックアップ作成→再生成
- 日付変更を1分ごとに検知し、日をまたいだら今日へ自動切替

### 2.3 タスク管理
- 4カラム: 今日中(today/赤)・できたら(soon/黄)・いつでも(anytime/青)・開発検討(dev/紫)
  - `dev` はローカル手動管理専用。LINE 自動振り分け対象外（GAS・VALID_PRIORITIES から除外）
- サイドバー表示時に入力欄へ即フォーカス。Enter で即追加
- ドラッグ&ドロップでカラム間移動
- チェック ON 後 **4秒**（ARCHIVE_DELAY_MS）で自動アーカイブ。アーカイブは electron-store に永続化、メモリは24時間で退避
- 再起動後も完了タスクは復活しない（GAS 側「完了」化 + locallyDoneIds 二重防止）
- 本日のまとめ: 完了/未完了を集計・表示。「カレンダーへ登録」ボタンは v2 で撤去（2026-06-12 龍偉裁定）。まとめ表示は維持。
- タスクリセット（全クリア・確認あり）・完了履歴の蓄積（data-store）

### 2.4 LINE 連携（GAS）
- テキスト送信 → 解析 → **日付あり=カレンダー即登録 / 日付なし=Sheets にタスク追記**（アプリが60秒間隔で取得・マージ）
- 画像送信 → OCR（Drive API）→ 確認フロー → 登録
- URL 送信 → ページタイトル取得 → 確認フロー → 登録
- 確認フロー: 「はい/いいえ」応答。新規メッセージで自動キャンセル
- 朝の配信: 毎朝トリガーで天気・花粉・当日予定を push
- 重複排除: LockService + メッセージ ID

### 2.5 自然言語解析（3段フォールバック）
サイドバー入力: ① Gemini 2.5 Flash（main.js 経由・15秒タイムアウト）→ ② 正規表現パーサー（renderer/nlp-parser.js）→ ③ Ollama qwen2.5:3b でタイトル補正（任意）
LINE 入力: GAS 内 parseText（正規表現）+ parseWithGemini（タイトル/カレンダー分類）
解析対象: 相対日付（明日/来週X曜/再来週X曜/N日後/今月N日/来月N日/週末）・時間帯語（朝=8時/昼=12時/夕方=17時/夜=19時）・時刻範囲（〜から〜まで）・@場所/場所：
※ 正規表現パーサーは gas/parser-core.gs が唯一の正本（v2.0.0 で一本化済み）。renderer は vm ラッパ経由・GAS は薄いアダプタ経由で同一コアを使用し、パリティテスト150件で同一性を恒久保証

### 2.6 起動・常駐
- launchd（com.ryui.task-calendar-sidebar / RunAtLoad + KeepAlive）で自動起動・異常終了時自動復帰
- 二重起動防止（requestSingleInstanceLock）
- 起動8段階: キャッシュロード→ウィンドウ→ホットゾーン→トレイ→ヘルスチェック→（除外アプリ監視・剪定）→GAS同期→位置調整→フォールバック表示（5秒）
- クラッシュ検知: 30秒以内の再起動を startup.log に記録

---

## 3. IPC 契約（window.api 全25メソッド）

| メソッド | channel | 種別 | 用途 |
|---|---|---|---|
| getCalendarConfig | get-calendar-config | invoke | カレンダー設定取得 |
| getTasks / saveTasks / resetTasks | get-tasks 等 | invoke | タスク CRUD（electron-store） |
| loadCalendarData / saveCalendarData | load/save-calendar-data | invoke | キャッシュ読書 |
| syncCalendar / prefetchCalendarRange | sync-calendar 等 | invoke | GAS 同期 |
| createCalendarEvent | create-calendar-event | invoke | GAS 経由で予定即登録 |
| syncTasksFromSheet / updateSheetTask | sync-tasks-from-sheet 等 | invoke | Sheets 同期 |
| saveGasConfig / loadGasConfig | save/load-gas-config | invoke | GAS URL 設定 |
| mouseEnterWindow / mouseLeaveWindow | mouse-enter/leave-window | send | マウス状態 |
| pinWindow / closeWindow | pin-window / close-window | send | ピン留め・閉じる |
| onSidebarShown / onCalendarUpdated | sidebar-shown 等 | on | main→renderer 通知 |
| parseEventWithGemini | parse-event-with-gemini | invoke | Gemini 解析 |
| dataStoreLoad / dataStoreSave | data-store:load/save | invoke | 完了履歴 |
| loadDashboardData | load-dashboard-data | invoke | ダッシュボード |
| getAppConfig | get-app-config | invoke | app-config.json の内容取得（P2-3 追加） |
| getGameDays | get-game-days | invoke | ハピネッツ試合日取得（GAS または定数フォールバック・P2-4 追加） |

IPC 追加時は main.js（ハンドラ）と preload.js（公開）の両方を更新する。

---

## 4. GAS API 契約

エンドポイント: gas-config.json `webAppUrl`（doGet）

| action | パラメータ | 返却 |
|---|---|---|
| list | — | `{success, tasks:[{id,title,priority,...,source:"line"}]}` |
| update | id, field, value | completed/archived → Sheets「完了」化 |
| add | title | registerTask() に委譲 |
| events | date (YYYY-MM-DD) | `{success, events:[{id,title,start,end,allDay,location,calendar}]}` |

- `date`/`startTime` フィールドは **main.js 側で付与**（GAS は返さない）
- doPost = LINE Webhook 専用
- 認証: 現状なし（URL 秘匿のみ）。Phase 6 で API_TOKEN（.env 保管）+ ALLOWED_USER_ID 必須化予定
- デプロイ: `npm run gas:push`（clasp）。デプロイは「新しいバージョン」（URL 維持）。Script Properties: LINE_TOKEN, GEMINI_KEY（+Phase 6 以降 API_TOKEN, ALLOWED_USER_ID）

---

## 5. 成功基準（回帰チェックリスト）

```
□ npm test 全PASS
□ アプリ起動 → トレイアイコン表示 → ホットゾーン 200ms 発火
□ 離れて再タッチで再発火（クールダウン明け）
□ ピン留め ON で常時表示維持
□ 起動時に今日の予定が自動同期・表示
□ 過去/未来の日付クリックで予定表示（キャッシュなし日付は GAS 同期）
□ タスク追加（Enter 即追加）→ 3カラム D&D 移動 → チェック後4秒でアーカイブ
□ アプリ再起動後、完了タスクが復活しない
□ サイドバーの自然言語入力で予定登録（確認パネル → カレンダー反映）
□ LINE からタスク送信 → 60秒以内にサイドバーへ出現
□ LINE から日付つきメッセージ → カレンダー即登録
□ Lightroom 起動中はホットゾーン無効化
□ 本日のまとめ生成・表示（※カレンダー登録ボタンは既知の不具合のため対象外）
□ 他日付クリック → 今日に戻る、を繰り返してもキャッシュ表示が正しい
```

---

## 6. 設定の正本

| 設定 | 置き場所 | 備考 |
|---|---|---|
| GAS WebApp URL | gas-config.json `webAppUrl` | .env の GAS_WEB_APP_URL は**読まれない**（Phase 2 で整理） |
| GEMINI_API_KEY | .env | git 非追跡（履歴クリーン確認済み） |
| カレンダー選定 | GAS 側 LINE.gs CFG.CAL | .env の CALENDAR_N_ID は死に設定（Phase 1 で削除・2026-06-12 龍偉裁定） |
| 間隔・遅延定数 | renderer/constants.js + main.js 冒頭 | タイミング値は変更禁止 |
| ハピネッツ試合日 | GAS action=gamedays（試合日程カレンダー由来・自動）| constants.js はフォールバック。来季日程公開後は自動反映 |

## 7. 既知の制限
| 項目 | 内容 | 対応 |
|---|---|---|
| タスク ID | Sheets 行番号のため行削除でずれる | Phase 6 で UUID 化 |
| GAS 認証 | なし（URL 秘匿のみ） | Phase 6 で API_TOKEN |
| parseText AI 解析 | GEMINI_KEY 未設定時はルールベースのみ | 設計どおり |

## 📜 更新履歴
- 2026-06-12 — 全面改訂: バグ修正履歴を docs/CHANGELOG-2026-05.md に退避し、機能仕様書として再建（リファクタ Phase 0 / P0-1）
