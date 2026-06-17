/**
 * main/constants.js — メインプロセス定数
 *
 * ⚠️ macOS実機調整値・変更禁止
 * 各タイミング値はmacOS上での実機動作を計測して調整した値です。
 * 変更するとスライドアニメーションの二段階停止・ホットゾーン誤反応が再発します。
 */

'use strict';

// ──────────────────────────────────────────
// ウィンドウ・ホットゾーン寸法
// ──────────────────────────────────────────

/** サイドバーウィンドウ幅(px) — macOS実機調整値・変更禁止 */
const WINDOW_WIDTH = 324;

/** ホットゾーンウィンドウ幅(px) — macOS実機調整値・変更禁止 */
const HOT_ZONE_WIDTH = 6;

/** ウィンドウ不透明度 — macOS実機調整値・変更禁止 */
const WINDOW_OPACITY = 0.97;

// ──────────────────────────────────────────
// スライドアニメーションタイミング
// ──────────────────────────────────────────

/** スライドイン時間(ms): 115%高速化（210→100ms）— macOS実機調整値・変更禁止 */
const SLIDE_IN_DURATION = 100;

/** スライドアウト時間(ms): 高速・スムーズ — macOS実機調整値・変更禁止 */
const SLIDE_OUT_DURATION = 150;

/** スライドステップ数: ステップ削減（二段階停止防止）— macOS実機調整値・変更禁止 */
const SLIDE_STEPS = 10;

/** スライド後クールダウン(ms): 0.3秒で再反応可能 — macOS実機調整値・変更禁止 */
const SLIDE_COOLDOWN = 300;

// ──────────────────────────────────────────
// ホットゾーン余白（macOS通知・ホットコーナー回避）
// ──────────────────────────────────────────

/** 上部余白(px): メニューバー+通知回避（最小限に縮小して反応エリアを拡大）— macOS実機調整値・変更禁止 */
const HOT_ZONE_TOP_MARGIN = 100;

/** 下部余白(px): Dockアイコンゾーン分 — macOS実機調整値・変更禁止 */
const HOT_ZONE_BOTTOM_MARGIN = 70;

// ──────────────────────────────────────────
// グレースピリオド
// ──────────────────────────────────────────

/**
 * show開始から mouseleave を無視する期間(ms)
 * アニメーション100ms + 侵入猶予300ms — macOS実機調整値・変更禁止
 */
const SHOW_GRACE_PERIOD = 400;

module.exports = {
  WINDOW_WIDTH,
  HOT_ZONE_WIDTH,
  WINDOW_OPACITY,
  SLIDE_IN_DURATION,
  SLIDE_OUT_DURATION,
  SLIDE_STEPS,
  SLIDE_COOLDOWN,
  HOT_ZONE_TOP_MARGIN,
  HOT_ZONE_BOTTOM_MARGIN,
  SHOW_GRACE_PERIOD,
};
