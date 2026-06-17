// ★ タスク完了履歴の蓄積・統計API
// データはElectronのuserDataにJSON保存（window.api経由）

let _history = null; // インメモリキャッシュ

async function ensureLoaded() {
  if (_history !== null) return;
  try {
    const data = await window.api.dataStoreLoad();
    _history = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('data-store: ロードエラー:', e);
    _history = [];
  }
}

async function save() {
  try {
    await window.api.dataStoreSave(_history);
  } catch (e) {
    console.error('data-store: 保存エラー:', e);
  }
}

/**
 * タスク完了を記録
 * @param {{ id: string, title: string, category?: string, createdAt?: number, completedAt: number }} task
 */
export async function recordCompletion(task) {
  await ensureLoaded();
  // 重複防止（同一ID+同一完了日は記録しない）
  const dateStr = new Date(task.completedAt).toISOString().slice(0, 10);
  const exists = _history.some(h => h.id === task.id && h.date === dateStr);
  if (exists) return;

  const elapsed = (task.completedAt && task.createdAt)
    ? task.completedAt - task.createdAt
    : null;

  _history.push({
    id: task.id,
    title: task.title,
    date: dateStr,
    completedAt: task.completedAt,
    duration: elapsed,           // ミリ秒（所要時間）
    category: task.priority || 'today'  // priority をカテゴリとして流用
  });

  await save();
}

/**
 * 完了を取り消す（toggleで未完了に戻した場合）
 */
export async function removeCompletion(taskId) {
  await ensureLoaded();
  const before = _history.length;
  _history = _history.filter(h => h.id !== taskId);
  if (_history.length !== before) await save();
}

/**
 * 週次統計: 指定日を含む週（月〜日）の完了タスク数
 * @param {Date} [refDate] 基準日（デフォルト=今日）
 * @returns {{ total: number, byCategory: Record<string, number>, byDate: Record<string, number> }}
 */
export async function weeklyStats(refDate = new Date()) {
  await ensureLoaded();
  const d = new Date(refDate);
  const day = d.getDay() || 7; // 月=1...日=7
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return aggregate(monday, sunday);
}

/**
 * 月次統計
 * @param {number} [year]
 * @param {number} [month] 1-12
 */
export async function monthlyStats(year, month) {
  await ensureLoaded();
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? (now.getMonth() + 1);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return aggregate(start, end);
}

/**
 * 全履歴を返す（UIでの詳細表示用）
 */
export async function getHistory() {
  await ensureLoaded();
  return [..._history];
}

// --- 内部 ---

function aggregate(start, end) {
  const startTs = start.getTime();
  const endTs = end.getTime();
  const filtered = _history.filter(h => h.completedAt >= startTs && h.completedAt <= endTs);

  const byCategory = {};
  const byDate = {};
  for (const h of filtered) {
    byCategory[h.category] = (byCategory[h.category] || 0) + 1;
    byDate[h.date] = (byDate[h.date] || 0) + 1;
  }

  return { total: filtered.length, byCategory, byDate };
}
