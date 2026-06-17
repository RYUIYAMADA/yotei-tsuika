#!/usr/bin/env node
/**
 * add-event.mjs — macOS クイックアクション用 CLI
 *
 * 使い方:
 *   node add-event.mjs "<テキスト>"          # 通常実行（確認ダイアログ→登録）
 *   node add-event.mjs --dry-run "<テキスト>" # 解析のみ (stdout)
 *   node add-event.mjs --no-confirm "<テキスト>" # 確認スキップ→即登録
 *   echo "<テキスト>" | node add-event.mjs    # stdin 入力
 *
 * 秘密: ../chrome-extension/config.defaults.local.json 再利用
 */

import { createRequire } from 'module';
import { readFileSync }  from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawnSync }     from 'child_process';

// __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dir      = dirname(__filename);

// parser / gas-client を chrome-extension から直接 import（再利用）
const { parseWithGemini }      = await import('../chrome-extension/lib/parser.js');
const { createCalendarEvent }  = await import('../chrome-extension/lib/gas-client.js');

// ──────────────────────────────────────────
// 引数パース
// ──────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const NO_CONFIRM = args.includes('--no-confirm');
if (NO_CONFIRM) console.warn('[no-confirm] 確認なしで登録します');

// テキスト取得: フラグ除去後の最初の引数 or stdin
const positional = args.filter(a => !a.startsWith('--'));
let inputText = positional.join(' ').trim();

if (!inputText) {
  // stdin から読む（クイックアクション stdin 渡し対応）
  try {
    inputText = readFileSync('/dev/stdin', 'utf8').trim();
  } catch (_) {
    inputText = '';
  }
}

// ──────────────────────────────────────────
// osascript ヘルパー（argv 渡し・文字列補間ゼロ）
// ──────────────────────────────────────────

/**
 * 静的 AppleScript を argv 経由で実行する。
 * -e に入るのは可変値を含まない固定スクリプトのみ。
 * 可変値は argv（配列の 3 番目以降）として渡す → インジェクション不可。
 *
 * @param {string} script  - 可変値を含まない静的 AppleScript
 * @param {string[]} argv  - AppleScript 内で item N of argv として参照する値
 * @returns {{ stdout: string, status: number, error?: Error }}
 */
function runAppleScript(script, argv = []) {
  const result = spawnSync(
    'osascript',
    ['-e', script, ...argv],  // shell:false がデフォルト（シェル展開なし）
    { encoding: 'utf8' }
  );
  return result;
}

// 通知: 可変値は argv[0]=message, argv[1]=title として渡す
const NOTIFY_SCRIPT = `
on run argv
  display notification (item 1 of argv) with title (item 2 of argv) sound name "Glass"
end run
`.trim();

function notify(title, message) {
  try {
    runAppleScript(NOTIFY_SCRIPT, [message, title]);
  } catch (_) { /* 通知失敗は無視 */ }
}

// エラーダイアログ: 可変値は argv[0]=message として渡す
const ALERT_SCRIPT = `
on run argv
  display dialog (item 1 of argv) buttons {"閉じる"} default button "閉じる" with icon stop
end run
`.trim();

function alertError(message) {
  const r = runAppleScript(ALERT_SCRIPT, [message]);
  if (r.error || r.status !== 0) {
    console.error(message);
  }
}

// ──────────────────────────────────────────
// 設定読込
// ──────────────────────────────────────────
const CONFIG_PATH = resolve(__dir, '../chrome-extension/config.defaults.local.json');
let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  alertError(`設定ファイルが見つかりません。\n${CONFIG_PATH}\n\nChrome拡張の設定を先に完了してください。`);
  process.exit(1);
}
const { geminiApiKey, gasWebAppUrl, gasToken } = config;

if (!geminiApiKey) {
  alertError('config.defaults.local.json に geminiApiKey が設定されていません。');
  process.exit(1);
}
if (!gasWebAppUrl) {
  alertError('config.defaults.local.json に gasWebAppUrl が設定されていません。');
  process.exit(1);
}

// ──────────────────────────────────────────
// 入力チェック
// ──────────────────────────────────────────
if (!inputText) {
  alertError('テキストが選択されていません。\n\nテキストを選択してからクイックアクションを実行してください。');
  process.exit(1);
}

// ──────────────────────────────────────────
// Gemini 解析
// ──────────────────────────────────────────
const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD（ローカル時刻）

