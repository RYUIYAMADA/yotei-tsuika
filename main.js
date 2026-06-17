const { app, ipcMain, screen } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

// ★ 環境変数の読み込み（セキュリティ対応）
// override:true → シェル環境に古いキーが設定されていても .env の値で上書きする
require('dotenv').config({ override: true });

// ──────────────────────────────────────────
// サブモジュール（P3-1〜P3-5）
// ──────────────────────────────────────────

const {
  WINDOW_WIDTH,
  SHOW_GRACE_PERIOD,
} = require('./main/constants');

const appConfig  = require('./main/config');
const state      = require('./main/app-state');

const windowMod  = require('./main/window');
const { createWindow, showSidebar, hideSidebar, setLogFn } = windowMod;

const hotzoneMod = require('./main/hotzone');
const { createHotZone, repairHotZone, startHotZoneHealthCheck, setShowSidebarFn } = hotzoneMod;

const calendarCache = require('./main/calendar-cache');
const { ensureCalendarCache, startCachePruning, stopCachePruning, clearCalendarCache } = calendarCache;

const ipcCalendar = require('./main/ipc/calendar');
const ipcTasks    = require('./main/ipc/tasks');
const ipcGas      = require('./main/ipc/gas');
const ipcGemini   = require('./main/ipc/gemini');

const health = require('./main/health');
const {
  logStartupEvent, recordStartupCheck, checkPreviousStartup,
  cleanupBrokenFiles, startPeriodicHealthCheck, registerPowerMonitorHandlers,
} = health;

const { createTray } = require('./main/tray');

// ──────────────────────────────────────────
// showSidebar を hotzone.js に注入（循環 require 回避）
// ──────────────────────────────────────────

setShowSidebarFn(showSidebar);

// ──────────────────────────────────────────
// IPC ハンドラ登録（P3-3〜P3-4）
// ──────────────────────────────────────────

ipcCalendar.register();
ipcTasks.register();
ipcGas.register();
ipcGemini.register();

// ──────────────────────────────────────────
// バリデーションヘルパー（inline 系）
// ──────────────────────────────────────────

function isValidDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

// ──────────────────────────────────────────
// 除外アプリ監視（Lightroom/Capture One）
// ──────────────────────────────────────────

const EXCLUDED_APP_PATTERN = new RegExp(
  appConfig.getAppConfig().excludedApps.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

function startExcludedAppMonitor() {
  if (state.excludedAppCheckTimer) return;
  state.excludedAppCheckTimer = setInterval(() => {
    execFile('osascript', ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'],
      { timeout: 1000 }, (err, stdout) => {
      if (err) return;
      const frontApp = stdout.trim();
      const wasExcluded = state.isExcludedAppActive;
      state.isExcludedAppActive = EXCLUDED_APP_PATTERN.test(frontApp);

      if (state.isExcludedAppActive && !wasExcluded) {
        console.log('⏸️ 除外アプリ検知: ' + frontApp);
        if (state.isWindowVisible && state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.hide();
          state.isWindowVisible = false;
        }
        if (state.hotZoneWindow && !state.hotZoneWindow.isDestroyed()) state.hotZoneWindow.hide();
      } else if (!state.isExcludedAppActive && wasExcluded) {
        console.log('▶️ 除外アプリ終了 → ホットゾーン復帰');
        if (state.hotZoneWindow && !state.hotZoneWindow.isDestroyed()) state.hotZoneWindow.showInactive();
      }
    });
  }, 2000);
}

// ──────────────────────────────────────────
// 二重起動防止
// ──────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('⚠️ 既にインスタンスが起動中。終了します。');
  app.quit();
}

// ──────────────────────────────────────────
// 起動時 GAS 同期（バックグラウンド）
// ──────────────────────────────────────────

async function syncTodayFromGasOnStartup() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const result = await ipcCalendar.fetchAndMergeCalendarEvents(today);
  if (result.source === 'gas-api') {
    console.log(`📅 起動同期: ${today} → ${result.events.length}件`);
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('calendar-updated', today);
    }
  }
}

// ──────────────────────────────────────────
// mouse-leave / mouse-enter / close-window / pin-window IPC
// ──────────────────────────────────────────

