/**
 * confirm.js — 確認ポップアップのロジック
 *
 * セキュリティ: innerHTML に外部テキストを入れない。value / textContent のみ使用。
 *
 * フロー:
 *   1. 開いた直後: 「解析中...」を表示（ポップアップは必ず表示される）
 *   2. background に { type: 'parse-text' } を送信 → Gemini 解析
 *   3. 成功: フォームに値をセット
 *   4. 失敗: エラー表示 + 選択テキストを本文欄に入れ手動編集できる状態にする
 */

// ── 色選択の定数（GCalカラーID 1〜11の公式8色） ──
const COLOR_STORAGE_KEY = 'yotei_selected_color_id';
const DEFAULT_COLOR_ID  = '7'; // ピーコック青

(async () => {
  const titleEl       = document.getElementById('title');
  const dateEl        = document.getElementById('date');
  const calendarEl    = document.getElementById('calendar');
  const startTimeEl   = document.getElementById('startTime');
  const endTimeEl     = document.getElementById('endTime');
  const locationEl    = document.getElementById('location');
  const descriptionEl = document.getElementById('description');
  const statusEl      = document.getElementById('status');
  const btnRegister   = document.getElementById('btn-register');
  const btnCancel     = document.getElementById('btn-cancel');

  // ── 色選択 UI の初期化 ──
  const swatches      = Array.from(document.querySelectorAll('.color-swatch'));
  const previewBar    = document.getElementById('color-preview-bar');
  let selectedColorId = DEFAULT_COLOR_ID;

  // 前回の選択色を復元（localStorage）
  try {
    const saved = localStorage.getItem(COLOR_STORAGE_KEY);
    if (saved && swatches.some(s => s.dataset.colorId === saved)) {
      selectedColorId = saved;
    }
  } catch (_) { /* localStorage 使用不可の環境は無視 */ }

  function applyColorSelection(colorId) {
    selectedColorId = colorId;
    swatches.forEach((s, idx) => {
      const isSelected = s.dataset.colorId === colorId;
      s.setAttribute('aria-checked', String(isSelected));
      s.tabIndex = isSelected ? 0 : -1;
    });

    // プレビューバー更新
    const activeSwatch = swatches.find(s => s.dataset.colorId === colorId);
    if (activeSwatch) {
      const hex   = activeSwatch.dataset.colorHex;
      const label = activeSwatch.title;
      previewBar.style.borderLeftColor = hex;
      previewBar.textContent = label;
      previewBar.classList.add('visible');
    }

    // 前回選択を保存
    try { localStorage.setItem(COLOR_STORAGE_KEY, colorId); } catch (_) {}
  }

  // 初期選択を適用
  applyColorSelection(selectedColorId);

  // スウォッチ click ハンドラ
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      applyColorSelection(swatch.dataset.colorId);
    });
  });

  // キーボード操作: radiogroup 的に左右矢印で移動
  document.querySelector('.color-swatches').addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const currentIdx = swatches.findIndex(s => s.dataset.colorId === selectedColorId);
    let nextIdx = e.key === 'ArrowRight'
      ? (currentIdx + 1) % swatches.length
      : (currentIdx - 1 + swatches.length) % swatches.length;
    applyColorSelection(swatches[nextIdx].dataset.colorId);
    swatches[nextIdx].focus();
    e.preventDefault();
  });

  // ── 解析中表示（ポップアップは即座に表示済み）──
  statusEl.className   = '';
  statusEl.textContent = '解析中...';
  btnRegister.disabled = true;

  console.debug('[tasks-manager] confirm.html 起動, parse-text を background へ送信');

  // ── background へ解析依頼 ──
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'parse-text' });
  } catch (e) {
    // SW が起きていない場合など
    console.error('[tasks-manager] parse-text sendMessage 例外:', e.message);
    response = { success: false, error: `通信エラー: ${e.message}` };
  }

  console.debug('[tasks-manager] parse-text レスポンス:', response?.success, response?.error);

  if (response && response.success && response.parsed) {
    // ── 解析成功: フォームに値をセット ──
    const p = response.parsed;
    titleEl.value       = p.title       || '';
    dateEl.value        = p.date        || '';
    calendarEl.value    = p.calendarKey === 'work' ? 'work' : 'personal';
    startTimeEl.value   = p.startTime   || '';
    endTimeEl.value     = p.endTime     || '';
    locationEl.value    = p.location    || '';
    descriptionEl.value = p.description || '';

    statusEl.textContent = '';
    btnRegister.disabled = false;

    // meetUrl は登録時に使うため hidden 属性で保持
    btnRegister.dataset.meetUrl = p.meetUrl || '';
  } else {
    // ── 解析失敗: エラー表示 + 選択テキストを本文欄へ（手動編集可）──
    const errMsg = (response && response.error) ? response.error : '解析に失敗しました';
    statusEl.textContent = `解析エラー: ${errMsg.substring(0, 120)}。手動で入力してください。`;
    statusEl.className   = 'error';

    // 選択テキストを本文欄にセット（originalText があれば）
    if (response && response.originalText) {
      descriptionEl.value = response.originalText;
    }

    btnRegister.disabled = false;
    console.error('[tasks-manager] 解析失敗, 手動入力モードへ:', errMsg);
  }

  // ── 登録処理（共通関数）——Enter キーとボタン click の両方から呼ぶ ──
  async function submitRegistration() {
    // disabled 中（解析中 or 二重送信防止）は何もしない
    if (btnRegister.disabled) return;

    btnRegister.disabled = true;
    statusEl.className   = '';
    statusEl.textContent = '登録中...';

    const eventData = {
      title:       titleEl.value.trim(),
      date:        dateEl.value,
      calendarKey: calendarEl.value,
      startTime:   startTimeEl.value || null,
      endTime:     endTimeEl.value   || null,
      allDay:      !startTimeEl.value,
      location:    locationEl.value.trim(),
      description: descriptionEl.value.trim(),
      meetUrl:     btnRegister.dataset.meetUrl || null,
      colorId:     selectedColorId || null
    };

    if (!eventData.title) {
      statusEl.textContent = 'タイトルを入力してください';
      statusEl.className   = 'error';
      btnRegister.disabled = false;
      return;
    }

    if (!eventData.date) {
      statusEl.textContent = '日付を入力してください';
      statusEl.className   = 'error';
      btnRegister.disabled = false;
      return;
    }

    console.debug('[tasks-manager] register-event 送信:', eventData.title, eventData.date);

    try {
      const res = await chrome.runtime.sendMessage({
        type:      'register-event',
        eventData: eventData
      });

      if (res && res.success) {
        statusEl.textContent = '登録しました！';
        setTimeout(() => window.close(), 1000);
      } else {
        const errMsg = (res && res.error) ? res.error : '登録に失敗しました';
        statusEl.textContent = errMsg.substring(0, 150);
        statusEl.className   = 'error';
        btnRegister.disabled = false;
      }
    } catch (e) {
      console.error('[tasks-manager] register-event 例外:', e.message);
      statusEl.textContent = e.message.substring(0, 150);
      statusEl.className   = 'error';
      btnRegister.disabled = false;
    }
  }

  // ── 登録ボタン ──
  btnRegister.addEventListener('click', submitRegistration);

  // ── Enter キーハンドラ ──
  // textarea: 通常 Enter は改行。Cmd+Enter / Ctrl+Enter で登録。
  // その他 input/select: Enter で登録。
  // IME 変換中（isComposing）は全て無視。
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.isComposing) return; // IME 変換確定の Enter を誤発火させない

    const isTextarea    = e.target.tagName === 'TEXTAREA';
    const isModified    = e.metaKey || e.ctrlKey; // Cmd+Enter / Ctrl+Enter

    if (isTextarea && !isModified) return; // textarea での通常 Enter は改行に任せる

    e.preventDefault();
    submitRegistration();
  });

  // ── キャンセルボタン ──
  btnCancel.addEventListener('click', () => {
    window.close();
  });
})();
