// ★ 自動同期・カレンダー連携
import { SYNC_INTERVAL_MS, DATE_CHECK_INTERVAL_MS, SYNC_BACKOFF_BASE_MS, SYNC_BACKOFF_MAX_MS } from './constants.js';
import { formatDate } from './utils.js';
import * as state from './state.js';
import { renderCalendarEvents } from './calendar-ui.js';
import { renderMonthCalendar, updateScheduleLabel } from './calendar-ui.js';

// ★ 日付別の最終同期時刻（stale-while-revalidate のレート制限用）
const lastSyncByDate = {};
const MIN_RESYNC_MS = 60 * 1000; // 1分以内の再 fetch は抑制

// ★ カレンダー自動同期（30秒間隔、dirty flagで変更なしはスキップ）
export function startAutoSync() {
  triggerCalendarSync();
  state.setSyncTimer(setInterval(() => {
    if (!state.syncDirty) {
      console.log('⏭️ 同期スキップ（変更なし）');
      return;
    }
    triggerCalendarSync();
  }, SYNC_INTERVAL_MS));
}

export async function triggerCalendarSync(forceDateStr = null, opts = {}) {
  if (state.isSyncing) return;
  const dateStr = forceDateStr || formatDate(state.selectedDate);

  // ★ SWR レート制限: 1分以内の同一日付 fetch をスキップ（force:true で無視可能）
  if (!opts.force && lastSyncByDate[dateStr] && Date.now() - lastSyncByDate[dateStr] < MIN_RESYNC_MS) {
    console.log(`⏭️ 同期スキップ（${dateStr} は ${Math.round((Date.now() - lastSyncByDate[dateStr])/1000)}秒前に同期済）`);
    return;
  }

  state.setIsSyncing(true);
  lastSyncByDate[dateStr] = Date.now();

  // backoff中は待機時間を計算してスキップ
  if (state.syncBackoffCount > 0) {
    const backoffMs = Math.min(
      SYNC_BACKOFF_BASE_MS * Math.pow(2, state.syncBackoffCount - 1),
      SYNC_BACKOFF_MAX_MS
    );
    console.log(`⏳ backoff中: ${Math.round(backoffMs / 1000)}秒後にリトライ`);
  }

  try {
    const result = await window.api.syncCalendar(dateStr);
    if (result && result.success) {
      if (result.source === 'gas-api' && result.events) {
        const syncedDate = result.events.length > 0 ? result.events[0].date : dateStr;
        state.localEventsByDate[syncedDate] = result.events;
        state.setCalendarEvents(state.getEventsForDateLocal(dateStr));
      }
      state.setCalendarDataLoaded(true);
      renderCalendarEvents();
      showSyncIndicator('success');
      // 成功時: backoffリセット、dirtyクリア
      state.resetSyncBackoff();
      state.setSyncDirty(false);
    }
  } catch (err) {
    console.log('カレンダー同期スキップ:', err.message || err);
    // エラー時: backoffカウント増加
    state.incrementSyncBackoff();
    showSyncIndicator('error');
  } finally {
    state.setIsSyncing(false);
  }
}

// ★ 同期インジケータ
export function showSyncIndicator(type) {
  const btn = document.getElementById('btn-refresh-calendar');
  if (!btn) return;
  btn.classList.add('syncing');
  if (type === 'error') {
    btn.classList.add('sync-error');
  }
  setTimeout(() => {
    btn.classList.remove('syncing');
    btn.classList.remove('sync-error');
  }, 1500);
}

// ★ 日付変更の自動検知
export function startDateChangeDetection() {
  state.setDateCheckTimer(setInterval(() => {
    checkDateChange();
  }, DATE_CHECK_INTERVAL_MS));
}

export async function checkDateChange() {
  const todayStr = formatDate(new Date());
  if (todayStr !== state.lastKnownDate) {
    console.log(`📅 日付変更検知: ${state.lastKnownDate} → ${todayStr}`);
    state.setLastKnownDate(todayStr);
    state.setSelectedDate(new Date());
    state.setCurrentMonth(new Date());
    renderMonthCalendar();
    updateScheduleLabel();
    state.setCalendarEvents(state.getEventsForDateLocal(todayStr));
    state.setCalendarDataLoaded(true);
    renderCalendarEvents();
    state.markDirty();
    triggerCalendarSync();
  }
}

// ★ サイドバー表示時のハンドラー（瞬間メモ機能）
export function initSidebarShownHandler() {
  window.api.onSidebarShown(() => {
    checkDateChange();
    state.markDirty();
    const input = document.getElementById('quick-task-input');
    if (input) {
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    }
  });

  window.api.onCalendarUpdated((dateStr) => {
    const currentDateStr = formatDate(state.selectedDate);
    if (dateStr === currentDateStr) {
      state.setCalendarEvents(state.getEventsForDateLocal(dateStr));
      state.setCalendarDataLoaded(true);
      renderCalendarEvents();
      console.log(`📅 起動同期データ反映: ${dateStr}`);
    }
  });
}
