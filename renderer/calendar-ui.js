// ★ カレンダーUI（月カレンダー・予定表示）
import { HAPPINETS_GAME_DAYS as _GAME_DAYS_CONST, STATS_COLORS } from './constants.js';
import { formatDate, escapeHtml, isSameDay } from './utils.js';
import * as state from './state.js';
import { triggerCalendarSync } from './sync.js';

// ★ P2-4: 試合日配列（起動時に get-game-days IPC で上書き。取得前はフォールバック）
let _gameDays = _GAME_DAYS_CONST;

/**
 * get-game-days IPC から試合日配列を取得してモジュールキャッシュを更新する。
 * renderer.js の初期化時に呼び出す。
 */
export async function initGameDays() {
  try {
    const result = await window.api.getGameDays();
    if (result && Array.isArray(result.days)) {
      _gameDays = result.days;
      console.log(`[calendar-ui] 試合日ロード完了: ${_gameDays.length}件 (source=${result.source})`);
    }
  } catch (e) {
    console.warn('[calendar-ui] get-game-days失敗（constants フォールバック）:', e.message);
  }
}

// ==============================
// ★ 月カレンダー
// ==============================
export function renderMonthCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const today = new Date();

  document.getElementById('cal-month-label').textContent =
    `${year}年 ${month + 1}月`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const rawFirstDay = new Date(year, month, 1).getDay();
  const firstDay = (rawFirstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    grid.appendChild(createDayEl(d, true, null));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = formatDate(date);
    const isToday = isSameDay(date, today);
    const isSelected = isSameDay(date, state.selectedDate);
    const isGame = _gameDays.includes(dateStr);
    const dayOfWeek = date.getDay();
    grid.appendChild(createDayEl(d, false, { isToday, isSelected, isGame, dayOfWeek, date }));
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remaining; d++) {
    grid.appendChild(createDayEl(d, true, null));
  }
}

function createDayEl(day, isOtherMonth, opts) {
  const el = document.createElement('div');
  el.classList.add('cal-day');
  el.textContent = day;

  if (isOtherMonth) {
    el.classList.add('other-month');
    return el;
  }

  if (opts.isToday) el.classList.add('today');
  if (opts.isSelected && !opts.isToday) el.classList.add('selected');
  if (opts.dayOfWeek === 0) el.classList.add('sunday');
  if (opts.dayOfWeek === 6) el.classList.add('saturday');

  if (opts.isGame) {
    const icon = document.createElement('span');
    icon.classList.add('game-icon');
    icon.textContent = '🏀';
    el.appendChild(icon);
  }

  const selectDay = () => {
    state.setSelectedDate(opts.date);
    renderMonthCalendar();
    updateScheduleLabel();
    const dateStr = formatDate(opts.date);
    const cached = state.localEventsByDate[dateStr];
    if (cached) {
      // キャッシュあり → 即表示（stale-while-revalidate）
      state.setCalendarEvents(cached);
      state.setCalendarDataLoaded(true);
      renderCalendarEvents();
    } else {
      // キャッシュなし → ローディング表示
      state.setCalendarEvents([]);
      state.setCalendarDataLoaded(false);
      renderCalendarEvents();
    }
    // ★ SWR: 常に裏で同期（sync.js 側で 1分以内のレート制限あり）
    triggerCalendarSync(dateStr);
    // ★ 隣接±2日をバックグラウンドでプリフェッチ
    const _adj = [];
    for (let i = 1; i <= 2; i++) {
      const dp = new Date(opts.date); dp.setDate(dp.getDate() + i);
      const dm = new Date(opts.date); dm.setDate(dm.getDate() - i);
      _adj.push(formatDate(dp), formatDate(dm));
    }
    window.api.prefetchCalendarRange(_adj).catch(() => {});
  };

  el.addEventListener('click', selectDay);

  return el;
}

export function updateScheduleLabel() {
  const today = new Date();
  const label = document.getElementById('schedule-date-label');
  if (isSameDay(state.selectedDate, today)) {
    label.textContent = '📅 今日の予定';
  } else {
    const m = state.selectedDate.getMonth() + 1;
    const d = state.selectedDate.getDate();
    const w = ['日','月','火','水','木','金','土'][state.selectedDate.getDay()];
    label.textContent = `📅 ${m}/${d}（${w}）の予定`;
  }
}

