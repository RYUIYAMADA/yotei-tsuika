'use strict';

/**
 * main/app-state.js — アプリグローバル可変状態の一元管理（P3-1）
 *
 * ⚠️ このオブジェクトは参照渡しで共有する。
 *    各モジュールは state.xxx を読み書きすること。
 *    state オブジェクト自体を差し替えない（= state = {} は禁止）。
 */

const state = {
  // ── ウィンドウ参照 ──────────────────────────────
  /** @type {Electron.BrowserWindow | null} */
  mainWindow: null,
  /** @type {Electron.BrowserWindow | null} */
  hotZoneWindow: null,
  /** @type {Electron.Tray | null} */
  tray: null,

  // ── ウィンドウ表示状態 ────────────────────────
  isWindowVisible: false,
  isPinned: false,
  isAnimating: false,

  // ── 除外アプリ監視 ────────────────────────────
  isExcludedAppActive: false,
  /** @type {NodeJS.Timeout | null} */
  excludedAppCheckTimer: null,

  // ── スライドアニメーション ────────────────────
  lastHideTime: 0,
  /** @type {NodeJS.Timeout | null} */
  slideAnimTimer: null,
  /** 明示的 close-window がアニメ中に来た場合のみ使用 */
  pendingHide: false,
  /** showSidebar() 開始時に設定（アニメ完了後ではない） */
  lastShowTime: 0,

  // ── マウス離脱デバウンス ──────────────────────
  /** @type {NodeJS.Timeout | null} */
  mouseLeaveDebounceTimer: null,

  // ── ヘルスチェックタイマー ────────────────────
  /** @type {NodeJS.Timeout | null} */
  healthCheckTimer: null,
  /** @type {NodeJS.Timeout | null} */
  _periodicHealthTimer: null,
};

module.exports = state;
