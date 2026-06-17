// ★ Google Sheets タスク同期（LINE連携）
import { SHEETS_SYNC_INTERVAL_MS } from "./constants.js";
import * as state from "./state.js";
import { renderTasks } from "./tasks.js";
import { showSyncIndicator } from "./sync.js";

export function startSheetsSyncLoop() {
  syncTasksFromSheet();
  state.setSheetsSyncTimer(setInterval(() => {
    syncTasksFromSheet();
  }, SHEETS_SYNC_INTERVAL_MS));
}

async function syncTasksFromSheet() {
  try {
    const result = await window.api.syncTasksFromSheet();
    // GASは { tasks: [...] } を返す（success フィールドは任意）
    if (!result || !Array.isArray(result.tasks)) return;

    const sheetTasks = result.tasks;
    const activeTasks = sheetTasks.filter(t => !t.archived && !t.completed);

    let changed = false;

    // ★ GASで「完了」になっているタスクをローカルでもアーカイブ
    const gasCompletedIds = new Set(
      sheetTasks.filter(t => t.completed).map(t => String(t.id))
    );
    for (const t of [...state.tasks]) {
      if (t.source === 'line' && gasCompletedIds.has(String(t.id)) && !t.archived) {
        t.archived = true;
        t.completed = true;
        t.completedAt = t.completedAt || Date.now();
        state.addArchivedTask(t);
        state.setTasks(state.tasks.filter(x => x.id !== t.id));
        changed = true;
      }
    }

    // ★ Sheetsから消えたシートタスクをローカルからも削除
    const sheetIds = new Set(activeTasks.map(t => String(t.id)));
    const beforeCount = state.tasks.length;
    state.setTasks(state.tasks.filter(t => {
      if (t.source === "line" && !sheetIds.has(String(t.id))) return false;
      return true;
    }));
    if (state.tasks.length !== beforeCount) changed = true;

    // ★ ローカルで完了済み・アーカイブ済みのIDセット（再追加防止）
    const locallyDoneIds = new Set([
      ...state.tasks.filter(t => t.completed || t.archived).map(t => String(t.id)),
      ...state.archivedTasks.map(t => String(t.id))
    ]);

    // ★ 新規タスクをマージ
    const VALID_PRIORITIES = new Set(["today", "soon", "anytime", "dev"]);
    for (const sheetTask of activeTasks) {
      const taskId = String(sheetTask.id);
      const existsLocal = state.tasks.find(t => String(t.id) === taskId);
      const existsArchived = state.archivedTasks.find(t => String(t.id) === taskId);

      if (!existsLocal && !existsArchived && !locallyDoneIds.has(taskId)) {
        state.addTask({
          id: taskId,
          title: sheetTask.title || "（タイトルなし）",
          priority: VALID_PRIORITIES.has(sheetTask.priority) ? sheetTask.priority : "today",
          completed: false,
          order: sheetTask.order || 0,
          createdAt: sheetTask.createdAt || Date.now(),
          source: "line"
        });
        changed = true;
      }
    }

    if (changed) {
      await window.api.saveTasks([...state.tasks, ...state.archivedTasks]);
      renderTasks();
      showSyncIndicator("success");
    }
  } catch (err) {
    console.log("Sheets同期スキップ:", err.message || err);
  }
}
