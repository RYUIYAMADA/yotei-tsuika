// nlp-parser.js — renderer ラッパ（Phase 5 後半: parser-core.gs 正本化）
//
// gas/parser-core.gs を vm で評価してエクスポートする薄いラッパ。
// calendar-register.js・ollama.js からの呼び出しシグネチャは変わらない。
//
// 設計:
//   - parser-core.gs は GAS 互換構文（var/function 宣言のみ）
//   - vm で評価後 parseTextCore を取り出し、renderer 用シグネチャにアダプト
//   - selectedDate（サイドバーで選択中の日付）を today の初期値として注入

import { formatDate } from './utils.js';
import { selectedDate } from './state.js';

// Node.js (Electron renderer) 環境での vm/fs 利用
// ※ preload 経由の contextBridge でも動くよう try/require で包む
let _parseCore = null;

function loadParseCore() {
  if (_parseCore) return _parseCore;
  try {
    // Electron renderer プロセスは Node integration が有効
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');

    // __dirname は renderer/ ディレクトリ
    const corePath = path.resolve(__dirname, '../gas/parser-core.gs');
    const src = fs.readFileSync(corePath, 'utf8');

    // GAS 非互換: String.prototype.padStart はブラウザ/Node で利用可能
    const context = {
      console,
      RegExp,
      Math,
      String,
      parseInt,
      parseFloat,
      Number,
      Array,
      Object,
      Date,
    };

    const script = new vm.Script(src + '\nmodule.exports = { parseTextCore, clip, pad2 };');
    const mod = { exports: {} };
    const ctxWithModule = Object.assign({ module: mod, exports: mod.exports }, context);
    vm.createContext(ctxWithModule);
    script.runInContext(ctxWithModule);

    _parseCore = mod.exports.parseTextCore;
    return _parseCore;
  } catch (e) {
    console.error('[nlp-parser] parser-core.gs のロードに失敗しました:', e);
    return null;
  }
}

export function parseNaturalLanguageEvent(text) {
  const parseCore = loadParseCore();

  // parser-core.gs が使えない場合のフォールバック（空結果）
  if (!parseCore) {
    const today = new Date();
    const d = selectedDate || today;
    return {
      title: text.slice(0, 30) || text,
      date: formatDate(d),
      startTime: null,
      endTime: null,
      allDay: true,
      calendarKey: 'personal',
      meetUrl: null,
      location: '',
      description: '',
      _dateFound: false,
    };
  }

  // 基準日: サイドバーで選択中の日付（未指定時は今日）
  const todayDate = selectedDate ? new Date(selectedDate) : new Date();

  const result = parseCore(text, todayDate);

  // date フィールドが未設定の場合は selectedDate をフォールバック
  if (!result.date) {
    result.date = formatDate(todayDate);
  }

  return result;
}