ipcMain.on('mouse-leave-window', () => {
  if (state.isPinned) return;

  // ★ Bug#2 修正: アニメーション中の mouseleave はデバウンスタイマーすら開始しない
  if (state.isAnimating) {
    console.log('[LEAVE] skip: animating');
    return;
  }

  const timeSinceShow = Date.now() - state.lastShowTime;
  console.log(`[LEAVE] timeSinceShow=${timeSinceShow}ms grace=${SHOW_GRACE_PERIOD}ms`);

  // ★ show 開始から SHOW_GRACE_PERIOD ms 以内は無視（アニメーション後の境界誤発火対策）
  if (timeSinceShow < SHOW_GRACE_PERIOD) {
    console.log('[LEAVE] skip: grace period');
    return;
  }

  if (state.mouseLeaveDebounceTimer) clearTimeout(state.mouseLeaveDebounceTimer);
  state.mouseLeaveDebounceTimer = setTimeout(() => {
    state.mouseLeaveDebounceTimer = null;
    console.log('[LEAVE] debounce fired → hideSidebar');
    hideSidebar();
  }, 80);
});

ipcMain.on('mouse-enter-window', () => {
  if (state.mouseLeaveDebounceTimer) {
    console.log('[ENTER] デバウンスキャンセル');
    clearTimeout(state.mouseLeaveDebounceTimer);
    state.mouseLeaveDebounceTimer = null;
  }
});

ipcMain.on('close-window', () => hideSidebar());

ipcMain.on('pin-window', (_, pinned) => {
  state.isPinned = pinned;
});

// ──────────────────────────────────────────
// app.whenReady — 起動8段階シーケンス
// ──────────────────────────────────────────

