// ★ キーボード・UIイベント
import * as state from './state.js';
import { renderMonthCalendar } from './calendar-ui.js';
import { triggerCalendarSync } from './sync.js';
import { addQuickTask } from './tasks.js';
import { confirmResetTasks, showSummary } from './tasks.js';
import { registerCalendarEvent, confirmCalendarRegister, cancelCalendarRegister } from './calendar-register.js';
import { handleDragOver, handleDragEnter, handleDragLeave, handleDrop } from './tasks.js';

export function initEventListeners() {
  // タイトルバー
  document.getElementById('btn-pin').addEventListener('click', togglePin);
  document.getElementById('btn-close').addEventListener('click', () => window.api.closeWindow());

  // カレンダーナビ
  document.getElementById('cal-prev').addEventListener('click', () => {
    state.currentMonth.setMonth(state.currentMonth.getMonth()-1);
    renderMonthCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    state.currentMonth.setMonth(state.currentMonth.getMonth()+1);
    renderMonthCalendar();
  });
  document.getElementById('cal-today-btn').addEventListener('click', () => {
    state.setCurrentMonth(new Date());
    state.setSelectedDate(new Date());
    renderMonthCalendar();
    triggerCalendarSync();
  });

  // ★ 瞬間メモ入力（Enter で追加 / ペースト時に日程検出→カレンダー自動振り分け）
  const quickInput = document.getElementById('quick-task-input');
  quickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addQuickTask();
    }
  });
  quickInput.addEventListener('paste', (e) => {
    // ペーストされたテキストを非同期で確認（DOM更新後）
    setTimeout(() => {
      const text = quickInput.value;
      if (looksLikeSchedule(text)) {
        const calInput = document.getElementById('cal-register-input');
        calInput.value = text;
        quickInput.value = '';
        calInput.focus();
        // ヒント表示
        showAutoRouteHint();
      }
    }, 0);
  });

  // ★ カレンダー登録入力（Cmd+Enter で登録）
  document.getElementById('cal-register-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      registerCalendarEvent();
    }
  });

  // ★ 確認パネルのボタン
  document.getElementById('btn-confirm-register').addEventListener('click', confirmCalendarRegister);
  document.getElementById('btn-confirm-cancel').addEventListener('click', cancelCalendarRegister);

  // タスク
  document.getElementById('btn-reset-tasks')?.addEventListener('click', confirmResetTasks);
  document.getElementById('btn-show-summary').addEventListener('click', showSummary);
  document.getElementById('btn-refresh-calendar').addEventListener('click', () => {
    state.markDirty();
    triggerCalendarSync();
  });

  // ★ ドロップゾーンのイベント
  document.querySelectorAll('.task-drop-zone').forEach(zone => {
    zone.addEventListener('dragover', handleDragOver);
    zone.addEventListener('dragenter', handleDragEnter);
    zone.addEventListener('dragleave', handleDragLeave);
    zone.addEventListener('drop', handleDrop);
  });
}

// ★ テキストが予定（Schedule）らしいかを判定
function looksLikeSchedule(text) {
  if (!text || text.length < 5) return false;
  const patterns = [
    /\d{4}年\d{1,2}月\d{1,2}日/,           // 2026年6月5日
    /\d{1,2}月\d{1,2}日[（(]?[月火水木金土日]/,  // 6月5日(金)
    /(?:明日|明後日|来週|今週)[^\n]{0,10}(?:\d{1,2}[:：時])/,
    /\d{1,2}[:：時]\d{0,2}(?:分|頃)?[～〜~\-]\d{1,2}[:：時]/,  // 17:00～
    /(?:午前|午後)\d{1,2}時/,
    /(?:ミーティング|MTG|会議|打ち合わせ|セミナー|説明会|研修|イベント|試合)[^\n]{0,30}\d{1,2}月\d{1,2}日/,
  ];
  return patterns.some(re => re.test(text));
}

// ★ 自動振り分けのヒントトースト
function showAutoRouteHint() {
  let hint = document.getElementById('auto-route-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'auto-route-hint';
    hint.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#2563eb;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;z-index:9999;pointer-events:none;';
    document.body.appendChild(hint);
  }
  hint.textContent = '📅 日程を検出 → カレンダー登録に自動切替（Cmd+Enter で登録）';
  hint.style.opacity = '1';
  clearTimeout(hint._timer);
  hint._timer = setTimeout(() => { hint.style.opacity = '0'; }, 3000);
}

function togglePin() {
  state.setIsPinned(!state.isPinned);
  const btn = document.getElementById('btn-pin');
  btn.classList.toggle('pinned', state.isPinned);
  window.api.pinWindow(state.isPinned);
}
