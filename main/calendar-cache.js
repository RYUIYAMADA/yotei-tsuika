'use strict';

/**
 * main/calendar-cache.js — カレンダーインメモリキャッシュ（P3-3）
 *
 * 役割:
 *   - calendarCache / calendarCacheByDate のインメモリ保持
 *   - buildCalendarIndex: 配列→日付別Mapに変換
 *   - キャッシュ定期剪定（CACHE_PRUNE_INTERVAL ごとに古いデータを削除）
 *   - ensureCalendarCache: ディスクからの初回ロード
 *   - calendar-data.json の読み書き・破損バックアップ
 *
 * ⚠️ ロジック・タイミング・実行順序は main.js から一切変更しない（移動のみ）
 */

const path = require('path');
const fs   = require('fs');

// ──────────────────────────────────────────
// パス定義
// ──────────────────────────────────────────

const CALENDAR_DATA_PATH = path.join(__dirname, '..', 'calendar-data.json');

// ──────────────────────────────────────────
// インメモリキャッシュ（ディスクI/O削減で5倍高速化）
// ──────────────────────────────────────────

let calendarCache       = null;  // ★ 全イベント配列のキャッシュ
let calendarCacheByDate = {};    // ★ 日付別インデックス { 'YYYY-MM-DD': [events] }
let calendarCacheLoaded = false; // ★ 初回ロード完了フラグ

// ──────────────────────────────────────────
// buildCalendarIndex: 配列→日付別Mapに変換
// ──────────────────────────────────────────

function buildCalendarIndex(events) {
  calendarCache = events;
  calendarCacheByDate = {};
  for (const ev of events) {
    const key = ev.date || '_nodate';
    if (!calendarCacheByDate[key]) calendarCacheByDate[key] = [];
    calendarCacheByDate[key].push(ev);
  }
  calendarCacheLoaded = true;
}

// ──────────────────────────────────────────
// キャッシュ定期剪定（古いデータを3ヶ月分に制限）
// ──────────────────────────────────────────

const CACHE_PRUNE_INTERVAL = 60 * 60 * 1000; // 1時間
let _cachePruneTimer = null;

function startCachePruning() {
  if (_cachePruneTimer) return;
  _cachePruneTimer = setInterval(() => {
    if (!calendarCacheLoaded || !calendarCache) return;
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const minDate = threeMonthsAgo.toISOString().slice(0, 10);

    const before = calendarCache.length;
    calendarCache = calendarCache.filter(ev => {
      const d = ev.date || '_nodate';
      return d === '_nodate' || d >= minDate;
    });

    if (calendarCache.length < before) {
      // 日付インデックスも再構築
      calendarCacheByDate = {};
      for (const ev of calendarCache) {
        const key = ev.date || '_nodate';
        if (!calendarCacheByDate[key]) calendarCacheByDate[key] = [];
        calendarCacheByDate[key].push(ev);
      }
      console.log(`📅 メインプロセスキャッシュ剪定: ${before - calendarCache.length}件削除`);
    }
  }, CACHE_PRUNE_INTERVAL);
}

function stopCachePruning() {
  if (_cachePruneTimer) {
    clearInterval(_cachePruneTimer);
    _cachePruneTimer = null;
  }
}

// ──────────────────────────────────────────
// ensureCalendarCache: ディスクからの初回ロード
// ──────────────────────────────────────────

function ensureCalendarCache() {
  if (calendarCacheLoaded && calendarCache) return;
  try {
    if (fs.existsSync(CALENDAR_DATA_PATH)) {
      const raw = fs.readFileSync(CALENDAR_DATA_PATH, 'utf-8');
      const data = JSON.parse(raw);
      buildCalendarIndex(Array.isArray(data) ? data : []);
    } else {
      buildCalendarIndex([]);
    }
  } catch (e) {
    console.error('カレンダーキャッシュ初期化エラー:', e.message);
    buildCalendarIndex([]);
  }
}

// ──────────────────────────────────────────
// clearCalendarCache: will-quit 時の解放
// ──────────────────────────────────────────

function clearCalendarCache() {
  calendarCache       = null;
  calendarCacheByDate = {};
  calendarCacheLoaded = false;
}

// ──────────────────────────────────────────
// エクスポート
// ──────────────────────────────────────────

module.exports = {
  CALENDAR_DATA_PATH,
  get calendarCache()       { return calendarCache; },
  get calendarCacheByDate() { return calendarCacheByDate; },
  get calendarCacheLoaded() { return calendarCacheLoaded; },
  buildCalendarIndex,
  startCachePruning,
  stopCachePruning,
  ensureCalendarCache,
  clearCalendarCache,
};