app.whenReady().then(() => {
  logStartupEvent('===== アプリ起動開始 =====');

  // ★ logStartupEvent を window.js に注入
  setLogFn(logStartupEvent);

  try {
    // ★ 前回の起動状態確認（クラッシュ検知）
    const isHealthy = checkPreviousStartup();
    if (!isHealthy) {
      logStartupEvent('⚠️ クラッシュから復帰: 起動時チェック強化');
    }

    // ★ ステップ0.5: brokenファイルのクリーンアップ
    cleanupBrokenFiles();

    // ★ ステップ0.7: GAS warmup ping（cold start 1〜3秒を解消）
    // 後段の syncTodayFromGasOnStartup までに GAS インスタンスを温める
    try {
      const _gasUrl = appConfig.getGasWebAppUrl();
      if (_gasUrl) {
        const { net } = require('electron');
        const _warmupStart = Date.now();
        net.fetch(_gasUrl + '?action=list', { redirect: 'follow' })
          .then(() => logStartupEvent(`🔥 GAS warmup 完了 (${Date.now() - _warmupStart}ms)`))
          .catch(() => logStartupEvent('⚠️ GAS warmup 失敗（無視）'));
      }
    } catch (e) { /* warmup失敗は致命的ではない */ }

    // ★ ステップ1: カレンダーキャッシュをロード
    try {
      logStartupEvent('📚 カレンダーキャッシュを読込中...');
      ensureCalendarCache();
      logStartupEvent('✅ カレンダーキャッシュロード完了');
    } catch (e) {
      logStartupEvent('⚠️ カレンダーキャッシュロード失敗: ' + e.message);
      // 続行（必須ではない）
    }

    // ★ ステップ2: メインウィンドウを作成
    try {
      logStartupEvent('🪟 メインウィンドウを作成中...');
      createWindow();
      if (!state.mainWindow || state.mainWindow.isDestroyed()) {
        throw new Error('ウィンドウ作成失敗');
      }
      logStartupEvent('✅ メインウィンドウ作成完了');
    } catch (e) {
      logStartupEvent('❌ ウィンドウ作成エラー: ' + e.message);
      throw e; // 致命的エラー
    }

    // ★ ステップ3: ホットゾーンを作成
    try {
      logStartupEvent('🔥 ホットゾーンを作成中...');
      createHotZone();
      logStartupEvent('✅ ホットゾーン作成完了');
    } catch (e) {
      logStartupEvent('⚠️ ホットゾーン作成失敗: ' + e.message);
      // ホットゾーン失敗は致命的ではない
    }

    // ★ ステップ4: Trayアイコンを作成
    try {
      logStartupEvent('📌 Trayアイコンを作成中...');
      createTray(showSidebar, hideSidebar);
      logStartupEvent('✅ Trayアイコン作成完了');
    } catch (e) {
      logStartupEvent('⚠️ Trayアイコン作成失敗: ' + e.message);
    }

    // ★ ステップ5: ホットゾーンヘルスチェック開始
    try {
      logStartupEvent('🏥 ホットゾーンヘルスチェック開始...');
      startHotZoneHealthCheck();
      logStartupEvent('✅ ホットゾーンヘルスチェック開始');
    } catch (e) {
      logStartupEvent('⚠️ ホットゾーンヘルスチェック開始失敗: ' + e.message);
    }

    // ★ ステップ5.5: 除外アプリ監視開始（Lightroom/Capture One）
    try {
      startExcludedAppMonitor();
      logStartupEvent('✅ 除外アプリ監視開始');
    } catch (e) {
      logStartupEvent('⚠️ 除外アプリ監視開始失敗: ' + e.message);
    }

    // ★ ステップ5.6: キャッシュ定期剪定開始
    startCachePruning();

    // ★ ステップ6: GASからデータ同期（バックグラウンド）
    try {
      logStartupEvent('📡 GASからデータ同期中...');
      syncTodayFromGasOnStartup();
      // 非同期なので完了を待たない
    } catch (e) {
      logStartupEvent('⚠️ GAS同期エラー: ' + e.message);
    }

    // ★ ステップ7&8: 統合ウィンドウ調整（最適化版）
    // 以前は2秒と5秒後に別々に呼び出していたが、1回に統合してCPU/GPU負荷削減
    setTimeout(() => {
      try {
        logStartupEvent('🔧 ホットゾーン修復 (5秒後)');
        repairHotZone();
      } catch (e) {
        logStartupEvent('❌ フォールバック表示エラー: ' + e.message);
      }
    }, 5000);

    // ★ 起動成功をマーク
    recordStartupCheck();
    logStartupEvent('✅ 起動完了');
    console.log('🎉 アプリが正常に起動しました');

  } catch (err) {
    logStartupEvent('❌ 致命的エラー: ' + err.message);
    console.error('❌ 起動エラー:', err);

    // ★ 自動再起動はlaunchdのKeepAliveに委任（app.relaunch競合防止）
    logStartupEvent('🔄 プロセス終了 → launchd が再起動します');
    app.exit(1);
  }

  // ★ ディスプレイ変更時（外部モニタ接続/切断、解像度変更）
  screen.on('display-metrics-changed', () => {
    console.log('🖥️ ディスプレイ設定変更を検知');
    // ★ ホットゾーンの位置を正しくリセット（TOP_MARGINを反映）
    repairHotZone();
    // ★ メインウィンドウの高さも更新
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      const { height: sh } = screen.getPrimaryDisplay().workAreaSize;
      state.mainWindow.setSize(WINDOW_WIDTH, sh);
    }
  });

  // ★ powerMonitor ハンドラ（スリープ復帰・ロック解除・AC接続）
  registerPowerMonitorHandlers(repairHotZone);

  // ★ 定期ヘルスチェック（5分ごと）
  startPeriodicHealthCheck();
});

// ──────────────────────────────────────────
// app ライフサイクル
// ──────────────────────────────────────────

// ★ 二重起動時は既存インスタンスのサイドバーを表示
app.on('second-instance', () => {
  showSidebar();
});

app.on('window-all-closed', () => {});

// ★ 終了時のクリーンアップ（全タイマー・キャッシュ解放）
app.on('will-quit', () => {
  if (state.excludedAppCheckTimer)  { clearInterval(state.excludedAppCheckTimer);  state.excludedAppCheckTimer  = null; }
  if (state.healthCheckTimer)       { clearInterval(state.healthCheckTimer);        state.healthCheckTimer       = null; }
  if (state._periodicHealthTimer)   { clearInterval(state._periodicHealthTimer);    state._periodicHealthTimer   = null; }
  if (state.slideAnimTimer)         { clearTimeout(state.slideAnimTimer);           state.slideAnimTimer         = null; }
  stopCachePruning();
  clearCalendarCache();
});

app.on('activate', () => { if (!state.mainWindow) createWindow(); });
