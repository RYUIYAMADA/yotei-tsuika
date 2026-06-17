/**
 * main/config.js — 設定読込一元化モジュール
 *
 * 役割:
 *   1. gas-config.json の webAppUrl 読込（キャッシュ + invalidate() つき）
 *   2. process.env.GEMINI_API_KEY の提供
 *   3. app-config.json の読込（デフォルト値フォールバックつき）
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ──────────────────────────────────────────
// パス定義
// ──────────────────────────────────────────

const GAS_CONFIG_PATH = path.join(__dirname, '..', 'gas-config.json');
const APP_CONFIG_PATH = path.join(__dirname, '..', 'app-config.json');

// ──────────────────────────────────────────
// 1. GAS WebApp URL（キャッシュ付き）
// ──────────────────────────────────────────

/** @type {string | null | undefined} undefined = 未読込, null = 未設定 */
let _gasUrlCache = undefined;

/**
 * GAS WebApp URL を返す。
 * キャッシュ済みの場合はディスクを読まない。
 * @returns {string | null}
 */
function getGasWebAppUrl() {
  if (_gasUrlCache !== undefined) return _gasUrlCache;
  try {
    if (fs.existsSync(GAS_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(GAS_CONFIG_PATH, 'utf-8'));
      _gasUrlCache = cfg.webAppUrl || null;
    } else {
      _gasUrlCache = null;
    }
  } catch (e) {
    _gasUrlCache = null;
  }
  return _gasUrlCache;
}

/**
 * GAS URL キャッシュを破棄する。
 * save-gas-config IPC ハンドラが保存直後に呼ぶことで
 * 再起動なしに新 URL が次のリクエストから使われる。
 * @param {string | null} [newUrl] 既知の新 URL を直接セットする場合は渡す
 */
function invalidateGasUrl(newUrl) {
  if (newUrl !== undefined) {
    _gasUrlCache = newUrl;
  } else {
    _gasUrlCache = undefined;
  }
}

// ──────────────────────────────────────────
// 2. Gemini API Key
// ──────────────────────────────────────────

/**
 * GEMINI_API_KEY を返す（process.env 経由）。
 * .env の読込は main.js 側の require('dotenv').config() が担う。
 * @returns {string | undefined}
 */
function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY;
}

// ──────────────────────────────────────────
// P6-2: GAS API Token（オプトイン認証）
// ──────────────────────────────────────────

/**
 * GAS_API_TOKEN を返す（process.env 経由）。
 * 値が存在する場合、GAS への全リクエストに &token= が付与される。
 * 未設定（undefined / 空文字）の場合は現状どおりトークンなしで動作する。
 * @returns {string | undefined}
 */
function getGasApiToken() {
  const t = process.env.GAS_API_TOKEN;
  return (t && t.trim()) ? t.trim() : undefined;
}

// ──────────────────────────────────────────
// 3. app-config.json（ハードコード値の一元管理）
// ──────────────────────────────────────────

/**
 * デフォルト設定値。
 * app-config.json が存在しない・読み込み失敗時はこの値を使う。
 * これにより現状と同一挙動が保証される。
 */
const APP_CONFIG_DEFAULTS = {
  gemini: {
    model:           'gemini-2.5-flash',
    maxOutputTokens: 2048,
    timeoutMs:       15000,
  },
  ollama: {
    url:   'http://localhost:11434',
    model: 'qwen2.5:3b',
  },
  excludedApps: ['Lightroom', 'Capture One', 'Illustrator'],
};

/** @type {object | null} null = 未読込 */
let _appConfigCache = null;

/**
 * app-config.json をマージしたコンフィグを返す。
 * ファイルが無ければデフォルト値をそのまま返す。
 * @returns {typeof APP_CONFIG_DEFAULTS}
 */
function getAppConfig() {
  if (_appConfigCache) return _appConfigCache;
  let fileConfig = {};
  try {
    if (fs.existsSync(APP_CONFIG_PATH)) {
      fileConfig = JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('[config] app-config.json 読込失敗（デフォルト使用）:', e.message);
  }

  // 浅いマージ（セクション単位）
  _appConfigCache = {
    gemini: Object.assign({}, APP_CONFIG_DEFAULTS.gemini,  fileConfig.gemini  || {}),
    ollama: Object.assign({}, APP_CONFIG_DEFAULTS.ollama,  fileConfig.ollama  || {}),
    excludedApps: Array.isArray(fileConfig.excludedApps)
      ? fileConfig.excludedApps
      : APP_CONFIG_DEFAULTS.excludedApps,
  };
  return _appConfigCache;
}

/**
 * app-config キャッシュを破棄する（テスト用途・設定変更時）。
 */
function invalidateAppConfig() {
  _appConfigCache = null;
}

// ──────────────────────────────────────────
// エクスポート
// ──────────────────────────────────────────

module.exports = {
  getGasWebAppUrl,
  invalidateGasUrl,
  getGeminiApiKey,
  getGasApiToken,
  getAppConfig,
  invalidateAppConfig,
  // パス公開（main.js が GAS_WEB_APP_URL_PATH として使っていた箇所の置換用）
  GAS_CONFIG_PATH,
};