let parsed;
try {
  const result = await parseWithGemini(inputText, geminiApiKey, today);
  if (!result.success) throw new Error(result.error || '解析失敗');
  parsed = result.parsed;
} catch (e) {
  const isJsonError = e.message && (e.message.includes('JSON') || e.message.includes('json'));
  const msg = isJsonError
    ? 'Geminiが解析結果(JSON)を返せませんでした。文章を変えて再試行してください。'
    : `Gemini 解析に失敗しました。\n\n${e.message}`;
  alertError(msg);
  process.exit(1);
}

// --dry-run: 結果を stdout に出力してで終了
if (DRY_RUN) {
  console.log(JSON.stringify(parsed, null, 2));
  process.exit(0);
}

// ──────────────────────────────────────────
// 確認ダイアログ（タイトルのみ編集可・argv 渡し）
// ──────────────────────────────────────────

// 静的 AppleScript: 可変値なし。argv[0]=ダイアログ本文, argv[1]=デフォルトタイトル
const DIALOG_SCRIPT = `
on run argv
  set dlgText to item 1 of argv
  set dlgDefault to item 2 of argv
  display dialog dlgText default answer dlgDefault buttons {"キャンセル", "登録"} default button "登録" with title "予定を追加"
  return (button returned of result) & "¶" & (text returned of result)
end run
`.trim();

let finalTitle = parsed.title;

if (!NO_CONFIRM) {
  // サマリー組み立て（Node.js 側で文字列を組み立てるのは安全。osascript に渡す前に argv に分離）
  const calLabel = parsed.calendarKey === 'work' ? '仕事' : '個人';
  const timeStr  = parsed.allDay
    ? '終日'
    : `${parsed.startTime ?? ''}〜${parsed.endTime ?? ''}`;
  const locStr   = parsed.location ? `\n場所: ${parsed.location}` : '';
  const meetStr  = parsed.meetUrl  ? '\nMeet/Zoom: あり'          : '';
  const descPrev = parsed.description
    ? `\n概要: ${parsed.description.slice(0, 60)}${parsed.description.length > 60 ? '…' : ''}`
    : '';

  const dlgText =
    `以下の予定を登録しますか？\n\nタイトル（編集可）:\n\n` +
    `日付: ${parsed.date}\n` +
    `時刻: ${timeStr}\n` +
    `カレンダー: ${calLabel}${locStr}${meetStr}${descPrev}`;

  // argv[0] = ダイアログ本文, argv[1] = デフォルトタイトル（どちらも -e には入らない）
  const r = runAppleScript(DIALOG_SCRIPT, [dlgText, parsed.title]);

  if (r.status !== 0 || r.error) {
    // キャンセルボタン or ESC → osascript が非ゼロ終了 or -128 エラー
    const stderr = r.stderr || '';
    if (
      r.status === 1 ||
      stderr.includes('-128') ||
      stderr.includes('User canceled') ||
      stderr.includes('cancel')
    ) {
      process.exit(0); // キャンセル: 無言終了
    }
    alertError(`ダイアログエラー:\n${stderr}`);
    process.exit(1);
  }

  // stdout = "button¶text" 形式（AppleScript で "¶" を区切り文字に使用）
  const stdout = (r.stdout || '').trim();
  const sepIdx = stdout.lastIndexOf('¶');
  const btn    = sepIdx >= 0 ? stdout.slice(0, sepIdx).trim()  : '';
  const text   = sepIdx >= 0 ? stdout.slice(sepIdx + 1).trim() : parsed.title;

  if (btn !== '登録') {
    process.exit(0); // キャンセル
  }

  finalTitle = text || parsed.title;
}

// ──────────────────────────────────────────
// GAS 登録
// ──────────────────────────────────────────
const eventData = { ...parsed, title: finalTitle };

try {
  const result = await createCalendarEvent(eventData, gasWebAppUrl, gasToken);
  if (result.success === true) {
    notify('予定を登録しました', `${finalTitle}（${parsed.date}）`);
  } else {
    const errMsg = result.error || JSON.stringify(result);
    alertError(`GAS 登録エラー:\n${errMsg}`);
    process.exit(1);
  }
} catch (e) {
  alertError(`カレンダー登録に失敗しました。\n\n${e.message}`);
  process.exit(1);
}
