# tasks-manager Chrome 拡張

ブラウザで**テキストを選択 → 右クリック → 「予定を追加」** で、
tasks-manager と同じ精度・同じカレンダーに予定を登録できる Chrome 拡張（Manifest V3）。

---

## インストール手順

1. `chrome://extensions` を開く
2. 右上の **「デベロッパーモード」** をオンにする
3. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
4. このフォルダ（`chrome-extension/`）を選択

---

## 初期設定

### 龍偉ローカル（入力不要・自動シード）

`config.defaults.local.json` に3値を入れておけば拡張ロード時に `chrome.storage` へ自動シードされる。
手動で options 画面に入力する必要はない。

```bash
# example をコピーして実値を入れる（local.json は .gitignore 済み。コミットされない）
cp config.defaults.example.json config.defaults.local.json
# エディタで実値を入力後、chrome://extensions でリロード
```

> **実値はこの README に書かない。** `config.defaults.local.json` のみに記載すること。

**確認手順**: リロード後にツールバーのアイコンをクリックして options を開き、3値（APIキー・GAS URL・GASトークン）が入力済みになっていれば成功。入っていなければ `config.defaults.local.json` の配置・JSON形式を確認すること。

### 別環境・初回セットアップ（local ファイルなし）

`config.defaults.local.json` が無い場合は自動シードをスキップし、options 入力にフォールバックする。
ツールバーのアイコンをクリックして設定画面を開き、以下の3値を入力して「保存」。

| 項目 | 説明 |
|---|---|
| **GEMINI_API_KEY** | Google AI Studio で取得した API キー（`AIza...` で始まる） |
| **GAS WebアプリURL** | tasks-manager の GAS をデプロイした「ウェブアプリURL」（`https://script.google.com/macros/s/...`） |
| **GAS トークン** | GAS 側の `apiToken2` と一致するトークン（**必須**） |

---

## 使い方（3ステップ）

1. ページ上のテキストを**選択**する（メール本文・告知文など）
2. **右クリック → 「予定を追加」**
3. 解析結果が確認ポップアップに表示される。内容を確認・編集して **「登録」**

登録が完了するとデスクトップ通知で「予定を登録しました」と表示される。

---

## ファイル構成

```
chrome-extension/
  manifest.json      # MV3 マニフェスト
  background.js      # Service Worker（contextMenu・GAS POST・通知）
  lib/parser.js      # Gemini API 呼び出し＋日付正規化（main/ipc/gemini.js から移植）
  lib/gas-client.js  # GAS createEvent POST（main/ipc/gas.js から移植）
  confirm.html/.js   # 確認ポップアップ
  options.html/.js   # 設定ページ
  icons/             # icon16/48/128.png
  generate_icons.py  # アイコン再生成スクリプト（Pillow 使用）
```

---

## 権限について

| 権限 | 用途 |
|---|---|
| `contextMenus` | 右クリックメニュー「予定を追加」 |
| `storage` | APIキー・GAS URL・トークンの保存 |
| `notifications` | 登録完了・エラーのデスクトップ通知 |
| `https://generativelanguage.googleapis.com/*` | Gemini API へのリクエスト |
| `https://script.google.com/*` | GAS へのリクエスト |
| `https://script.googleusercontent.com/*` | GAS POST のリダイレクト先 |

content_script は使用しない（`selectionText` で取得するため不要）。

---

## 注意事項

- APIキー・トークンはすべて `chrome.storage.local` に保存。ファイルには書かれない
- 既存の tasks-manager Electron アプリ・GAS は一切変更していない
