/**
 * welcome.js — オンボーディングウィザード
 *
 * ステップ管理・入力収集・接続テスト・chrome.storage.local 保存
 * chrome.* が使えない環境（スタンドアロン表示）でもクラッシュしない
 */

'use strict';

// ── ユーティリティ ──────────────────────────────────────────────────────────

/**
 * chrome.storage.local を安全に取得する（ページ外でも落ちない）
 */
function storageGet(keys) {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage.local.get(keys);
  }
  return Promise.resolve({});
}

function storageSet(obj) {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage.local.set(obj);
  }
  return Promise.resolve();
}

// ── DOM 参照 ────────────────────────────────────────────────────────────────

const panels = {
  1: document.getElementById('step-1'),
  2: document.getElementById('step-2'),
  3: document.getElementById('step-3'),
  done: document.getElementById('step-done'),
};

const dots = {
  1: document.getElementById('dot-1'),
  2: document.getElementById('dot-2'),
  3: document.getElementById('dot-3'),
};

const labels = {
  1: document.getElementById('label-1'),
  2: document.getElementById('label-2'),
  3: document.getElementById('label-3'),
};

const inputGemini  = document.getElementById('geminiApiKey');
const inputGasUrl  = document.getElementById('gasWebAppUrl');
const inputGasToken = document.getElementById('gasToken');
const btnNext1  = document.getElementById('btn-next-1');
const btnBack2  = document.getElementById('btn-back-2');
const btnNext2  = document.getElementById('btn-next-2');
const btnBack3  = document.getElementById('btn-back-3');
const btnTest   = document.getElementById('btn-test');
const btnSave   = document.getElementById('btn-save');
const btnClose  = document.getElementById('btn-close');
const testGemini = document.getElementById('test-gemini');
const testGas    = document.getElementById('test-gas');

// ── ステップ切り替え ─────────────────────────────────────────────────────────

let currentStep = 1;

function showStep(step) {
  // パネル切り替え
  Object.values(panels).forEach(el => el && el.classList.remove('active'));
  const target = panels[step];
  if (target) target.classList.add('active');

  // ドット・ラベル更新
  for (let i = 1; i <= 3; i++) {
    const dot = dots[i];
    const lbl = labels[i];
    if (!dot || !lbl) continue;

    dot.classList.remove('active', 'done');
    lbl.classList.remove('active', 'done');

    if (step === 'done') {
      dot.classList.add('done');
      lbl.classList.add('done');
    } else if (i < step) {
      dot.classList.add('done');
      lbl.classList.add('done');
    } else if (i === step) {
      dot.classList.add('active');
      lbl.classList.add('active');
    }
  }

  currentStep = step;
}

// ── バリデーション ───────────────────────────────────────────────────────────

function validateStep1() {
  return inputGemini.value.trim().length > 0;
}

function validateStep2() {
  const url = inputGasUrl.value.trim();
  const tok = inputGasToken.value.trim();
  return url.startsWith('https://script.google.com/') && tok.length > 0;
}

function getStep2Error() {
  const url = inputGasUrl.value.trim();
  const tok = inputGasToken.value.trim();
  if (!url.startsWith('https://script.google.com/')) {
    return 'GAS URL は https://script.google.com/ で始まる必要があります。';
  }
  if (tok.length === 0) {
    return 'GAS トークンを入力してください。';
  }
  return null;
}

// ── テスト結果表示 ───────────────────────────────────────────────────────────

function showTestResult(el, state, msg) {
  // state: 'ok' | 'fail' | 'pending'
  el.className = 'test-result show ' + state;
  el.textContent = msg; // textContent で XSS 防止
}

function clearTestResults() {
  testGemini.className = 'test-result';
  testGemini.textContent = '';
  testGas.className = 'test-result';
  testGas.textContent = '';
  btnSave.disabled = true;
}

// ── Gemini 疎通テスト ─────────────────────────────────────────────────────────

async function testGeminiKey(apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey);
  const body = {
    contents: [{ parts: [{ text: 'テスト' }] }],
    generationConfig: { maxOutputTokens: 16 },
    // thinking を無効化してレスポンスを安定させる
    thinkingConfig: { thinkingBudget: 0 },
  };
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, networkError: true };
  }
  if (res.status !== 200) {
    // 401/403 → キー無効、その他エラーも失敗扱い
    return { ok: false, status: res.status };
  }
  // 200 でも candidates が正常に返っているか確認
  try {
    const json = await res.json();
    if (json.candidates && json.candidates.length > 0) {
      return { ok: true };
    }
    return { ok: false, reason: 'no_candidates' };
  } catch (_) {
    return { ok: false, reason: 'parse_error' };
  }
}

// ── GAS 疎通テスト ────────────────────────────────────────────────────────────

async function testGasEndpoint(gasUrl, gasToken) {
  // action=list に実在するエンドポイントを叩いてトークン認証まで確認する
  const url = gasUrl + '?action=list&token=' + encodeURIComponent(gasToken);
  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (e) {
    return { ok: false, networkError: true };
  }
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  // 200 でも { error: 'unauthorized' } 等が返る場合は失敗扱い
  try {
    const json = await res.json();
    if (json.error) {
      return { ok: false, authError: json.error };
    }
    if (json.success === true) {
      return { ok: true };
    }
    // success フィールドなし・error もなし → 想定外形式は失敗扱い
    return { ok: false, reason: 'unexpected_format' };
  } catch (_) {
    // JSON でない場合（HTML エラーページ等）は失敗
    return { ok: false, reason: 'parse_error' };
  }
}

