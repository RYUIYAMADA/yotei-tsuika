'use strict';

/**
 * main/window.js — メインウィンドウ生成・スライドアニメーション・show/hide制御（P3-2）
 *
 * ⚠️ タイミング値・実行順序を変更しないこと（macOS実機調整済み）
 *    詳細は showSidebar / hideSidebar の BugFixメモを参照。
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const fs   = require('fs');

const {
  WINDOW_WIDTH,
  WINDOW_OPACITY,
  SLIDE_IN_DURATION,
  SLIDE_COOLDOWN,
  SHOW_GRACE_PERIOD,
} = require('./constants');

const state = require('./app-state');

// ── デバッグモード（main.js と同じ参照方法）──────────────────
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// ── logStartupEvent の参照（循環避けのため関数引数で受け取る） ─
// main.js から createWindow(logFn) の形で渡す
// ただし既存呼び出しシグネチャ createWindow() を維持するため
// モジュールレベルで setter を用意する
let _logFn = (msg) => {};
function setLogFn(fn) { _logFn = fn; }

// ── イージング関数 ───────────────────────────────────────────

/** ★ イージング関数 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
/** ★ 非表示用: 均一に加速して消える（最後に停止しない） */
function easeInQuad(t) {
  return t * t;
}

// ── メインウィンドウ作成 ────────────────────────────────────

/** ★ メインウィンドウ作成 */
function createWindow() {
  try {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

    // ★ 正常モード: 右側スライド表示
    const windowWidth = WINDOW_WIDTH;
    const windowHeight = screenHeight;
    const windowX = screenWidth;

    state.mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: windowX,
      y: 0,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      opacity: WINDOW_OPACITY,
      backgroundColor: '#1a1a2e',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const indexPath = path.join(__dirname, '..', 'index.html');
    if (DEBUG_MODE) {
      console.log('📄 index.html パス:', indexPath);
      console.log('📄 ファイル存在確認:', fs.existsSync(indexPath));
    }

    state.mainWindow.loadFile(indexPath).catch(err => {
      console.error('❌ index.htmlロードエラー:', err);
      _logFn('❌ index.htmlロード失敗: ' + err.message);
    });

    // ★ ウィンドウ準備完了イベント
    state.mainWindow.once('ready-to-show', () => {
      if (DEBUG_MODE) console.log('✅ ウィンドウ準備完了（表示待機中）');
      _logFn('✅ ウィンドウ準備完了（表示待機中）');
    });

    // ★ すべてのデスクトップ（Mission Control / 仮想デスクトップ）で表示
    if (process.platform === 'darwin') {
      state.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      try { state.mainWindow.setVisibleOnAllWorkspaces(true); } catch (e) { /* Win/Linux: 無視 */ }
    }
    state.mainWindow.on('closed', () => { state.mainWindow = null; });

    console.log('✅ createWindow完了');
  } catch (err) {
    console.error('❌ createWindowエラー:', err.message);
  }
}

// ── サイドバー表示制御 ──────────────────────────────────────
// ────────────────────────────────────────────────────────────
// 【バグ根本原因メモ（2026-05-29 修正）】
// Bug#1: lastShowTime をアニメーション完了後に設定していたため、アニメーション中に
//        mouseleave が発火すると lastShowTime=0 でグレースピリオドが無効化され、
//        300ms のデバウンスタイマーが走り、アニメーション完了後に即 close されていた
// Bug#2: mouse-leave-window ハンドラーが isAnimating=true 中でもデバウンスタイマーを
//        開始してしまい、上記 Bug#1 を増幅させていた
// Bug#3: mainWindow.focus() をアニメーション完了直後に呼ぶと macOS が mouse 位置を
//        再評価し、境界付近の cursor に spurious mouseleave を送ることがある
// ────────────────────────────────────────────────────────────