// ==============================
// ★ カレンダー予定表示
// ==============================
export function renderCalendarEvents() {
  const container = document.getElementById('calendar-events');
  const events = state.calendarEvents;

  if (!events || events.length === 0) {
    if (!state.calendarDataLoaded) {
      container.innerHTML = '<div class="no-events" style="opacity:0.5;">⏳ 読み込み中…</div>';
    } else {
      container.innerHTML = '<div class="no-events">予定なし</div>';
    }
    return;
  }

  const sorted = events.length <= 1 ? events : [...events].sort((a,b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return (a.startTime||'00:00').localeCompare(b.startTime||'00:00');
  });

  let html = '';
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const isHappinets = ev.calendar && (
      ev.calendar.includes('ハピネッツ') ||
      ev.calendar.includes('happinets') ||
      ev.calendar.includes('Happinets') ||
      ev.calendar.includes('myAN') ||
      ev.calendar.includes('010_')
    );
    const isRowing = ev.calendar && (
      ev.calendar.includes('rowing') ||
      ev.calendar.includes('02_rowing') ||
      ev.calendar.includes('ボート') ||
      ev.calendar.includes('ローイング')
    );
    const cls = isHappinets ? ' happinets-event' : isRowing ? ' rowing-event' : '';
    const time = ev.allDay ? '終日' : (ev.startTime || '終日');
    html += `<div class="event-card${cls}"><div class="event-time">${time}</div><div class="event-title">${escapeHtml(ev.title)}</div></div>`;
  }
  // 内容が変わっていない場合は再描画しない（フラッシュ防止）
  if (container.innerHTML !== html) {
    container.innerHTML = html;
  }
}

// ★ カレンダーデータ読み込み
export async function loadCalendarEvents() {
  const dateStr = formatDate(state.selectedDate);

  try {
    // ★ P4-1: main 側で構築済みの { events, byDate } を受け取る
    // renderer 側でのインデックス再構築は不要
    const result = await window.api.loadCalendarData();
    const allData   = (result && Array.isArray(result.events)) ? result.events : [];
    const byDateMap = (result && result.byDate && typeof result.byDate === 'object') ? result.byDate : {};
    state.setCalendarEventsAll(allData);
    state.setLocalEventsByDate(byDateMap);
  } catch (err) {
    console.error('カレンダーデータ読み込みエラー:', err);
  }

  state.setCalendarEvents(state.getEventsForDateLocal(dateStr));
  state.setCalendarDataLoaded(true);
  renderCalendarEvents();

  triggerCalendarSync().catch(() => {});

  // ★ 今後7日分をバックグラウンドでプリフェッチ（クリック時に即表示するため）
  const _today = new Date();
  const _prefetchDates = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(_today); d.setDate(_today.getDate() + i);
    _prefetchDates.push(formatDate(d));
  }
  window.api.prefetchCalendarRange(_prefetchDates).catch(() => {});
}

// ★ 外部API（Claudeからカレンダーデータ更新用）
window.updateCalendarEvents = async function(events) {
  await window.api.saveCalendarData(events);
  // ★ P4-1: 保存後に main 側の最新インデックスを再取得して同期
  try {
    const result = await window.api.loadCalendarData();
    const allData   = (result && Array.isArray(result.events)) ? result.events : events;
    const byDateMap = (result && result.byDate && typeof result.byDate === 'object') ? result.byDate : {};
    state.setCalendarEventsAll(allData);
    state.setLocalEventsByDate(byDateMap);
  } catch (_) {
    state.setCalendarEventsAll(events);
  }
  const dateStr = formatDate(state.selectedDate);
  state.setCalendarEvents(state.getEventsForDateLocal(dateStr));
  renderCalendarEvents();
};

