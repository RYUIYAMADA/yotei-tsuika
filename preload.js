const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ★ カレンダー設定
  getCalendarConfig: () => ipcRenderer.invoke('get-calendar-config'),

  // ★ タスク
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  saveTasks: (tasks) => ipcRenderer.invoke('save-tasks', tasks),
  resetTasks: () => ipcRenderer.invoke('reset-tasks'),

  // ★ カレンダーデータ（ローカルJSON）
  loadCalendarData: () => ipcRenderer.invoke('load-calendar-data'),
  saveCalendarData: (events) => ipcRenderer.invoke('save-calendar-data', events),

  // ★ カレンダー同期（Googleから取得）
  syncCalendar: (dateStr) => ipcRenderer.invoke('sync-calendar', dateStr),
  prefetchCalendarRange: (dates) => ipcRenderer.invoke('prefetch-calendar-range', dates),

  // ★ カレンダー予定直接登録（GAS経由→即反映）
  createCalendarEvent: (eventData) => ipcRenderer.invoke('create-calendar-event', eventData),

  // ★ Sheets同期（GAS WebアプリAPI経由）
  syncTasksFromSheet: () => ipcRenderer.invoke('sync-tasks-from-sheet'),
  updateSheetTask: (params) => ipcRenderer.invoke('update-sheet-task', params),
  saveGasConfig: (config) => ipcRenderer.invoke('save-gas-config', config),
  loadGasConfig: () => ipcRenderer.invoke('load-gas-config'),

  // ★ マウス状態
  mouseEnterWindow: () => ipcRenderer.send('mouse-enter-window'),
  mouseLeaveWindow: () => ipcRenderer.send('mouse-leave-window'),

  // ★ ピン留め
  pinWindow: (pinned) => ipcRenderer.send('pin-window', pinned),

  // ★ ウィンドウ
  closeWindow: () => ipcRenderer.send('close-window'),

  // ★ サイドバー表示通知（リスナー蓄積防止）
  onSidebarShown: (cb) => {
    ipcRenderer.removeAllListeners('sidebar-shown');
    ipcRenderer.on('sidebar-shown', cb);
  },

  // ★ カレンダー更新通知（リスナー蓄積防止）
  onCalendarUpdated: (cb) => {
    ipcRenderer.removeAllListeners('calendar-updated');
    ipcRenderer.on('calendar-updated', (_, dateStr) => cb(dateStr));
  },

  // ★ Gemini: 自然言語→イベントJSON変換
  parseEventWithGemini: (text, today) => ipcRenderer.invoke('parse-event-with-gemini', { text, today }),

  // ★ タスク完了履歴（data-store）
  dataStoreLoad: () => ipcRenderer.invoke('data-store:load'),
  dataStoreSave: (data) => ipcRenderer.invoke('data-store:save', data),

  // ★ ダッシュボードデータ
  loadDashboardData: () => ipcRenderer.invoke('load-dashboard-data'),

  // ★ P2-3: アプリ設定取得（app-config.json の内容）
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),

  // ★ P2-4: ハピネッツ試合日取得（GAS gamedays または定数フォールバック）
  getGameDays: () => ipcRenderer.invoke('get-game-days'),
});
