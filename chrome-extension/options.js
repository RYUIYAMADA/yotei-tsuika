/**
 * options.js — 設定ページのロジック
 *
 * 保存先: chrome.storage.local（APIキー等は chrome.storage で管理。ファイルに書かない）
 */

(async () => {
  const geminiApiKeyEl = document.getElementById('geminiApiKey');
  const gasWebAppUrlEl = document.getElementById('gasWebAppUrl');
  const gasTokenEl     = document.getElementById('gasToken');
  const btnSave        = document.getElementById('btn-save');
  const statusEl       = document.getElementById('status');

  // ── 保存済み値を読み込む ──
  const saved = await chrome.storage.local.get(['geminiApiKey', 'gasWebAppUrl', 'gasToken']);
  if (saved.geminiApiKey) geminiApiKeyEl.value = saved.geminiApiKey;
  if (saved.gasWebAppUrl) gasWebAppUrlEl.value = saved.gasWebAppUrl;
  if (saved.gasToken)     gasTokenEl.value     = saved.gasToken;

  // ── 「初期設定をやり直す」リンク ──
  const btnWelcome = document.getElementById('btn-welcome');
  if (btnWelcome) {
    btnWelcome.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    });
  }

  // ── 保存ボタン ──
  btnSave.addEventListener('click', async () => {
    statusEl.className   = '';
    statusEl.textContent = '';

    const geminiApiKey = geminiApiKeyEl.value.trim();
    const gasWebAppUrl = gasWebAppUrlEl.value.trim();
    const gasToken     = gasTokenEl.value.trim();

    // バリデーション
    if (!geminiApiKey) {
      statusEl.textContent = 'GEMINI_API_KEY を入力してください';
      statusEl.className   = 'error';
      return;
    }
    if (!gasWebAppUrl) {
      statusEl.textContent = 'GAS WebアプリURL を入力してください';
      statusEl.className   = 'error';
      return;
    }
    if (!gasWebAppUrl.startsWith('https://script.google.com/')) {
      statusEl.textContent = 'GAS URLは https://script.google.com/ で始まる必要があります';
      statusEl.className   = 'error';
      return;
    }
    if (!gasToken) {
      statusEl.textContent = 'GAS トークンを入力してください';
      statusEl.className   = 'error';
      return;
    }

    await chrome.storage.local.set({ geminiApiKey, gasWebAppUrl, gasToken });

    statusEl.textContent = '保存しました';
    statusEl.className   = 'ok';
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 3000);
  });
})();
