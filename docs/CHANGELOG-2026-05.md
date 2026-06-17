# SPEC.md — タスク管理アプリ（tasks管理アプリ）

最終更新: 2026-05-06

---

## 目標

右端ホットゾーン常駐型サイドバーアプリ。LINEからタスク追加・Googleカレンダー同期・予定登録を一元管理する。

---

## アーキテクチャ概要

```
LINE → GAS (Webhook) → Google Sheets (タスク) / Google Calendar (予定)
                           ↑ action=list/update/add/events
Electron (Renderer) ←→ main.js (IPC) ←→ GAS WebApp URL
```

| レイヤー | ファイル | 役割 |
|---|---|---|
| メインプロセス | main.js | IPC・ホットゾーン・カレンダーキャッシュ |
| レンダラー | renderer/*.js | UI・状態管理・同期ループ |
| GAS | gas/LINE.gs | LINE Bot・Sheets操作・Calendar取得 |
| 設定 | gas-config.json | GAS WebApp URL |
| データ | electron-store (tasks) | タスク永続化 |
| データ | calendar-data.json | カレンダーイベントキャッシュ |

---

## GAS エンドポイント仕様

| action | 用途 | 必須パラメータ |
|---|---|---|
| list | タスク一覧取得 | なし |
| update | タスクフィールド更新 | id, field, value |
| add | タスク追加 | title |
| events | カレンダーイベント取得 | date (YYYY-MM-DD) |

**eventsレスポンス形式:**
```json
{
  "success": true,
  "events": [{
    "id": "...",
    "title": "...",
    "start": "ISO8601",
    "end": "ISO8601",
    "allDay": false,
    "location": "",
    "calendar": "RYUI YAMADA",
    "date": "YYYY-MM-DD",
    "startTime": "HH:MM"
  }]
}
```
※ `date` と `startTime` は main.js 側で付与（GASレスポンスには含まれない）

---

## バグ修正チェックリスト（2026-05-06セッション）

### GAS / バックエンド

- [x] **GAS新規デプロイ後のURL更新** — gas-config.json の webAppUrl を更新
- [x] **API_TOKEN認証エラー** — Script PropertiesのAPI_TOKENを削除（token不要設計に変更）
- [x] **updateTaskField の completed 無視** — `field=completed` が column map にないため `{error:"invalid field"}` → タスクが永遠に"未着手"のまま。`completed/archived → "完了"` に更新するハンドラを追加
- [x] **action=events 未実装** — doGet に events ハンドラが存在せず `{error:"unknown action"}` → getCalendarEvents() 関数を追加・デプロイ

### カレンダー表示

- [x] **eventsレスポンスに date フィールドなし** — buildCalendarIndex が `ev.date` を使うが GAS レスポンスに date なし → `_nodate` バケットに格納されて日付検索で0件。main.js の fetchAndMergeCalendarEvents で `date: dateStr` を付与
- [x] **eventsレスポンスに startTime フィールドなし** — UI が `ev.startTime`（HH:MM）を使うが GAS は ISO 文字列の `start` のみ返す → main.js で `start` から `startTime` を生成
- [x] **return で data.events（date なし）を返していた** — eventsWithDate ではなく data.events を返していたため sync.js 側で `result.events[0].date` が undefined → `localEventsByDate[undefined]` に格納。`eventsWithDate` を返すよう修正
- [x] **今日以外の日付をクリックしても予定が表示されない** — selectDay で `isSameDay(今日)` のときだけ triggerCalendarSync() を呼んでいた → 全日付でキャッシュなし時に GAS 同期するよう変更

### タスク同期

- [x] **完了タスクが再起動後に復活** — GAS の updateTaskField が completed を無視 → 上記 GAS 修正で解消
- [x] **完了タスク再追加の二重防止** — sheets-sync.js に `locallyDoneIds` セット + `existsArchived` チェックを追加
- [x] **GAS側で「完了」になっているのにローカルでアーカイブされない** — 同期時に GAS 完了タスクをローカルでもアーカイブする処理を sheets-sync.js に追加

### UI / Electron

- [x] **リセットボタン削除後にアプリがクラッシュ** — events.js で `getElementById('btn-reset-tasks').addEventListener(...)` が null 参照エラー → `?.` オプショナルチェーンに変更
- [x] **ホットゾーン遅延調整** — 0ms（即時）→ 200ms（現在）。onmouseenter + setTimeout で実装
- [x] **setTimeout発火後に hoverTimer がリセットされない** — コールバック内で `hoverTimer = null` を追加
- [x] **離れて再タッチで発火しない（SLIDE_COOLDOWNブロック）** — hideSidebar後にホットゾーンが即復帰 → カーソルがエッジ付近にあると200ms後に再発火するが SLIDE_COOLDOWN(300ms) でブロックされる → `resetCooldown()` を webContents.executeJavaScript で注入し350ms間は発火抑制

### parseText() バグ修正（GAS）

- [x] **「朝/昼/夕方/夜」が時刻変換されない** — 朝→8時、昼→12時、夕方→17時、夜→19時 の前処理追加
- [x] **「再来週X曜」が来週扱いになる** — 再来週ハンドラを来週ハンドラの前に追加
- [x] **「今月N日/来月N日/N日後/週末」が解析されない** — 日付パターン追加
- [x] **「〜から〜まで」の終了時刻が取得されない** — time regex に `から` セパレータを追加
- [x] **@場所 が助詞を含む過剰マッチ** — `[^\s　,、。でにはがをも]` に変更
- [x] **「場所：」の `：` が残る** — `mLoc[1].replace(/^[：:]\s*/, '').trim()` でクリーンアップ

---

## クロスレビュー結果（qa-reviewer 2026-05-06）

- 全14バグ修正項目: コード実装確認済み ✅
- `startTime` UTC→JST変換: `new Date(ISO)` はシステムTZ（Asia/Tokyo）で変換されるため問題なし ✅
- sheets-sync.js 完了タスク重複チェック: `existsArchived` + `locallyDoneIds` の二重保護で問題なし ✅
- **残懸念**: GASのparseText `朝` 変換に lookbehind `(?<!\d)` を使用 → GASはV8エンジンなので動作するが旧GASランタイム(Rhino)では非対応。現時点のGASはV8デフォルトのため問題なし

---

## 現在の既知制限

| 項目 | 内容 | 対応 |
|---|---|---|
| カレンダーキャッシュ | 取得済み日付は再アクセス時に GAS 通信しない（今日は毎回同期） | 意図的設計 |
| LINE タスクソース | GAS Sheets の行番号が id → 行削除で id がずれる可能性 | 未対応 |
| GAS デプロイ | ローカルの gas/LINE.gs を手動でコピー＆ペーストが必要 | 未自動化 |
| parseText AI解析 | Gemini API キーが未設定時はルールベースのみ | 設定依存 |

---

## デプロイ手順（GAS更新時）

1. `gas/LINE.gs` をコピー
2. GAS エディタ → 既存スクリプトに貼り付け
3. デプロイ → **新しいバージョン**（新規デプロイは URL が変わるため禁止）
4. URL が変わった場合は `gas-config.json` の webAppUrl を更新
5. Script Properties: `LINE_TOKEN`, `GEMINI_KEY` のみ設定（API_TOKEN は不要）

---

## 成功基準（現バージョン）

- [ ] ホットゾーン: 200ms待機→発火、離れて再タッチも動作
- [ ] 今日のカレンダー: 起動時に自動同期・表示
- [ ] 他の日付: クリックで GAS 同期・表示（キャッシュなし時）
- [ ] タスク完了: チェック後に再起動しても復活しない
- [ ] LINE登録: 自然語テキストから日時・場所を解析してカレンダー登録
