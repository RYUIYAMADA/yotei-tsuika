'use strict';

/**
 * main/health.js — 起動ログ・ヘルスチェック・クラッシュ検知（P3-5）
 *
 * 役割:
 *   - logStartupEvent: startup.log への追記（DEBUG_MODE 制御）
 *   - checkPreviousStartup: 前回起動状態確認・クラッシュ検知
 *   - recordStartupCheck: .startup-check ファイル書き込み
 *   - cleanupBrokenFiles: calendar-data.json.broken.* の7日経過削除
 *   - startPeriodicHealthCheck: 5分ごとの定期ヘルスチェック
 *   - スリープ復帰・ロック解除・AC接続ハンドラ登録
 *
 * ⚠️ ロジック・タイミング・実行順序は main.js から一切変更しない（移動のみ）
 */

const path = require('path');
const fs   = require('fs');

const state = require('./app-state');

// ──────────────────────────────────────────
// パス定義
// ──────────────────────────────────────────

const HEALTH_CHECK_FILE  = path.join(__dirname, '..', '.startup-check');
const LOG_FILE           = path.join(__dirname, '..', 'startup.log');
const CALENDAR_DATA_PATH = path.join(__dirname, '..', 'calendar-data.json');

// ──────────────────────────────────────────
// デバッグモード制御（環境変数 DEBUG_MODE で制御）
// ──────────────────────────────────────────

const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// ──────────────────────────────────────────
// logStartupEvent
// ──────────────────────────────────────────

function logStartupEvent(message) {
  const timestamp  = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logMessage);
    // 本番環境ではconsole.logを無効化（ファイルログのみ）
    if (DEBUG_MODE) {
      console.log('📝 ' + message);
    }
  } catch (e) {
    if (DEBUG_MODE) console.error('ログ記録エラー:', e.message);
  }
}

// ──────────────────────────────────────────
// recordStartupCheck
// ──────────────────────────────────────────

function recordStartupCheck() {
  try {
    fs.writeFileSync(HEALTH_CHECK_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      status:    'healthy',
      pid:       process.pid
    }));
  } catch (e) {
    console.error('ヘルスチェック記録エラー:', e.message);
  }
}

// ──────────────────────────────────────────
// checkPreviousStartup
// ──────────────────────────────────────────

function checkPreviousStartup() {
  try {
    if (fs.existsSync(HEALTH_CHECK_FILE)) {
      const data      = JSON.parse(fs.readFileSync(HEALTH_CHECK_FILE, 'utf-8'));
      const checkTime = new Date(data.timestamp);
      const now       = new Date();
      const diffMs    = now - checkTime;

      // 前回起動から30秒以内に再起動 → クラッシュ検知
      if (diffMs < 30000 && diffMs > 0) {
        console.warn('⚠️ クラッシュ検知: 30秒以内に再起動されました');
        logStartupEvent('⚠️ クラッシュから復帰');
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error('前回起動状態の確認エラー:', e.message);
    return true;
  }
}

// ──────────────────────────────────────────
// cleanupBrokenFiles
// ──────────────────────────────────────────

function cleanupBrokenFiles() {
  try {
    const dir      = path.dirname(CALENDAR_DATA_PATH);
    const baseName = path.basename(CALENDAR_DATA_PATH);
    const files    = fs.readdirSync(dir).filter(f => f.startsWith(baseName + '.broken.'));
    const cutoff   = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7日前
    let removed    = 0;
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch (e) {}
    }
    if (removed > 0) {
      logStartupEvent(`🧹 brokenファイルを${removed}件削除`);
    }
  } catch (e) {
    logStartupEvent('⚠️ brokenファイルクリーンアップ失敗: ' + e.message);
  }
}

// ──────────────────────────────────────────
// startPeriodicHealthCheck（5分ごと）
// ──────────────────────────────────────────

function startPeriodicHealthCheck() {
  state._periodicHealthTimer = setInterval(() => {
    try {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        recordStartupCheck();
      } else {
        console.warn('⚠️ 定期ヘルスチェック: ウィンドウが見つかりません');
      }
    } catch (e) {
      console.error('定期ヘルスチェックエラー:', e.message);
    }
  }, 5 * 60 * 1000); // 5分
}

// ──────────────────────────────────────────
// registerPowerMonitorHandlers
// スリープ復帰・ロック解除・AC接続ハンドラ
// ──────────────────────────────────────────

function registerPowerMonitorHandlers(repairHotZone) {
  const { powerMonitor } = require('electron');

  powerMonitor.on('resume', () => {
    console.log('💤 スリープ復帰を検知 → ホットゾーン修復');
    // ★ 少し待ってから修復（OS側のウィンドウ再配置を待つ）
    setTimeout(() => {
      repairHotZone();
      recordStartupCheck(); // ★ スリープ復帰後の確認

      // ★ アプリが正常に動作しているか確認
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        console.log('✅ スリープ復帰後の確認: アプリ正常稼働');
      } else {
        console.warn('⚠️ スリープ復帰後のアプリ確認: ウィンドウが見つかりません');
      }
    }, 1500);
  });

  // ★ 電源復帰時の確認（スリープ以外）
  powerMonitor.on('on-ac', () => {
    console.log('⚡ AC電源接続を検知');
    recordStartupCheck();
  });

  // ★ スクリーンロック解除時も修復
  powerMonitor.on('unlock-screen', () => {
    console.log('🔓 画面ロック解除を検知 → ホットゾーン修復');
    setTimeout(() => {
      repairHotZone();
      recordStartupCheck(); // ★ ロック解除後の確認
    }, 1000);
  });
}

// ──────────────────────────────────────────
// エクスポート
// ──────────────────────────────────────────

module.exports = {
  logStartupEvent,
  recordStartupCheck,
  checkPreviousStartup,
  cleanupBrokenFiles,
  startPeriodicHealthCheck,
  registerPowerMonitorHandlers,
};
