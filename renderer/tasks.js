// ★ タスクCRUD・レンダリング
import { ARCHIVE_DELAY_MS } from './constants.js';
import { escapeHtml } from './utils.js';
import { formatDate } from './utils.js';
import * as state from './state.js';
import { recordCompletion, removeCompletion } from './data-store.js';

// ==============================
// ★ 瞬間メモ（タスク追加）
// ==============================
export async function addQuickTask(meta = {}) {
  const input = document.getElementById('quick-task-input');
  const title = input.value.trim();
  if (!title) return;

  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    priority: 'today',
    completed: false,
    order: 0,
    createdAt: Date.now()
  };
  if (meta.category) task.category = meta.category;

  state.addTask(task);

  await window.api.saveTasks(state.tasks);
  input.value = '';
  renderTasks();
  input.focus();
}

// ==============================
// ★ タスク管理（D&D対応 + 自動アーカイブ）
// ==============================

export async function loadTasks() {
  let data = [];
  try {
    data = await window.api.getTasks();
    if (!Array.isArray(data)) data = [];
  } catch (err) {
    console.error('タスクデータ読み込みエラー:', err);
    data = [];
  }

  state.setTasks(data.filter(t => !t.archived));
  state.setArchivedTasks(data.filter(t => t.archived));

  state.tasks.forEach(t => {
    if (t.completed) {
      const elapsed = t.completedAt ? Date.now() - t.completedAt : ARCHIVE_DELAY_MS;
      if (elapsed >= ARCHIVE_DELAY_MS) {
        t.archived = true;
        state.addArchivedTask(t);
      } else {
        scheduleArchive(t.id, ARCHIVE_DELAY_MS - elapsed);
      }
    }
  });

  state.setTasks(state.tasks.filter(t => !t.archived));
  try {
    await window.api.saveTasks([...state.tasks, ...state.archivedTasks]);
  } catch (err) {
    console.error('タスク保存エラー:', err);
  }
  renderTasks();
}

// ★ アーカイブタイマーをスケジュール
export function scheduleArchive(taskId, delay) {
  if (state.archiveTimers[taskId]) clearTimeout(state.archiveTimers[taskId]);
  if (state.animTimers[taskId]) clearTimeout(state.animTimers[taskId]);

  const animStart = Math.max(0, delay - 450);
  state.animTimers[taskId] = setTimeout(() => {
    const el = document.querySelector(`.task-item[data-id="${taskId}"]`);
    if (el) el.classList.add('archiving');
  }, animStart);

  state.archiveTimers[taskId] = setTimeout(async () => {
    const task = state.tasks.find(t => t.id === taskId);
    if (task && task.completed) {
      task.archived = true;
      state.addArchivedTask(task);
      state.setTasks(state.tasks.filter(t => t.id !== taskId));
      try {
        await window.api.saveTasks([...state.tasks, ...state.archivedTasks]);
      } catch (err) {
        console.error('アーカイブ保存エラー:', err);
      }
      renderTasks();

      if (task.source === 'line') {
        window.api.updateSheetTask({
          id: taskId,
          field: 'archived',
          value: 'true'
        }).catch(() => {});
      }
    }
    delete state.archiveTimers[taskId];
  }, delay);
}

// ★ アーカイブタイマーをキャンセル
export function cancelArchive(taskId) {
  if (state.archiveTimers[taskId]) {
    clearTimeout(state.archiveTimers[taskId]);
    delete state.archiveTimers[taskId];
  }
  if (state.animTimers[taskId]) {
    clearTimeout(state.animTimers[taskId]);
    delete state.animTimers[taskId];
    const el = document.querySelector(`.task-item[data-id="${taskId}"]`);
    if (el) el.classList.remove('archiving');
  }
}

export function renderTasks() {
  document.querySelectorAll('.task-drop-zone').forEach(z => z.innerHTML = '');
  if (window._statsTaskUpdate) window._statsTaskUpdate();

  if (state.tasks.length === 0) {
    document.querySelector('.task-drop-zone[data-priority="today"]').innerHTML =
      '<div class="no-events" style="padding:6px;font-size:11px;">タスクを入力してください</div>';
  }

  const groups = { today: [], soon: [], anytime: [], dev: [] };
  state.tasks.forEach(t => {
    if (t.completed || t.archived) return;
    const pri = t.priority || 'today';
    if (!groups[pri]) groups[pri] = [];
    groups[pri].push(t);
  });

  Object.keys(groups).forEach(pri => {
    groups[pri].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.createdAt - b.createdAt);
    const zone = document.querySelector(`.task-drop-zone[data-priority="${pri}"]`);
    groups[pri].forEach(task => {
      zone.appendChild(createTaskEl(task));
    });
  });

  const btn = document.getElementById('btn-show-summary');
  const hasContent = state.tasks.length > 0 || state.archivedTasks.length > 0;
  btn.classList.toggle('hidden', !hasContent);
  const incomplete = state.tasks.filter(t => !t.completed).length;
  const archived = state.archivedTasks.length;
  btn.textContent = `📊 本日のまとめ（未完了: ${incomplete} / 完了: ${archived}件）`;
}

