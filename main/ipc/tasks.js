'use strict';

/**
 * main/ipc/tasks.js — タスク系 IPC ハンドラ（P3-4）
 *
 * 登録ハンドラ:
 *   get-tasks, save-tasks, reset-tasks,
 *   data-store:load, data-store:save,
 *   load-dashboard-data,
 *   get-app-config
 *
 * ⚠️ ロジック・タイミング・実行順序は main.js から一切変更しない（移動のみ）
 */

const { ipcMain, app } = require('electron');
const path             = require('path');
const fs               = require('fs');
const Store            = require('electron-store');

const appConfig = require('../config');

// ──────────────────────────────────────────
// electron-store（タスク・イベントキュー永続化）
// ──────────────────────────────────────────

const store = new Store({
  defaults: {
    tasks: []
  }
});

// ──────────────────────────────────────────
// バリデーションヘルパー
// ──────────────────────────────────────────

function isValidTask(task) {
  if (!task || typeof task !== 'object') return false;
  if (typeof task.id !== 'string' || task.id.length > 128) return false;
  if (typeof task.title !== 'string' || task.title.length > 1000) return false;
  // priority/completedは任意（アーカイブ済み等で異なる場合あり）
  if (task.priority && !['today', 'soon', 'anytime', 'dev'].includes(task.priority)) return false;
  return true;
}

// ──────────────────────────────────────────
// パス定義
// ──────────────────────────────────────────

// ★ IPC: タスク完了履歴（data-store）— app.getPath は app 起動後に有効
// register() 内で初期化する
let HISTORY_PATH = null;

// ──────────────────────────────────────────
// IPC ハンドラ登録
// ──────────────────────────────────────────

function register() {
  HISTORY_PATH = path.join(app.getPath('userData'), 'task-history.json');

  // ★ IPC: タスク完了履歴（data-store）
  ipcMain.handle('data-store:load', () => {
    try {
      if (fs.existsSync(HISTORY_PATH)) {
        return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
      }
    } catch (e) { console.error('履歴ロードエラー:', e.message); }
    return [];
  });

  ipcMain.handle('data-store:save', (_, data) => {
    try {
      if (!Array.isArray(data) || data.length > 10000) return false;
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e) { console.error('履歴保存エラー:', e.message); return false; }
  });

  // ★ IPC: タスク管理
  ipcMain.handle('get-tasks',   ()         => store.get('tasks', []));
  ipcMain.handle('save-tasks',  (_, tasks) => {
    if (!Array.isArray(tasks) || tasks.length > 2000) return false;
    const validated = tasks.filter(isValidTask);
    store.set('tasks', validated);
    return true;
  });
  ipcMain.handle('reset-tasks', ()         => { store.set('tasks', []); return true; });

  // ★ IPC: ダッシュボードデータ読み込み
  ipcMain.handle('load-dashboard-data', () => {
    try {
      const raw = fs.readFileSync('/tmp/dashboard-data.json', 'utf-8');
      return JSON.parse(raw);
    } catch (e) { return null; }
  });

  // ★ P2-3: app-config.json の内容を renderer へ渡す IPC
  ipcMain.handle('get-app-config', () => {
    return appConfig.getAppConfig();
  });
}

// store を外部公開（main.js の他ハンドラが使う場合に備える）
module.exports = { register, store };
