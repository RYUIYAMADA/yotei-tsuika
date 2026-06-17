'use strict';

/**
 * main/ipc/calendar.js — カレンダー系 IPC ハンドラ（P3-3）
 *
 * 登録ハンドラ:
 *   load-calendar-data, save-calendar-data, sync-calendar,
 *   prefetch-calendar-range, get-calendar-config, get-game-days
 *
 * + fetchAndMergeCalendarEvents（GAS API共通ユーティリティ）
 *
 * ⚠️ ロジック・タイミング・実行順序は main.js から一切変更しない（移動のみ）
 */

const { ipcMain } = require('electron');
const fs          = require('fs');

// calendar-cache モジュールを直接参照（getter は毎回取得）
const calendarCacheModule = require('../calendar-cache');
const { CALENDAR_DATA_PATH } = calendarCacheModule;

const appConfig  = require('../config');
const { withToken } = require('./gas');

// ──────────────────────────────────────────
// バリデーションヘルパー（calendar 用）
// ──────────────────────────────────────────

function isValidDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

// ──────────────────────────────────────────
// GAS API共通: イベント取得→キャッシュ更新（重複排除）
// ──────────────────────────────────────────

async function fetchAndMergeCalendarEvents(dateStr) {
  const gasUrl = appConfig.getGasWebAppUrl();
  if (!gasUrl) return { success: true, source: 'local-cache' };

  try {
    const { net } = require('electron');
    const url = withToken(`${gasUrl}?action=events&date=${encodeURIComponent(dateStr)}`);
    const response = await net.fetch(url, { redirect: 'follow' });
    const data = await response.json();

    if (data.success && data.events) {
      calendarCacheModule.ensureCalendarCache();
      const eventsWithDate = data.events.map(ev => {
        let startTime = null;
        if (!ev.allDay && ev.start) {
          const d = new Date(ev.start);
          startTime = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }
        return { ...ev, date: dateStr, startTime };
      });
      const otherDayData = (calendarCacheModule.calendarCache || []).filter(ev => ev.date !== dateStr);
      const merged = [...otherDayData, ...eventsWithDate];
      fs.writeFileSync(CALENDAR_DATA_PATH, JSON.stringify(merged, null, 2), 'utf-8');
      calendarCacheModule.buildCalendarIndex(merged);
      console.log(`📅 ${dateStr}: ${data.events.length}件のイベントを同期（GAS API）`);
      return { success: true, source: 'gas-api', events: eventsWithDate };
    }
    return { success: true, source: 'local-cache' };
  } catch (err) {
    return { success: true, source: 'local-cache' };
  }
}

// ──────────────────────────────────────────
// ゲームデイキャッシュ
// ──────────────────────────────────────────

// NOTE: renderer/constants.js は ESM（export構文）のため CJS require 不可 → 値を直コピーしてフォールバックとする
const _GAME_DAYS_FALLBACK = [
  // 2026年3月
  '2026-03-07','2026-03-08','2026-03-11','2026-03-14','2026-03-15','2026-03-28','2026-03-29',
  // 2026年4月
  '2026-04-01','2026-04-04','2026-04-05','2026-04-08','2026-04-11','2026-04-12',
  '2026-04-15','2026-04-18','2026-04-19','2026-04-22','2026-04-25','2026-04-26',
  // 2026年5月（レギュラーシーズン最終）
  '2026-05-02','2026-05-03',
];

let _gameDaysCache = null;      // { days: string[], fetchedAt: number }
const GAME_DAYS_CACHE_TTL  = 24 * 60 * 60 * 1000; // 1日
const GAME_DAYS_TIMEOUT_MS = 10000;

// ──────────────────────────────────────────
// IPC ハンドラ登録
// ──────────────────────────────────────────

