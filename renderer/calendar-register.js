// ★ カレンダー登録UI
import { CALENDAR_DISPLAY_NAMES } from './constants.js';
import * as state from './state.js';
import { triggerCalendarSync } from './sync.js';
import { parseEventSmart } from './ollama.js';
import { addQuickTask } from './tasks.js';

// ★ カレンダー登録トースト表示（4秒間）
export function showCalRegisterStatus(type, message) {
  const el = document.getElementById('cal-register-status');
  if (state.calToastTimer) clearTimeout(state.calToastTimer);
  el.className = type;
  el.textContent = message;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = '';
  state.setCalToastTimer(setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('fade-out');
    }, 300);
  }, 4000));
}

export async function registerCalendarEvent() {
  const input = document.getElementById('cal-register-input');
  const text = input.value.trim();
  if (!text) return;

  const parsed = await parseEventSmart(text);

  // ★ ルーティング: タスク判定 → タスクリストへ、予定 → カレンダーへ
  if (parsed.registration_type === 'task' || !parsed.date) {
    input.value = '';
    const taskInput = document.getElementById('quick-task-input');
    if (taskInput) {
      taskInput.value = parsed.title;
      await addQuickTask({ category: parsed.category || '' });
    }
    showCalRegisterStatus('success', `📋 タスクに追加\n${parsed.title}`);
    return;
  }

  state.setPendingCalendarEvent(parsed);

  const panel = document.getElementById('cal-confirm-panel');
  const dateParts = parsed.date.split('-');
  const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1])-1, parseInt(dateParts[2]));
  const weekday = ['日','月','火','水','木','金','土'][dateObj.getDay()];
  const dateDisplay = `${parseInt(dateParts[1])}月${parseInt(dateParts[2])}日（${weekday}）`;
  const timeDisplay = parsed.allDay ? '終日' : `${parsed.startTime}〜${parsed.endTime || ''}`;

  const descParts = [];
  if (parsed.meetUrl) descParts.push(parsed.meetUrl);
  if (parsed.description && !parsed.description.includes(parsed.meetUrl || '')) descParts.push(parsed.description);
  const descDisplay = descParts.join('\n') || '—';

  document.getElementById('confirm-title').textContent = parsed.title || '—';
  document.getElementById('confirm-date').textContent = dateDisplay;
  document.getElementById('confirm-time').textContent = timeDisplay;
  document.getElementById('confirm-location').textContent = parsed.location || '—';
  document.getElementById('confirm-description').textContent = descDisplay;
  document.getElementById('confirm-calendar').textContent = CALENDAR_DISPLAY_NAMES[parsed.calendarKey] || parsed.calendarKey;
  document.getElementById('confirm-engine').textContent = parsed._engine || '⚙️ 正規表現パーサー';

  panel.classList.remove('hidden');
  input.value = '';
}

export async function confirmCalendarRegister() {
  if (!state.pendingCalendarEvent) return;
  const parsed = state.pendingCalendarEvent;
  const panel = document.getElementById('cal-confirm-panel');
  panel.classList.add('hidden');

  const timeInfo = parsed.allDay ? '終日' : `${parsed.startTime}〜${parsed.endTime || ''}`;
  showCalRegisterStatus('pending', `⏳ 登録中… ${parsed.title}`);

  try {
    const result = await window.api.createCalendarEvent({
      title:       parsed.title,
      date:        parsed.date,
      startTime:   parsed.startTime,
      endTime:     parsed.endTime,
      allDay:      parsed.allDay,
      calendarKey: parsed.calendarKey,
      location:    parsed.location    || '',
      description: parsed.description || '',
      meetUrl:     parsed.meetUrl     || ''
    });

    if (result && result.success) {
      showCalRegisterStatus('success',
        `✅ ${parsed.title}\n📅 ${parsed.date}  🕐 ${timeInfo}`
      );
      state.markDirty();
      triggerCalendarSync();
    } else {
      const errMsg = (result && result.error) || '不明なエラー';
      showCalRegisterStatus('error', `❌ 登録失敗\n${errMsg}`);
    }
  } catch (err) {
    console.error('カレンダー登録エラー:', err);
    showCalRegisterStatus('error',
      `❌ 登録失敗\n${err.message || '不明なエラーが発生しました'}`
    );
  }
  state.setPendingCalendarEvent(null);
  document.getElementById('cal-register-input').focus();
}

export function cancelCalendarRegister() {
  const panel = document.getElementById('cal-confirm-panel');
  panel.classList.add('hidden');
  state.setPendingCalendarEvent(null);
  document.getElementById('cal-register-input').focus();
}