function createTaskEl(task) {
  const el = document.createElement('div');
  el.classList.add('task-item');
  if (task.completed) el.classList.add('completed');
  el.dataset.id = task.id;
  el.draggable = false; // ハンドルからのみD&D開始

  el.innerHTML = `
    <div class="drag-handle" aria-label="ドラッグして並び替え" role="button" tabindex="0">⠿</div>
    <div class="task-checkbox ${task.completed ? 'checked' : ''}"></div>
    ${task.category ? `<span class="task-category" title="${escapeHtml(task.category)}">${escapeHtml(task.category)}</span>` : ''}
    <div class="task-name">${escapeHtml(task.title)}</div>
    <button class="task-delete" title="削除">✕</button>
  `;

  el.querySelector('.task-checkbox').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTask(task.id);
  });

  el.querySelector('.task-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTask(task.id);
  });

  // ハンドルからのみD&D開始
  const handle = el.querySelector('.drag-handle');
  handle.addEventListener('mousedown', () => { el.draggable = true; });
  el.addEventListener('mouseup', () => { el.draggable = false; });
  el.addEventListener('mouseleave', () => { if (!el.classList.contains('dragging')) el.draggable = false; });

  el.addEventListener('dragstart', (e) => {
    state.setDraggedTaskId(task.id);
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);

    // カスタムゴースト要素
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    ghost.style.width = el.offsetWidth + 'px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, e.offsetX, e.offsetY);
    requestAnimationFrame(() => ghost.remove());
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    el.draggable = false;
    state.setDraggedTaskId(null);
    document.querySelectorAll('.task-drop-zone').forEach(z => z.classList.remove('drag-over'));
    removeDropIndicator();
  });

  // タッチデバイス対応（長押しでD&D開始）
  let touchTimer = null;
  let touchStartY = 0;
  let touchDragging = false;

  handle.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    touchTimer = setTimeout(() => {
      touchDragging = true;
      el.classList.add('dragging');
      state.setDraggedTaskId(task.id);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 400);
  }, { passive: true });

  handle.addEventListener('touchmove', (e) => {
    if (!touchDragging) {
      if (Math.abs(e.touches[0].clientY - touchStartY) > 10) {
        clearTimeout(touchTimer);
      }
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    const zones = document.querySelectorAll('.task-drop-zone');
    zones.forEach(zone => {
      const rect = zone.getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
          touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        zone.classList.add('drag-over');
        const afterEl = getDragAfterElement(zone, touch.clientY);
        showDropIndicator(zone, afterEl);
        const draggingEl = document.querySelector('.task-item.dragging');
        if (draggingEl) {
          if (afterEl == null) zone.appendChild(draggingEl);
          else zone.insertBefore(draggingEl, afterEl);
        }
      } else {
        zone.classList.remove('drag-over');
      }
    });
  }, { passive: false });

  handle.addEventListener('touchend', async () => {
    clearTimeout(touchTimer);
    if (touchDragging) {
      touchDragging = false;
      el.classList.remove('dragging');
      removeDropIndicator();
      // ドロップ処理
      const zone = el.closest('.task-drop-zone');
      if (zone && state.draggedTaskId) {
        const newPriority = zone.dataset.priority;
        const t = state.tasks.find(t => t.id === state.draggedTaskId);
        if (t) t.priority = newPriority;
        const items = zone.querySelectorAll('.task-item');
        items.forEach((item, idx) => {
          const tt = state.tasks.find(t => t.id === item.dataset.id);
          if (tt) { tt.priority = newPriority; tt.order = idx; }
        });
        await window.api.saveTasks([...state.tasks, ...state.archivedTasks]);
      }
      state.setDraggedTaskId(null);
      document.querySelectorAll('.task-drop-zone').forEach(z => z.classList.remove('drag-over'));
    }
  });

  handle.addEventListener('touchcancel', () => {
    clearTimeout(touchTimer);
    touchDragging = false;
    el.classList.remove('dragging');
    state.setDraggedTaskId(null);
    removeDropIndicator();
  });

  return el;
}

// ドロップインジケーター管理
function showDropIndicator(zone, beforeEl) {
  removeDropIndicator();
  const indicator = document.createElement('div');
  indicator.classList.add('drop-indicator');
  if (beforeEl) {
    zone.insertBefore(indicator, beforeEl);
  } else {
    zone.appendChild(indicator);
  }
}

function removeDropIndicator() {
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
}

// ★ D&D ハンドラー
export function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const zone = e.currentTarget;
  const afterEl = getDragAfterElement(zone, e.clientY);
  const draggingEl = document.querySelector('.task-item.dragging');
  if (!draggingEl) return;
  showDropIndicator(zone, afterEl);
  if (afterEl == null) {
    zone.appendChild(draggingEl);
  } else {
    zone.insertBefore(draggingEl, afterEl);
  }
}

export function handleDragEnter(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

export function handleDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
    removeDropIndicator();
  }
}