// ── 接続テスト実行 ────────────────────────────────────────────────────────────

async function runTests() {
  const apiKey  = inputGemini.value.trim();
  const gasUrl  = inputGasUrl.value.trim();
  const gasToken = inputGasToken.value.trim();

  clearTestResults();
  btnTest.disabled = true;

  showTestResult(testGemini, 'pending', '① Gemini API を確認中…');
  showTestResult(testGas,    'pending', '② カレンダー連携（GAS）を確認中…');

  // ── Gemini テスト ──
  let geminiOk = false;
  const rGemini = await testGeminiKey(apiKey);
  if (rGemini.ok) {
    geminiOk = true;
    showTestResult(testGemini, 'ok', '① Gemini API: 接続成功');
  } else if (rGemini.networkError) {
    showTestResult(testGemini, 'fail', '① Gemini API: 通信エラー。ネットワーク接続を確認してください。');
  } else if (rGemini.status === 401 || rGemini.status === 403) {
    showTestResult(testGemini, 'fail', '① Gemini API: キーが無効です。正しい API キーを入力してください。');
  } else if (rGemini.reason === 'no_candidates') {
    showTestResult(testGemini, 'fail', '① Gemini API: 応答を取得できませんでした。API キーを確認してください。');
  } else {
    showTestResult(testGemini, 'fail', '① Gemini API: 接続に失敗しました。API キーを確認してください。');
  }

  // ── GAS テスト ──
  let gasOk = false;
  const rGas = await testGasEndpoint(gasUrl, gasToken);
  if (rGas.ok) {
    gasOk = true;
    showTestResult(testGas, 'ok', '② カレンダー連携（GAS）: 接続成功');
  } else if (rGas.networkError) {
    showTestResult(testGas, 'fail', '② カレンダー連携（GAS）: 通信エラー。GAS の URL を確認してください。');
  } else if (rGas.authError) {
    showTestResult(testGas, 'fail', '② カレンダー連携（GAS）: 認証失敗。トークンが正しくない可能性があります。');
  } else if (rGas.reason === 'parse_error') {
    showTestResult(testGas, 'fail', '② カレンダー連携（GAS）: 応答が不正です。GAS の URL を確認してください。');
  } else if (rGas.reason === 'unexpected_format') {
    showTestResult(testGas, 'fail', '② カレンダー連携（GAS）: 応答形式が不正です。GAS スクリプトを確認してください。');
  } else {
    showTestResult(testGas, 'fail', '② カレンダー連携（GAS）: 応答エラー（HTTP ' + rGas.status + '）。URL またはトークンを確認してください。');
  }

  btnTest.disabled = false;

  // 両方成功なら保存ボタンを有効化
  if (geminiOk && gasOk) {
    btnSave.disabled = false;
  }
}

// ── 保存 ─────────────────────────────────────────────────────────────────────

async function saveSettings() {
  const apiKey   = inputGemini.value.trim();
  const gasUrl   = inputGasUrl.value.trim();
  const gasToken  = inputGasToken.value.trim();

  await storageSet({
    geminiApiKey: apiKey,
    gasWebAppUrl: gasUrl,
    gasToken:     gasToken,
  });

  showStep('done');
}

// ── イベントリスナー ──────────────────────────────────────────────────────────

btnNext1.addEventListener('click', () => {
  if (!validateStep1()) {
    inputGemini.focus();
    return;
  }
  showStep(2);
});

btnBack2.addEventListener('click', () => showStep(1));

btnNext2.addEventListener('click', () => {
  const errMsg = getStep2Error();
  const errEl  = document.getElementById('step2-error');
  if (errMsg) {
    if (!inputGasUrl.value.trim().startsWith('https://script.google.com/')) {
      inputGasUrl.focus();
    } else {
      inputGasToken.focus();
    }
    if (errEl) {
      errEl.textContent = errMsg;
      errEl.classList.remove('hidden');
    }
    return;
  }
  // エラー表示をクリア
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.add('hidden');
  }
  clearTestResults();
  showStep(3);
});

btnBack3.addEventListener('click', () => showStep(2));

btnTest.addEventListener('click', runTests);

btnSave.addEventListener('click', saveSettings);

btnClose.addEventListener('click', () => {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.getCurrent(t => {
      if (t) {
        chrome.tabs.remove(t.id);
      } else if (typeof window !== 'undefined') {
        window.close();
      }
    });
  } else if (typeof window !== 'undefined') {
    window.close();
  }
});

// ── 初期化: 既存の storage 値を入力欄に事前入力 ────────────────────────────

(async () => {
  const cur = await storageGet(['geminiApiKey', 'gasWebAppUrl', 'gasToken']);
  if (cur.geminiApiKey) inputGemini.value  = cur.geminiApiKey;
  if (cur.gasWebAppUrl) inputGasUrl.value  = cur.gasWebAppUrl;
  if (cur.gasToken)     inputGasToken.value = cur.gasToken;
})();
