/**
 * background.js — Service Worker
 *
 * 役割:
 *   1. contextMenus に「予定を追加」を登録
 *   2. クリック時: 設定確認 → 即座に confirm ポップアップ表示（解析より先）
 *      → confirm から parse-text メッセージを受けて Gemini 解析 → 結果を返す
 *   3. confirm からの登録メッセージを受け取り GAS POST → 通知
 *
 * 設計: ポップアップ表示を解析の成否から切り離す。
 *   解析失敗時もポップアップは必ず表示され、手動編集 → 登録できる。
 *   storage.session は SW 停止で消えるため storage.local（取得後削除）を使う。
 */

import { parseWithGemini } from './lib/parser.js';
import { createCalendarEvent } from './lib/gas-client.js';

// ──────────────────────────────────────────
// ローカル設定ファイルから chrome.storage を自動シード
// config.defaults.local.json が存在しない場合は何もしない（別環境でも壊れない）
// ──────────────────────────────────────────

async function seedDefaultsIfEmpty() {
  const cur = await chrome.storage.local.get(['geminiApiKey', 'gasWebAppUrl', 'gasToken']);
  if (cur.geminiApiKey && cur.gasWebAppUrl && cur.gasToken) return; // 既に全設定済み
  try {
    const res = await fetch(chrome.runtime.getURL('config.defaults.local.json'));
    if (!res.ok) return;
    const d = await res.json();
    const patch = {};
    if (!cur.geminiApiKey && d.geminiApiKey) patch.geminiApiKey = d.geminiApiKey;
    if (!cur.gasWebAppUrl && d.gasWebAppUrl) patch.gasWebAppUrl = d.gasWebAppUrl;
    if (!cur.gasToken     && d.gasToken)     patch.gasToken     = d.gasToken;
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  } catch (e) {
    console.debug('[tasks-manager] config.defaults.local.json 未読込（optionsで手動設定可）:', e && e.message);
  }
}

// SW 起動時にシード（キャッシュ復帰時も含む）
seedDefaultsIfEmpty();

// ──────────────────────────────────────────
// contextMenu 登録（インストール/更新時）
// ──────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({
    id:        'add-event',
    title:     '予定を追加',
    contexts:  ['selection']
  });

  // インストール/更新時にシード（初回インストール直後を確実にカバー）
  await seedDefaultsIfEmpty();

  // 初回インストール時のみ: 設定が揃っていない場合はオンボーディングを開く
  if (details.reason === 'install') {
    const cur = await chrome.storage.local.get(['geminiApiKey', 'gasWebAppUrl', 'gasToken']);
    const isConfigured = cur.geminiApiKey && cur.gasWebAppUrl && cur.gasToken;
    if (!isConfigured) {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    }
  }
});

// ──────────────────────────────────────────
// ツールバーアイコン → options を開く
// ──────────────────────────────────────────

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// ──────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────

function localYMD(d = new Date()) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ──────────────────────────────────────────
// 共通: 選択テキストを受け取り confirm ポップアップを開く
// contextMenu 経路・content script 経路の両方から呼ばれる
// ──────────────────────────────────────────

async function openConfirmWithText(selectedText) {
  const text = selectedText.trim();
  if (!text) return;

  console.debug('[tasks-manager] openConfirmWithText, length:', text.length);

  // ── 設定を読み込む ──
  const settings = await chrome.storage.local.get(['geminiApiKey', 'gasWebAppUrl', 'gasToken']);
  const { geminiApiKey, gasWebAppUrl, gasToken } = settings;

  if (!geminiApiKey || !gasWebAppUrl || !gasToken) {
    console.debug('[tasks-manager] 設定未入力 → options 画面へ');
    chrome.runtime.openOptionsPage();
    chrome.notifications.create({
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   'tasks-manager 予定追加',
      message: '3項目すべて設定してください（APIキー・GAS URL・GASトークン）'
    });
    return;
  }

  // ── 選択テキストを storage.local に保存（SW 停止でも消えない）──
  await chrome.storage.local.set({ pendingText: text });
  console.debug('[tasks-manager] pendingText を storage.local に保存, confirm.html を開く');

  // ── 即座に確認ポップアップを開く（解析を待たない）──
  chrome.windows.create({
    url:     chrome.runtime.getURL('confirm.html'),
    type:    'popup',
    width:   420,
    height:  560,
    focused: true
  }, (win) => {
    if (chrome.runtime.lastError) {
      console.error('[tasks-manager] windows.create 失敗:', chrome.runtime.lastError.message);
    } else {
      console.debug('[tasks-manager] confirm.html ウィンドウ作成成功, windowId:', win.id);
    }
  });
}