function showSidebar() {
  console.log(`[SHOW] called  visible=${state.isWindowVisible} anim=${state.isAnimating} pinned=${state.isPinned}`);

  if (!state.mainWindow) { console.warn('[SHOW] skip: mainWindow null'); return; }
  if (state.isExcludedAppActive) { console.log('[SHOW] skip: excluded app'); return; }
  if (state.isWindowVisible || state.isAnimating) {
    console.log(`[SHOW] skip: visible=${state.isWindowVisible} anim=${state.isAnimating}`);
    return;
  }

  const timeSinceLastHide = Date.now() - state.lastHideTime;
  if (timeSinceLastHide < SLIDE_COOLDOWN) {
    console.log(`[SHOW] skip: cooldown ${timeSinceLastHide}ms < ${SLIDE_COOLDOWN}ms`);
    return;
  }

  // ★ Bug#1 修正: lastShowTime はアニメーション開始時に設定する
  state.lastShowTime = Date.now();

  // ★ 前回の mouseleave デバウンスタイマーをクリア（前回 hide のタイマー残骸対策）
  if (state.mouseLeaveDebounceTimer) {
    clearTimeout(state.mouseLeaveDebounceTimer);
    state.mouseLeaveDebounceTimer = null;
  }

  state.isAnimating = true;
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const startX = screenWidth + 10;
  const targetX = screenWidth - WINDOW_WIDTH;

  state.mainWindow.setPosition(startX, 0);
  state.mainWindow.showInactive();
  if (state.hotZoneWindow) state.hotZoneWindow.hide();

  const animStart = Date.now();
  if (state.slideAnimTimer) { clearInterval(state.slideAnimTimer); state.slideAnimTimer = null; }

  const animate = () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) { state.isAnimating = false; return; }
    const elapsed = Date.now() - animStart;
    const progress = Math.min(elapsed / SLIDE_IN_DURATION, 1);
    const eased = easeOutCubic(progress);
    const currentX = Math.round(startX + (targetX - startX) * eased);
    state.mainWindow.setPosition(currentX, 0);

    if (progress < 1) {
      state.slideAnimTimer = setTimeout(animate, 8);
    } else {
      state.slideAnimTimer = null;
      state.mainWindow.setPosition(targetX, 0);
      state.isWindowVisible = true;
      state.isAnimating = false;
      console.log(`[SHOW] anim done  pendingHide=${state.pendingHide}`);

      // ★ Bug#3 修正: focus() をアニメ完了から 350ms 遅延させて OS の
      //   mouse 位置再評価による spurious mouseleave を防ぐ
      setTimeout(() => {
        if (state.mainWindow && !state.mainWindow.isDestroyed() && state.isWindowVisible) {
          state.mainWindow.focus();
        }
      }, 350);

      state.mainWindow.webContents.send('sidebar-shown');

      // ★ 明示的 close-window がアニメ中に来ていた場合のみ処理
      if (state.pendingHide) {
        state.pendingHide = false;
        setTimeout(() => hideSidebar(), 30);
      }
    }
  };
  animate();
}

/** ★ サイドバー非表示 */
function hideSidebar() {
  if (!state.mainWindow) return;
  if (state.isPinned) return;

  // ★ アニメ中の明示的 close 要求は保留（完了後に pendingHide で処理）
  if (state.isAnimating) {
    console.log('[HIDE] anim中 → pendingHide=true');
    state.pendingHide = true;
    return;
  }

  // ★ 非表示状態でもホットゾーンは必ず復帰（ロック防止）
  if (!state.isWindowVisible) {
    if (state.hotZoneWindow && !state.hotZoneWindow.isDestroyed()) {
      state.hotZoneWindow.showInactive();
      state.hotZoneWindow.webContents.executeJavaScript('resetCooldown()').catch(() => {});
    }
    return;
  }

  console.log('[HIDE] 実行');
  state.mainWindow.hide();
  state.isWindowVisible = false;
  state.lastHideTime = Date.now();

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  state.mainWindow.setPosition(screenWidth, 0);

  if (state.hotZoneWindow && !state.hotZoneWindow.isDestroyed()) {
    state.hotZoneWindow.showInactive();
    state.hotZoneWindow.webContents.executeJavaScript('resetCooldown()').catch(() => {});
  }
}

module.exports = {
  createWindow,
  showSidebar,
  hideSidebar,
  easeOutCubic,
  easeInQuad,
  setLogFn,
};
