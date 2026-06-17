/**
 * content.js — 選択テキスト検知 → 「予定を追加」フローティングボタン
 *
 * セキュリティ:
 *   - innerHTML を一切使わない（createElement + textContent のみ）
 *   - 選択テキストを DOM に描かない（ボタンは固定ラベルのみ）
 *   - 秘密情報は持たない
 *   - Shadow DOM でページの CSS と完全隔離
 *
 * フロー:
 *   selectionchange（デバウンス200ms）
 *     → 選択テキスト取得 → 日時ローカル判定
 *     → 日時あり: フローティングボタンを選択範囲下に表示
 *     → ボタンクリック: background に { type: 'add-event-from-selection', text } を送信
 */

(() => {
  'use strict';

  // ── 定数 ──────────────────────────────────────
  const DEBOUNCE_MS = 200;
  const MAX_TEXT_LEN = 2000;
  const BUTTON_LABEL = '予定を追加する';
  const HOST_ID = '__tasks_manager_btn_host__';

  // ── 日付検出 regex ─────────────────────────────
  // ルール: 「月日」または「相対日付語」が含まれる場合のみ true
  // 時刻のみ（15:30・14時・午前）/ 裸の曜日のみ → false
  const DATE_PATTERNS = [
    // 年月日・月日（日本語表記）
    /\d{4}年\d{1,2}月\d{1,2}日/,
    /\d{1,2}月\d{1,2}日/,

    // 数値日付（区切り文字は / か - のみ。時刻の : と混同しない）
    /\d{4}[/\-]\d{1,2}[/\-]\d{1,2}/,
    /(?<!\d)\d{1,2}[/\-]\d{1,2}(?!\d)/,  // M/D・M-D（例: 6/16・7-20）

    // 相対日付語（日付に相当するもの。時刻単独・曜日単独は含まない）
    /今日|本日|明日|あした|明後日|あさって|明々後日/,
    /来週|今週|再来週/,
    /\d{1,2}日後/,
  ];

  /**
   * テキストに「日付」が含まれるか判定（ローカル・Gemini 不使用）
   * - true  : 月日・数値日付・相対日付語がある
   * - false : 時刻のみ / 曜日のみ / 日付なし
   * @param {string} text
   * @returns {boolean}
   */
  function containsDatetime(text) {
    return DATE_PATTERNS.some(re => re.test(text));
  }

  // ── Shadow DOM ホスト & ボタン ─────────────────

  let host = null;
  let shadowRoot = null;
  let button = null;

  function ensureButton() {
    if (host) return;

    host = document.createElement('div');
    host.id = HOST_ID;
    // ホスト自体のスタイルはゼロ（Shadow DOM に全て委ねる）
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; pointer-events: none;';

    shadowRoot = host.attachShadow({ mode: 'closed' });

    // スタイル（Shadow DOM 内に閉じ込め・ページには漏れない）
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap');
      button {
        display: inline-flex;
        align-items: center;
        padding: 8px 16px;
        background: #1a56db;
        color: #ffffff;
        border: none;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(26, 86, 219, 0.35);
        font-family: 'Noto Sans JP', system-ui, -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        pointer-events: auto;
        white-space: nowrap;
        user-select: none;
        transition: background 0.15s, box-shadow 0.15s;
      }
      button:hover {
        background: #1344b8;
        box-shadow: 0 3px 10px rgba(26, 86, 219, 0.45);
      }
      button:active {
        background: #0f379a;
        box-shadow: 0 1px 4px rgba(26, 86, 219, 0.3);
      }
    `;
    shadowRoot.appendChild(style);

    button = document.createElement('button');
    button.type = 'button';
    button.textContent = BUTTON_LABEL;
    button.addEventListener('click', onButtonClick);
    shadowRoot.appendChild(button);

    document.documentElement.appendChild(host);
  }

  function hideButton() {
    if (host) {
      host.style.display = 'none';
    }
  }

  /**
   * ボタンを選択範囲の直下に配置して表示
   * @param {DOMRect} rect - selection の getBoundingClientRect()
   */
  function showButton(rect) {
    ensureButton();

    const GAP = 6; // 選択範囲下端からのオフセット
    let top  = rect.bottom + GAP;
    let left = rect.left;

    // 画面端からはみ出さないよう調整（概算）
    const BW = 160; // ボタン幅の概算（「予定を追加する」13px×7文字＋padding）
    const BH = 30;
    if (left + BW > window.innerWidth) left = window.innerWidth - BW - 8;
    if (left < 0) left = 4;
    if (top + BH > window.innerHeight) top = rect.top - BH - GAP;
    if (top < 0) top = 4;

    host.style.display = '';
    host.style.top  = `${Math.round(top)}px`;
    host.style.left = `${Math.round(left)}px`;
  }

  // ── クリックハンドラ ──────────────────────────

  function onButtonClick(e) {
    e.stopPropagation();
    e.preventDefault();

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    hideButton();

    if (!text || text.length > MAX_TEXT_LEN) return;

    chrome.runtime.sendMessage(
      { type: 'add-event-from-selection', text },
      () => {
        // レスポンス不要。エラーは無視（SW 停止時の例外を抑制）
        void chrome.runtime.lastError;
      }
    );
  }

  // ── 選択検知 ─────────────────────────────────

  let debounceTimer = null;
  let lastText = '';

  function handleSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideButton();
      lastText = '';
      return;
    }

    const text = selection.toString().trim();

    // 空・極端に長い選択は無視
    if (!text || text.length > MAX_TEXT_LEN) {
      hideButton();
      lastText = '';
      return;
    }

    // テキストが変わっていなければ再判定しない
    if (text === lastText) return;
    lastText = text;

    if (!containsDatetime(text)) {
      hideButton();
      return;
    }

    // 選択範囲の位置を取得
    let rect;
    try {
      const range = selection.getRangeAt(0);
      rect = range.getBoundingClientRect();
    } catch (_) {
      hideButton();
      return;
    }

    // rect が画面内に無い場合（スクロールアウト等）は非表示
    if (rect.width === 0 && rect.height === 0) {
      hideButton();
      return;
    }

    showButton(rect);
  }

  function onSelectionChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSelection, DEBOUNCE_MS);
  }

  // ── 非表示トリガー ────────────────────────────

  function onMouseDown(e) {
    // ボタン自身のクリックは除外（onButtonClick で処理）
    if (host && host.contains(e.target)) return;
    hideButton();
    lastText = '';
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      hideButton();
      lastText = '';
    }
  }

  function onScroll() {
    // スクロール中はボタンを隠す（位置がずれるため）
    hideButton();
    lastText = '';
  }

  // ── イベント登録 ─────────────────────────────

  document.addEventListener('selectionchange', onSelectionChange, { passive: true });
  document.addEventListener('mousedown',       onMouseDown,       { passive: true });
  document.addEventListener('keydown',         onKeyDown,         { passive: true });
  window.addEventListener(  'scroll',          onScroll,          { passive: true, capture: true });

})();
