// ★ アプリ状態管理変数
import { formatDate } from './utils.js';

// ★ カレンダー設定（メインプロセスから取得）
export let CALENDARS = {};
export function setCalendars(val) { CALENDARS = val; }

export let tasks = [];
export function setTasks(val) { tasks = val; }
// ★ P4-2: 配列直接操作を禁止し setter 経由に統一
export function addTask(task) { tasks = [...tasks, task]; }

export let archivedTasks = [];
export function setArchivedTasks(val) { archivedTasks = val; }
// ★ P4-2: 配列直接操作を禁止し setter 経由に統一
export function addArchivedTask(task) { archivedTasks = [...archivedTasks, task]; }

// ★ 完了タスクの自動アーカイブ（24時間後にメモリから除外、必要時にlazy load）
const ARCHIVE_EVICT_MS = 24 * 60 * 60 * 1000;
let archiveEvictTimer = null;

export function startArchiveEviction() {
  if (archiveEvictTimer) return;
  archiveEvictTimer = setInterval(() => {
    const cutoff = Date.now() - ARCHIVE_EVICT_MS;
    const before = archivedTasks.length;
    archivedTasks = archivedTasks.filter(t => {
      const ts = t.completedAt || t.createdAt || 0;
      return ts > cutoff;
    });
    if (archivedTasks.length < before) {
      console.log(`🗑️ アーカイブ自動削除: ${before - archivedTasks.length}件をメモリから除外`);
    }
  }, 10 * 60 * 1000); // 10分ごとにチェック
}

// ★ アーカイブをlazy load（まとめ表示等で全件が必要な場合にディスクから再取得）
export async function loadArchivedTasksFull() {
  try {
    const data = await window.api.getTasks();
    if (!Array.isArray(data)) return [];
    return data.filter(t => t.archived);
  } catch (err) {
    console.error('アーカイブ再取得エラー:', err);
    return archivedTasks;
  }
}

export let calendarEvents = [];
export function setCalendarEvents(val) { calendarEvents = val; }

export let calendarEventsAll = [];
export function setCalendarEventsAll(val) { calendarEventsAll = val; }

export let localEventsByDate = {};
export function setLocalEventsByDate(val) { localEventsByDate = val; }

export let isPinned = false;
export function setIsPinned(val) { isPinned = val; }

export let currentMonth = new Date();
export function setCurrentMonth(val) {
  currentMonth = val;
  // ★ P4-1: renderer 側の剪定は削除。インデックス構築・剪定は main/calendar-cache.js が正本
  // main は CACHE_PRUNE_INTERVAL（1時間）で古いデータを削除する
}

export let selectedDate = new Date();
export function setSelectedDate(val) { selectedDate = val; }

export let draggedTaskId = null;
export function setDraggedTaskId(val) { draggedTaskId = val; }

export let archiveTimers = {};
export function setArchiveTimers(val) { archiveTimers = val; }

export let animTimers = {};
export function setAnimTimers(val) { animTimers = val; }

export let syncTimer = null;
export function setSyncTimer(val) { syncTimer = val; }

export let sheetsSyncTimer = null;
export function setSheetsSyncTimer(val) { sheetsSyncTimer = val; }

export let lastKnownDate = formatDate(new Date());
export function setLastKnownDate(val) { lastKnownDate = val; }

export let dateCheckTimer = null;
export function setDateCheckTimer(val) { dateCheckTimer = val; }

export let isSyncing = false;
export function setIsSyncing(val) { isSyncing = val; }

export let pendingCalendarEvent = null;
export function setPendingCalendarEvent(val) { pendingCalendarEvent = val; }

export let calendarDataLoaded = false;
export function setCalendarDataLoaded(val) { calendarDataLoaded = val; }

export let calToastTimer = null;
export function setCalToastTimer(val) { calToastTimer = val; }

// ★ 同期dirty flag（変更があった場合のみ同期実行）
export let syncDirty = true;
export function setSyncDirty(val) { syncDirty = val; }
export function markDirty() { syncDirty = true; }

// ★ Exponential backoff状態
export let syncBackoffCount = 0;
export function setSyncBackoffCount(val) { syncBackoffCount = val; }
export function resetSyncBackoff() { syncBackoffCount = 0; }
export function incrementSyncBackoff() { syncBackoffCount++; }

// ★ DOM参照をWeakRefで管理（GC対象にできるようにする）
const _domRefs = new Map(); // key -> WeakRef<Element>

export function setDomRef(key, el) {
  _domRefs.set(key, new WeakRef(el));
}

export function getDomRef(key) {
  const ref = _domRefs.get(key);
  if (!ref) return null;
  const el = ref.deref();
  if (!el) { _domRefs.delete(key); return null; }
  return el;
}

// ★ ローカルキャッシュから日付のイベントを即取得
// P4-1: インデックス構築は main/calendar-cache.js が正本。renderer は受け取った byDate を参照するだけ
export function getEventsForDateLocal(dateStr) {
  return localEventsByDate[dateStr] || [];
}

// ★ 全タイマー・参照のクリーンアップ（アプリ終了・ページ遷移時用）
export function cleanupAllTimers() {
  Object.keys(archiveTimers).forEach(id => clearTimeout(archiveTimers[id]));
  archiveTimers = {};

  Object.keys(animTimers).forEach(id => clearTimeout(animTimers[id]));
  animTimers = {};

  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  if (sheetsSyncTimer) { clearInterval(sheetsSyncTimer); sheetsSyncTimer = null; }
  if (dateCheckTimer) { clearInterval(dateCheckTimer); dateCheckTimer = null; }
  if (calToastTimer) { clearTimeout(calToastTimer); calToastTimer = null; }
  if (archiveEvictTimer) { clearInterval(archiveEvictTimer); archiveEvictTimer = null; }

  _domRefs.clear();
  console.log('🧹 全タイマー・参照をクリーンアップ');
}