// ──────────────────────────────────────────
// contextMenu クリック
// ──────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'add-event') return;
  await openConfirmWithText(info.selectionText || '');
});

// ──────────────────────────────────────────
// confirm.js からのメッセージ受信
// ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 自拡張以外からのメッセージを無視（sender.id が自拡張 ID と一致しない場合は処理しない）
  if (sender.id !== chrome.runtime.id) return;
  // ── content script からの「予定を追加」ボタンクリック ──
  if (msg.type === 'add-event-from-selection') {
    const text = (msg.text || '').trim().substring(0, 2000); // sanitize: 長さ上限
    if (text) {
      openConfirmWithText(text).catch(err => {
        console.error('[tasks-manager] add-event-from-selection 例外:', err.message);
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  // ── Gemini 解析リクエスト（confirm 側から）──
  if (msg.type === 'parse-text') {
    console.debug('[tasks-manager] parse-text 受信, text length:', (msg.text || '').length);
    handleParseText(msg.text).then(sendResponse).catch(err => {
      console.error('[tasks-manager] parse-text 例外:', err.message);
      sendResponse({ success: false, error: err.message });
    });
    return true; // 非同期レスポンスのためチャネル保持
  }

  // ── GAS 登録リクエスト（confirm 側から）──
  if (msg.type === 'register-event') {
    console.debug('[tasks-manager] register-event 受信');
    handleRegisterEvent(msg.eventData).then(sendResponse).catch(err => {
      console.error('[tasks-manager] register-event 例外:', err.message);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

async function handleParseText(text) {
  const settings = await chrome.storage.local.get(['geminiApiKey', 'pendingText']);
  const apiKey = settings.geminiApiKey;

  // pendingText を取得後に削除（一度だけ使う）
  await chrome.storage.local.remove('pendingText');

  const targetText = text || settings.pendingText || '';
  if (!targetText.trim()) {
    return { success: false, error: '解析対象テキストがありません' };
  }

  if (!apiKey) {
    return { success: false, error: 'Gemini API キーが設定されていません' };
  }

  const today = localYMD();
  console.debug('[tasks-manager] Gemini 解析開始, today:', today);

  try {
    const result = await parseWithGemini(targetText, apiKey, today);
    console.debug('[tasks-manager] Gemini 解析成功:', result.parsed?.title);
    return { success: true, parsed: result.parsed, originalText: targetText };
  } catch (e) {
    console.error('[tasks-manager] Gemini 解析失敗:', e.message);
    return { success: false, error: e.message, originalText: targetText };
  }
}

async function handleRegisterEvent(eventData) {
  const settings = await chrome.storage.local.get(['gasWebAppUrl', 'gasToken']);
  const { gasWebAppUrl, gasToken } = settings;

  if (!gasWebAppUrl || !gasToken) {
    return { success: false, error: 'GAS設定が不完全です。再設定してください' };
  }

  try {
    const result = await createCalendarEvent(eventData, gasWebAppUrl, gasToken);

    if (result.success === true) {
      // GAS が明示的に success:true を返した場合のみ成功
      chrome.notifications.create({
        type:    'basic',
        iconUrl: 'icons/icon48.png',
        title:   'tasks-manager',
        message: `予定「${eventData.title}」を登録しました`
      });
      return { success: true };
    } else {
      const errMsg = result.error || 'GAS登録に失敗しました';
      chrome.notifications.create({
        type:    'basic',
        iconUrl: 'icons/icon48.png',
        title:   'tasks-manager: 登録エラー',
        message: errMsg.substring(0, 200)
      });
      return { success: false, error: errMsg };
    }
  } catch (e) {
    chrome.notifications.create({
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   'tasks-manager: 通信エラー',
      message: e.message.substring(0, 200)
    });
    return { success: false, error: e.message };
  }
}
