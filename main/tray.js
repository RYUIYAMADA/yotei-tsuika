'use strict';

/**
 * main/tray.js — トレイアイコン生成（P3-5）
 *
 * ⚠️ ロジック・タイミング・実行順序は main.js から一切変更しない（移動のみ）
 */

const { app, Tray, Menu } = require('electron');
const path               = require('path');

const state = require('./app-state');

// ──────────────────────────────────────────
// createTray
// ──────────────────────────────────────────

function createTray(showSidebar, hideSidebar) {
  const iconName = process.platform === 'darwin' ? 'tray-iconTemplate.png' : 'tray-icon.png';
  state.tray = new Tray(path.join(__dirname, '..', 'assets', iconName));
  state.tray.setToolTip('タスク管理');
  state.tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'サイドバー表示', click: showSidebar },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() }
  ]));
  state.tray.on('click', () => {
    state.isWindowVisible ? hideSidebar() : showSidebar();
  });
}

module.exports = { createTray };