function register() {
  // ★ IPC: カレンダー設定をレンダラーに提供
  // カレンダー選定の正本は GAS 側 LINE.gs の CFG.CAL
  ipcMain.handle('get-calendar-config', () => {
    const sources = [];
    const config = {};
    const personalSource = sources.find(s => s.name === 'RYUI YAMADA');
    const workSource = sources.find(s => s.name === 'myAN_山田龍偉');
    if (personalSource) config.personal = { id: personalSource.id, name: personalSource.name, type: personalSource.type };
    if (workSource) config.work = { id: workSource.id, name: workSource.name, type: workSource.type };
    return config;
  });

  // ★ IPC: カレンダーデータ（インメモリキャッシュ優先、ディスクI/O最小化）
  // 返却形式: { events: Event[], byDate: Record<string, Event[]> }
  // ⚠️ JSONが壊れた場合は空配列を返し、壊れたファイルをバックアップ
  ipcMain.handle('load-calendar-data', () => {
    try {
      calendarCacheModule.ensureCalendarCache();
      return {
        events:  calendarCacheModule.calendarCache       || [],
        byDate:  calendarCacheModule.calendarCacheByDate || {},
      };
    } catch(e) {
      console.error('カレンダーデータ読み込みエラー:', e.message);
      // ★ キャッシュ破損時: ディスクからフォールバック
      try {
        if (fs.existsSync(CALENDAR_DATA_PATH)) {
          const raw = fs.readFileSync(CALENDAR_DATA_PATH, 'utf-8');
          const data = JSON.parse(raw);
          const arr = Array.isArray(data) ? data : [];
          calendarCacheModule.buildCalendarIndex(arr);
          return {
            events: arr,
            byDate: calendarCacheModule.calendarCacheByDate || {},
          };
        }
      } catch (e2) {
        console.error('フォールバック読み込みも失敗:', e2.message);
        try {
          const backupPath = CALENDAR_DATA_PATH + '.broken.' + Date.now();
          fs.copyFileSync(CALENDAR_DATA_PATH, backupPath);
          fs.writeFileSync(CALENDAR_DATA_PATH, '[]', 'utf-8');
        } catch (e3) {}
      }
    }
    return { events: [], byDate: {} };
  });

  ipcMain.handle('save-calendar-data', (_, events) => {
    try {
      if (!Array.isArray(events)) return false;
      const data = events.filter(ev => ev && typeof ev === 'object' && typeof ev.title === 'string');
      fs.writeFileSync(CALENDAR_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
      calendarCacheModule.buildCalendarIndex(data);
      return true;
    } catch (e) {
      console.error('カレンダーデータ保存エラー:', e.message);
      return false;
    }
  });

  // ★ IPC: Googleカレンダー同期（GAS API経由）— net.fetch統一版
  ipcMain.handle('sync-calendar', async (_, dateStr) => {
    return fetchAndMergeCalendarEvents(dateStr);
  });

  // ★ IPC: カレンダー一括プリフェッチ（並列・バックグラウンド用）
  ipcMain.handle('prefetch-calendar-range', async (_, dates) => {
    if (!Array.isArray(dates)) return false;
    const valid = dates.filter(d => isValidDate(d)).slice(0, 14);
    await Promise.allSettled(valid.map(d => fetchAndMergeCalendarEvents(d)));
    return true;
  });

  // ★ IPC: P2-4: ハピネッツ試合日取得 IPC（GAS gamedays → フォールバック定数）
  // GAS 側 LINE.gs に action=gamedays が実装されたら自動切替。
  // それまではインライン定数を返す（現状と同一挙動）。
  ipcMain.handle('get-game-days', async () => {
    // キャッシュが有効なら即返す
    if (_gameDaysCache && (Date.now() - _gameDaysCache.fetchedAt) < GAME_DAYS_CACHE_TTL) {
      return { days: _gameDaysCache.days, source: _gameDaysCache.source };
    }

    const gasUrl = appConfig.getGasWebAppUrl();
    if (gasUrl) {
      try {
        const { net } = require('electron');
        const resp = await net.fetch(withToken(`${gasUrl}?action=gamedays`), {
          redirect: 'follow',
          signal: AbortSignal.timeout(GAME_DAYS_TIMEOUT_MS),
        });
        if (resp.ok) {
          const json = await resp.json();
          if (Array.isArray(json.days)) {
            _gameDaysCache = { days: json.days, fetchedAt: Date.now(), source: 'gas' };
            return { days: json.days, source: 'gas' };
          }
        }
      } catch (e) {
        console.warn('[get-game-days] GAS取得失敗（フォールバック使用）:', e.message);
      }
    }

    // フォールバック: renderer/constants.js の定数
    const fallback = Array.isArray(_GAME_DAYS_FALLBACK) ? _GAME_DAYS_FALLBACK : [];
    _gameDaysCache = { days: fallback, fetchedAt: Date.now(), source: 'fallback' };
    return { days: fallback, source: 'fallback' };
  });
}

module.exports = { register, fetchAndMergeCalendarEvents };
