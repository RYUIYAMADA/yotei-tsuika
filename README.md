# 予定追加ツール

**Windows・Mac 両対応。** GitHub Releases からインストーラをダウンロードしてすぐ使えます。

テキストを選択するだけで、AI が日時・場所を解析して Google カレンダーに自動登録します。

> 🔗 紹介ページ: https://ryuiyamada.github.io/yotei-tsuika-lp/

---

## ダウンロード・インストール

[GitHub Releases](../../releases/latest) から OS 別のインストーラをダウンロードしてください。

| OS | ファイル | 手順 |
|---|---|---|
| macOS | `.dmg` | ダウンロード後ダブルクリック → アプリをApplicationsへドラッグ |
| Windows | `.exe`（NSIS インストーラ） | ダウンロード後ダブルクリックしてインストール |
| Windows | `-portable.exe` | インストール不要・そのまま起動可能 |

### 未署名警告について（コード署名なし）

本アプリはコード署名を行っていないため、初回起動時に OS の警告が表示されます。

**macOS:**
1. `.dmg` を開いてアプリを Applications へコピー後、右クリック →「開く」を選択
2. 「開発元を確認できません」ダイアログで「開く」をクリック

**Windows:**
1. インストーラ実行時「WindowsによってPCが保護されました」が出たら「詳細情報」をクリック
2. 「実行」をクリック

---

## Windows での機能制限

| 機能 | Mac | Windows |
|---|---|---|
| Chrome 拡張でのテキスト選択→予定追加 | ✅ | ✅ |
| AI による日時・場所の自動解析 | ✅ | ✅ |
| 確認ポップアップ | ✅ | ✅ |
| macOS クイックアクション（右クリック） | ✅ | — 非対応（Mac 専用機能） |
| 右端ホットゾーンによるサイドバー自動表示 | ✅ | — 非対応（Mac 専用機能）。タスクトレイアイコンから表示 |
| 除外アプリ（Lightroom 等）の自動検知 | ✅ | — 非対応（osascript 依存） |

---

## 主な機能

- **Chrome 拡張** — ウェブページでテキストを選択すると「＋予定」ボタンが出現。ワンクリックで登録
- **AI 解析（Gemini）** — 「来週月曜 14時 渋谷で打合せ」のような自然な日本語テキストを自動解釈
- **確認ポップアップ** — 登録前に日時・場所・タイトルを確認・編集できる
- **macOS クイックアクション（任意）** — Safari や他アプリでも右クリックから登録可能
- **LINE 連携（任意）** — LINE の文字列を転送するだけで登録

---

## スクリーンショット

| テキスト選択 → ボタン表示 | 確認ポップアップ | オンボーディング |
|---|---|---|
| ![select](landing-page/assets/select-button.png) | ![confirm](landing-page/assets/confirm.png) | ![onboarding](landing-page/assets/onboarding.png) |

---

## 初期設定

インストール後の初期設定（Gemini API キー取得・GAS デプロイ）は **[SETUP.md](./SETUP.md)** を参照してください（所要時間：約 5〜10 分）。

---

## 技術構成

| コンポーネント | 技術 |
|---|---|
| Chrome 拡張 | Manifest V3（Vanilla JS） |
| AI 解析バックエンド | Google Apps Script + Gemini API |
| macOS クイックアクション | Node.js（ESM） |
| LINE 連携 | Google Apps Script |

各自が自分の Google アカウントで GAS をデプロイして使う方式のため、サーバー費用は不要です。

---

## 免責事項

- 本ツールの利用には Google アカウントおよび Gemini API キー（各自取得）が必要です
- GAS・Gemini の利用規約・利用制限はそれぞれのサービスに従います
- カレンダー登録の正確性は AI 解析に依存します。重要な予定は必ず確認してください

---

## ライセンス

MIT License — 詳細は [LICENSE](./LICENSE) を参照