// ==============================
// ★ 統計・セッション監視セクション
// ==============================
export function drawDonut(svgId, segments) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    svg.innerHTML = '<circle cx="40" cy="40" r="28" fill="none" stroke="#2a2a4a" stroke-width="10"/>';
    return;
  }
  const cx = 40, cy = 40, r = 28, strokeW = 10;
  let offset = -Math.PI / 2;
  for (const seg of segments) {
    if (seg.value === 0) continue;
    const frac = seg.value / total;
    const angle = frac * 2 * Math.PI;
    const x1 = cx + r * Math.cos(offset);
    const y1 = cy + r * Math.sin(offset);
    const x2 = cx + r * Math.cos(offset + angle);
    const y2 = cy + r * Math.sin(offset + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`);
    path.setAttribute('fill', seg.color);
    path.setAttribute('opacity', '0.9');
    svg.appendChild(path);
    offset += angle;
  }
  const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  hole.setAttribute('cx', cx); hole.setAttribute('cy', cy);
  hole.setAttribute('r', r - strokeW);
  hole.setAttribute('fill', '#16213e');
  svg.appendChild(hole);
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', cx); text.setAttribute('y', cy + 1);
  text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('fill', '#e8e8e8'); text.setAttribute('font-size', '11');
  text.setAttribute('font-weight', '700');
  text.textContent = total;
  svg.appendChild(text);
}

export function renderLegend(legId, segments, total) {
  const leg = document.getElementById(legId);
  if (!leg) return;
  leg.innerHTML = '';
  for (const seg of segments) {
    if (seg.value === 0) continue;
    const item = document.createElement('div');
    item.className = 'stat-legend-item';
    item.innerHTML = `<span class="stat-dot" style="background:${seg.color}"></span><span style="overflow:hidden;text-overflow:ellipsis">${seg.label}</span><span class="stat-count">${seg.value}</span>`;
    leg.appendChild(item);
  }
}

function renderTaskChart() {
  const today   = state.tasks.filter(t => !t.completed && t.priority === 'today').length;
  const soon    = state.tasks.filter(t => !t.completed && t.priority === 'soon').length;
  const anytime = state.tasks.filter(t => !t.completed && t.priority === 'anytime').length;
  const segs = [
    { value: today,   color: STATS_COLORS.today,   label: '今日中' },
    { value: soon,    color: STATS_COLORS.soon,    label: 'できたら' },
    { value: anytime, color: STATS_COLORS.anytime, label: 'いつでも' },
  ];
  drawDonut('chart-tasks', segs);
  renderLegend('legend-tasks', segs, today + soon + anytime || 1);
}

function renderSessionChart(svgId, legId, win) {
  if (!win) {
    const svg = document.getElementById(svgId);
    if (svg) svg.innerHTML = '<text x="40" y="40" text-anchor="middle" dominant-baseline="middle" fill="#6e6e8a" font-size="9">データなし</text>';
    return;
  }
  const mbp  = win.mbp_total || 0;
  const mini = win.mini_total || 0;
  const segs = [
    { value: mbp,  color: STATS_COLORS.mbp,  label: 'MBP' },
    { value: mini, color: STATS_COLORS.mini, label: 'Mini' },
  ];
  drawDonut(svgId, segs);
  renderLegend(legId, segs, mbp + mini || 1);
}

async function refreshStats() {
  try {
    renderTaskChart();
    const data = await window.api.loadDashboardData();
    if (data) {
      renderSessionChart('chart-5h',  'legend-5h',  data.windows && data.windows['5h']);
      renderSessionChart('chart-24h', 'legend-24h', data.windows && data.windows['24h']);
      const el = document.getElementById('stats-updated');
      if (el) el.textContent = data.updated ? `更新: ${data.updated}` : '';
    } else {
      renderSessionChart('chart-5h',  'legend-5h',  null);
      renderSessionChart('chart-24h', 'legend-24h', null);
    }
  } catch (e) { console.error('統計更新失敗:', e); }
}

export function initStats() {
  refreshStats();
  document.getElementById('btn-refresh-stats')?.addEventListener('click', refreshStats);
  let statsTimer = null;
  window._statsTaskUpdate = () => {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(renderTaskChart, 500);
  };
}
