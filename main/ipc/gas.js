'use strict';

/**
 * main/ipc/gas.js — GAS（Google Apps Script）連携 IPC ハンドラ（P3-4）
 *
 * 登録ハンドラ:
 *   save-gas-config, load-gas-config,
 *   sync-tasks-from-sheet, update-sheet-task,
 *   create-calendar-event
 *
 * ⚠️ ロジック・タイミング・実行順序は main.js から一切変更しない（移動のみ）
 */

const { ipcMain } = require('electron');
const fs          = require('fs');

const appConfig = require('../config');

// ──────────────────────────────────────────
// P6-2: API トークン付与ヘルパー
// ──────────────────────────────────────────

/**
 * GAS URL にオプショナルトークンを付与する。
 * GAS_API_TOKEN が未設定の場合は url をそのまま返す（現挙動と同一）。
 * @param {string} url
 * @returns {string}
 */
function withToken(url) {
  const token = appConfig.getGasApiToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'token=' + encodeURIComponent(token);
}

// ──────────────────────────────────────────
// バリデーションヘルパー
// ──────────────────────────────────────────

function isAllowedGasUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'script.google.com' || parsed.hostname === 'script.googleusercontent.com');
  } catch { return false; }
}

const ALLOWED_SHEET_FIELDS = ['priority', 'completed', 'order', 'title'];

// ──────────────────────────────────────────
// IPC ハンドラ登録
// ──────────────────────────────────────────

function register() {
  const { GAS_CONFIG_PATH } = appConfig;

  // ★ GAS WebアプリURL設定の保存（URL検証付き）
  ipcMain.handle('save-gas-config', (_, config) => {
    if (!config || typeof config !== 'object') {
      return { success: false, error: '不正な設定値です' };
    }
    if (config.webAppUrl && !isAllowedGasUrl(config.webAppUrl)) {
      return { success: false, error: 'URLはscript.google.comドメインのみ許可されます' };
    }
    fs.writeFileSync(GAS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    // ★ P2-2: キャッシュを即時更新 → 再起動なしで新URLが次のリクエストから反映される
    appConfig.invalidateGasUrl(config.webAppUrl || null);
    return { success: true };
  });

  // ★ GAS設定の読み込み
  ipcMain.handle('load-gas-config', () => {
    try {
      if (fs.existsSync(GAS_CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(GAS_CONFIG_PATH, 'utf-8'));
      }
    } catch (e) {}
    return { webAppUrl: null };
  });

  // ★ IPC: Google Sheets同期（GAS WebアプリAPI経由）
  // ⚠️ GAS_WEB_APP_URL を設定すると自動同期が有効になる
  ipcMain.handle('sync-tasks-from-sheet', async () => {
    try {
      const gasUrl = appConfig.getGasWebAppUrl();
      if (!gasUrl) {
        return { success: false, error: 'GAS WebアプリURLが未設定です' };
      }

      const { net } = require('electron');
      const url = withToken(gasUrl + '?action=list');
      const response = await net.fetch(url, { redirect: 'follow' });
      const data = await response.json();
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ★ Sheetsのタスクを更新（完了/優先度変更など）— フィールドホワイトリスト付き
  ipcMain.handle('update-sheet-task', async (_, { id, field, value }) => {
    try {
      if (typeof id !== 'string' || id.length > 128) return { success: false, error: '不正なID' };
      if (!ALLOWED_SHEET_FIELDS.includes(field)) return { success: false, error: '許可されていないフィールド: ' + field };

      const gasUrl = appConfig.getGasWebAppUrl();
      if (!gasUrl) {
        return { success: false, error: 'GAS WebアプリURLが未設定です' };
      }

      const { net } = require('electron');
      const url = withToken(`${gasUrl}?action=update&id=${encodeURIComponent(id)}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`);
      const response = await net.fetch(url, { redirect: 'follow' });
      const data = await response.json();
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ★ IPC: GAS経由でGoogleカレンダーに直接予定登録
  ipcMain.handle('create-calendar-event', async (_, eventData) => {
    try {
      const gasUrl = appConfig.getGasWebAppUrl();
      if (!gasUrl) {
        return { success: false, error: 'GAS WebアプリURLが未設定です' };
      }

      const { net } = require('electron');

      // meetUrl を description 先頭に配置して1フィールドにまとめる
      // - meetUrl がある場合: "meetUrl\n本文"（URL は絶対に切らない）
      // - 既に description 内に meetUrl が含まれる場合は先頭付与しない（重複防止）
      // - 上限超過時は本文側を後ろから切り詰める
      // POST body なので URL 長制限不要だが念のため 10000 文字で切り詰め
      const MAX_DESC = 10000;
      const descBody = eventData.description || '';
      const meetUrl  = eventData.meetUrl || '';
      const urlPrefix = (meetUrl && !descBody.includes(meetUrl))
        ? meetUrl + '\n'
        : '';
      const bodyLimit = Math.max(0, MAX_DESC - urlPrefix.length);
      const descRaw = urlPrefix + descBody.slice(0, bodyLimit);

      // セキュリティ: title/date/location/description/Zoom URL 等を POST body に移動
      // GAS doPost は body.token で認証するため token も payload に含める
      const postToken = appConfig.getGasApiToken();
      const payload = {
        action:      'createEvent',
        title:       eventData.title      || '',
        date:        eventData.date       || '',
        startTime:   eventData.startTime  || '',
        endTime:     eventData.endTime    || '',
        allDay:      String(eventData.allDay || false),
        calendarKey: eventData.calendarKey || 'personal',
        location:    eventData.location   || '',
        description: descRaw
      };
      // トークン未設定なら key 自体を省略（GAS 側: apiToken2 が空なら認証スキップ）
      if (postToken) payload.token = postToken;

      // POST 経路は body.token で認証するため URL クエリへのトークン付与は行わない
      const url = gasUrl;
      const response = await net.fetch(url, {
        method:   'POST',
        headers:  { 'Content-Type': 'application/json' },
        body:     JSON.stringify(payload),
        redirect: 'follow'
      });
      const data = await response.json();
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register, isAllowedGasUrl, withToken };
