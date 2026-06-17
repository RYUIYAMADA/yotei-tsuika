'use strict';

/**
 * main/hotzone.js — ホットゾーンウィンドウ生成・修復・ヘルスチェック（P3-2）
 *
 * ⚠️ タイミング値・注入スクリプト内容を変更しないこと（macOS実機調整済み）
 */

const { BrowserWindow, screen } = require('electron');

const {
  HOT_ZONE_WIDTH,
  HOT_ZONE_TOP_MARGIN,
  HOT_ZONE_BOTTOM_MARGIN,
} = require('./constants');

const state = require('./app-state');

// ── showSidebar への参照（循環 require 回避: 引数で受け取る） ─
// createHotZone() は hotZoneWindow の page-title-updated で showSidebar を呼ぶ。
// window.js と hotzone.js を相互 require すると循環するため、
// main.js が setShowSidebarFn() で注入する。
let _showSidebarFn = () => {};
function setShowSidebarFn(fn) { _showSidebarFn = fn; }

// ── ホットゾーン定期ヘルスチェック間隔 ──────────────────────
const HOT_ZONE_HEALTH_CHECK_INTERVAL = 30 * 1000;

// ── ホットゾーンウィンドウ作成 ──────────────────────────────

/** ★ setVisibleOnAllWorkspaces のクロスプラットフォームラッパー */
function setVisibleOnAllWorkspacesSafe(win, visible) {
  try {
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(visible, { visibleOnFullScreen: true });
    } else {
      // Windows/Linux: visibleOnFullScreen オプション非対応・オプションなしで呼ぶ
      win.setVisibleOnAllWorkspaces(visible);
    }
  } catch (e) {
    // API非対応環境では無視
    console.log('ℹ️ setVisibleOnAllWorkspaces スキップ: ' + e.message);
  }
}

/** ★ ホットゾーン（右端の透明帯、上下に余白あり）
 *
 * ⚠️ 方式: transparent:true + setIgnoreMouseEvents(true, {forward:true})
 *    → OSレベルでマウスイベントを転送（mouse-enter/leaveイベント取得可能）
 *    → クリックは背後のウィンドウに通過
 */
function createHotZone() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const hotZoneHeight = screenHeight - HOT_ZONE_TOP_MARGIN - HOT_ZONE_BOTTOM_MARGIN;

  state.hotZoneWindow = new BrowserWindow({
    width: HOT_ZONE_WIDTH,
    height: hotZoneHeight,
    x: screenWidth - HOT_ZONE_WIDTH,
    y: HOT_ZONE_TOP_MARGIN,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });

  // ★ 透明だがマウスイベントを転送で受け取る
  //    forward:true → mouse-enter/leaveがElectronウィンドウイベントとして届く
  state.hotZoneWindow.setIgnoreMouseEvents(true, { forward: true });

  // ★ 右端にマウスが触れたらトリガー
  state.hotZoneWindow.loadURL(`data:text/html,
    <html><body style="margin:0;background:transparent;-webkit-app-region:no-drag;">
    <script>
      let hoverTimer = null;
      let showCooldownUntil = 0;
      function resetCooldown() {
        showCooldownUntil = 0;
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      }
      function arm() {
        if (hoverTimer) return;
        if (Date.now() < showCooldownUntil) return;
        hoverTimer = setTimeout(function() {
          hoverTimer = null;
          document.title = Date.now().toString();
        }, 200);
      }
      function onLeave() {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      }
    </script>
    <div style="width:100%;height:100%;"
         onmouseenter="arm()"
         onmousemove="arm()"
         onmouseleave="onLeave()"></div>
    </body></html>
  `);

  // ★ すべてのデスクトップ（Mission Control / 仮想デスクトップ）で表示
  setVisibleOnAllWorkspacesSafe(state.hotZoneWindow, true);
  state.hotZoneWindow.showInactive();

  state.hotZoneWindow.on('page-title-updated', (e, title) => {
    e.preventDefault();
    console.log('🎯 ホットゾーン検知');
    _showSidebarFn();
  });
}

// ── ホットゾーン位置計算 ────────────────────────────────────

/** ★ ホットゾーンの正しい位置を計算するヘルパー */
function getHotZoneBounds() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const hotZoneHeight = sh - HOT_ZONE_TOP_MARGIN - HOT_ZONE_BOTTOM_MARGIN;
  return {
    x: sw - HOT_ZONE_WIDTH,
    y: HOT_ZONE_TOP_MARGIN,
    width: HOT_ZONE_WIDTH,
    height: Math.max(hotZoneHeight, 100) // ★ 最低100pxは確保
  };
}

// ── ホットゾーン修復 ────────────────────────────────────────

/** ★ ホットゾーンの位置・状態を修復する（スリープ復帰時等） */
function repairHotZone() {
  if (!state.hotZoneWindow) {
    console.log('🔧 ホットゾーン消失 → 再作成');
    createHotZone();
    return;
  }

  // ★ ウィンドウが破棄されていないか確認
  try {
    if (state.hotZoneWindow.isDestroyed()) {
      console.log('🔧 ホットゾーン破棄済み → 再作成');
      state.hotZoneWindow = null;
      createHotZone();
      return;
    }
  } catch (e) {
    console.log('🔧 ホットゾーン異常 → 再作成');
    state.hotZoneWindow = null;
    createHotZone();
    return;
  }

  // ★ 位置が正しければ何もしない（不要なネイティブAPIコール削減）
  const expected = getHotZoneBounds();
  const current = state.hotZoneWindow.getBounds();
  if (current.x === expected.x && current.y === expected.y &&
      current.width === expected.width && current.height === expected.height) {
    return;
  }

  state.hotZoneWindow.setBounds(expected);
  state.hotZoneWindow.setAlwaysOnTop(true);
  setVisibleOnAllWorkspacesSafe(state.hotZoneWindow, true);

  if (!state.isWindowVisible && !state.isAnimating) {
    state.hotZoneWindow.showInactive();
  }
}

// ── ヘルスチェック ──────────────────────────────────────────

/** ★ ホットゾーン定期ヘルスチェック（30秒ごと） */
function startHotZoneHealthCheck() {
  state.healthCheckTimer = setInterval(() => {
    // ★ サイドバー表示中・アニメーション中はスキップ
    if (state.isWindowVisible || state.isAnimating) return;
    repairHotZone();
  }, HOT_ZONE_HEALTH_CHECK_INTERVAL);
}

module.exports = {
  createHotZone,
  getHotZoneBounds,
  repairHotZone,
  startHotZoneHealthCheck,
  setShowSidebarFn,
};