export async function handleDrop(e) {
  e.preventDefault();
  const zone = e.currentTarget;
  zone.classList.remove('drag-over');
  removeDropIndicator();
  const newPriority = zone.dataset.priority;
  if (!state.draggedTaskId) return;

  const task = state.tasks.find(t => t.id === state.draggedTaskId);
  if (task) task.priority = newPriority;

  const items = zone.querySelectorAll('.task-item');
  const sheetsUpdates = [];
  items.forEach((item, idx) => {
    const t = state.tasks.find(t => t.id === item.dataset.id);
    if (t) {
      t.priority = newPriority;
      t.order = idx;
      if (t.source === 'line') sheetsUpdates.push(t);
    }
  });

  await window.api.saveTasks([...state.tasks, ...state.archivedTasks]);

  for (const t of sheetsUpdates) {
    window.api.updateSheetTask({ id: t.id, field: 'priority', value: t.priority }).catch(() => {});
  }
}

function getDragAfterElement(zone, y) {
  const items = [...zone.querySelectorAll('.task-item:not(.dragging)')];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: -Infinity }).element;
}

// ★ タスク操作
async function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    if (task.completed) {
      task.completedAt = Date.now();
      task.archived = true;
      state.addArchivedTask(task);
      state.setTasks(state.tasks.filter(t => t.id !== id));
      // ★ 完了履歴に記録
      recordCompletion(task).catch(e => console.error('履歴記録エラー:', e));
    } else {
      task.completedAt = null;
      task.archived = false;
      cancelArchive(id);
      // ★ 完了取り消し→履歴から削除
      removeCompletion(id).catch(e => console.error('履歴削除エラー:', e));
    }
    try {
      await window.api.saveTasks([...state.tasks, ...state.archivedTasks]);
    } catch (err) {
      console.error('タスク保存エラー(toggle):', err);
    }
    renderTasks();

    if (task.source === 'line') {
      window.api.updateSheetTask({
        id: task.id,
        field: 'completed',
        value: String(task.completed)
      }).catch(() => {});
    }
  }
}

async function deleteTask(id) {
  const task = state.tasks.find(t => t.id === id);
  cancelArchive(id);
  state.setTasks(state.tasks.filter(t => t.id !== id));

  if (task) {
    const tombstone = { ...task, archived: true, deleted: true };
    if (!state.archivedTasks.find(t => t.id === id)) {
      state.addArchivedTask(tombstone);
    }
  }

  try {
    await window.api.saveTasks([...state.tasks, ...state.archivedTasks]);
  } catch (err) {
    console.error('削除保存エラー:', err);
  }
  renderTasks();

  if (task && task.source === 'line') {
    window.api.updateSheetTask({
      id: id,
      field: 'archived',
      value: 'true'
    }).catch(() => {});
  }
}

export async function confirmResetTasks() {
  if (state.tasks.length === 0 && state.archivedTasks.length === 0) return;
  const incomplete = state.tasks.filter(t => !t.completed).length;
  if (incomplete > 0) {
    if (!confirm(`未完了タスク ${incomplete}件あります。リセットしますか？`)) return;
  }
  Object.keys(state.archiveTimers).forEach(id => clearTimeout(state.archiveTimers[id]));
  state.setArchiveTimers({});
  Object.keys(state.animTimers).forEach(id => clearTimeout(state.animTimers[id]));
  state.setAnimTimers({});
  state.setTasks([]);
  state.setArchivedTasks([]);
  await window.api.resetTasks();
  document.getElementById('task-summary').classList.add('hidden');
  renderTasks();
}

// ★ まとめ（トグル）— アーカイブが自動evictされている可能性があるためlazy load対応
export async function showSummary() {
  const summaryEl = document.getElementById('task-summary');
  if (!summaryEl.classList.contains('hidden')) {
    summaryEl.classList.add('hidden');
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // ★ メモリ上のアーカイブが不足している可能性があるためディスクから再取得
  const fullArchived = await state.loadArchivedTasksFull();
  const allTasks = [...fullArchived, ...state.tasks].filter(t => {
    if (!t.completedAt) return false;
    const completedDate = new Date(t.completedAt);
    completedDate.setHours(0, 0, 0, 0);
    return completedDate.getTime() === today.getTime();
  });
  const completed = allTasks.filter(t => t.completed);
  const incomplete = allTasks.filter(t => !t.completed);
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
  const priLabels = { today: '今日中', soon: 'できたら', anytime: 'いつでも', dev: '開発検討' };

  let s = `【${dateStr} タスクまとめ】\n\n`;
  if (completed.length) {
    s += `✅ 完了（${completed.length}件）\n`;
    completed.forEach(t => { s += `  ・${t.title}\n`; });
    s += '\n';
  }
  if (incomplete.length) {
    s += `⬜ 未完了（${incomplete.length}件）\n`;
    incomplete.forEach(t => { s += `  ・[${priLabels[t.priority]||''}] ${t.title}\n`; });
  }

  document.getElementById('summary-content').textContent = s;
  document.getElementById('task-summary').classList.remove('hidden');

}
