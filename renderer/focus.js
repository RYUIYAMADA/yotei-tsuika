// ★ フォーカスモード — 選択中タスクに集中するUI
let focusActive = false;
let timerInterval = null;
let timerSeconds = 25 * 60;

/** フォーカスモード初期化 */
export function initFocusMode() {
  // ボタンをタイトルバーに追加
  const titleButtons = document.querySelector('.titlebar-buttons');
  if (!titleButtons) return;
  const btn = document.createElement('button');
  btn.id = 'btn-focus';
  btn.title = 'フォーカスモード';
  btn.textContent = '◎';
  titleButtons.insertBefore(btn, titleButtons.firstChild);

  btn.addEventListener('click', toggleFocus);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && focusActive) exitFocus();
  });
}

function toggleFocus() {
  focusActive ? exitFocus() : enterFocus();
}

function enterFocus() {
  // 選択中のタスクを探す（最初の未完了タスク、またはhoverされているもの）
  const tasks = document.querySelectorAll('.task-item:not(.completed)');
  if (tasks.length === 0) return;

  // 最初の「今日中」タスク、なければ最初の未完了タスク
  const todayZone = document.querySelector('.task-drop-zone[data-priority="today"]');
  const targetTask = todayZone?.querySelector('.task-item:not(.completed)') || tasks[0];
  if (!targetTask) return;

  focusActive = true;
  document.body.classList.add('focus-mode');
  document.getElementById('btn-focus')?.classList.add('active');

  // オーバーレイ作成
  const overlay = document.createElement('div');
  overlay.id = 'focus-overlay';
  overlay.innerHTML = `
    <div class="focus-card">
      <div class="focus-task-name">${targetTask.querySelector('.task-name')?.textContent || ''}</div>
      <div class="focus-timer" id="focus-timer">
        <span id="focus-timer-display">25:00</span>
        <div class="focus-timer-controls">
          <button id="focus-timer-toggle" class="focus-btn">開始</button>
          <button id="focus-timer-reset" class="focus-btn focus-btn-secondary">リセット</button>
        </div>
      </div>
      <div class="focus-hint">Escで終了</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // タイマー制御
  timerSeconds = 25 * 60;
  const display = document.getElementById('focus-timer-display');
  const toggleBtn = document.getElementById('focus-timer-toggle');
  const resetBtn = document.getElementById('focus-timer-reset');

  toggleBtn.addEventListener('click', () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
      toggleBtn.textContent = '開始';
    } else {
      timerInterval = setInterval(() => {
        timerSeconds--;
        if (timerSeconds <= 0) {
          clearInterval(timerInterval);
          timerInterval = null;
          timerSeconds = 0;
          toggleBtn.textContent = '完了';
          display.textContent = '00:00';
          display.classList.add('timer-done');
          return;
        }
        const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
        const s = (timerSeconds % 60).toString().padStart(2, '0');
        display.textContent = `${m}:${s}`;
      }, 1000);
      toggleBtn.textContent = '停止';
    }
  });

  resetBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    timerInterval = null;
    timerSeconds = 25 * 60;
    display.textContent = '25:00';
    display.classList.remove('timer-done');
    toggleBtn.textContent = '開始';
  });
}

function exitFocus() {
  focusActive = false;
  document.body.classList.remove('focus-mode');
  document.getElementById('btn-focus')?.classList.remove('active');
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById('focus-overlay')?.remove();
}
