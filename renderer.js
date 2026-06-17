// ★ エントリポイント（モジュール読み込み + DOMContentLoaded初期化）
import { setCalendars, startArchiveEviction, cleanupAllTimers } from './renderer/state.js';
import { initEventListeners } from './renderer/events.js';
import { initMouseTracking } from './renderer/mouse.js';
import * as dataStore from './renderer/data-store.js'; // ★ タスク完了履歴蓄積層
import { initSidebarShownHandler, startAutoSync, startDateChangeDetection } from './renderer/sync.js';
import { startSheetsSyncLoop } from './renderer/sheets-sync.js';
import { renderMonthCalendar, loadCalendarEvents, initStats, initGameDays } from './renderer/calendar-ui.js';
import { loadTasks } from './renderer/tasks.js';
import { warmupOllama, initOllamaConfig } from './renderer/ollama.js';
import { initFocusMode } from './renderer/focus.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ★ カレンダー設定をメインプロセスから取得
  try {
    const cal = await window.api.getCalendarConfig() || {};
    setCalendars(cal);
  } catch (e) { console.warn('カレンダー設定取得失敗:', e); }

  // ★ P2-3: Ollama設定をapp-config.jsonから読み込み（warmupOllama より前に実行）
  await initOllamaConfig().catch(e => console.warn('Ollama設定初期化失敗:', e));

  initEventListeners();
  initMouseTracking();
  initFocusMode();
  initSidebarShownHandler();

  // ★ P2-4: 試合日データをGASまたはフォールバックから取得（renderMonthCalendar の前に）
  await initGameDays().catch(e => console.warn('試合日初期化失敗:', e));

  renderMonthCalendar();

  // ★ タスクとカレンダーを並行で読み込み
  await Promise.allSettled([
    loadTasks().catch(err => console.error('タスク初期化失敗:', err)),
    loadCalendarEvents().catch(err => console.error('カレンダー初期化失敗:', err))
  ]);

  // ★ Ollamaウォームアップ
  warmupOllama();

  // ★ 自動同期開始
  try { startAutoSync(); } catch (err) { console.error('自動同期開始失敗:', err); }
  try { startSheetsSyncLoop(); } catch (err) { console.error('Sheets同期開始失敗:', err); }

  // ★ 日付変更の自動検知
  try { startDateChangeDetection(); } catch (err) { console.error('日付変更検知開始失敗:', err); }

  // ★ 統計セクション初期化
  try { initStats(); } catch (err) { console.error('統計初期化失敗:', err); }

  // ★ 完了タスクの自動メモリ除外開始（24時間後にアーカイブをGC対象に）
  startArchiveEviction();
});

// ★ ページ遷移・終了時に全タイマーをクリーンアップ（メモリリーク防止）
window.addEventListener('beforeunload', () => {
  cleanupAllTimers();
});
