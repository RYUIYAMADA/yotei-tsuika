/**
 * parser-core.gs を評価して parseNaturalLanguageEvent として返すヘルパー
 *
 * Phase 5 後半: nlp-parser.js は parser-core.gs のラッパになったため、
 * テストは直接 parser-core.gs を評価して使用する。
 * renderer の parseNaturalLanguageEvent シグネチャ（text のみ引数）に合わせ、
 * selectedDate / fixedToday を内部で注入する。
 *
 * 使い方:
 *   const { loadParser } = require('./helpers/load-parser');
 *   const { parseNaturalLanguageEvent } = loadParser({ selectedDate, fixedToday });
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadParser({ selectedDate, fixedToday }) {
  const corePath = path.resolve(__dirname, '../../gas/parser-core.gs');
  const src = fs.readFileSync(corePath, 'utf8');

  // formatDate スタブ（selectedDate の初期値として使う）
  function formatDate(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // Date スタブ: fixedToday が指定されていれば new Date() で固定日を返す
  let FixedDate;
  if (fixedToday) {
    const fixed = new Date(fixedToday);
    FixedDate = class extends Date {
      constructor(...args) {
        if (args.length === 0) {
          super(fixed.getTime());
        } else {
          super(...args);
        }
      }
      static now() { return fixed.getTime(); }
    };
  } else {
    FixedDate = Date;
  }

  const context = {
    Date: FixedDate,
    console,
    RegExp,
    Math,
    String,
    parseInt,
    parseFloat,
    Number,
    Array,
    Object,
  };

  const script = new vm.Script(src + '\nmodule.exports = { parseTextCore, clip, pad2 };');
  const mod = { exports: {} };
  const ctxWithModule = Object.assign({ module: mod, exports: mod.exports }, context);
  vm.createContext(ctxWithModule);
  script.runInContext(ctxWithModule);

  const parseTextCore = mod.exports.parseTextCore;

  // renderer 互換シグネチャ: parseNaturalLanguageEvent(text)
  // selectedDate を基準日として注入
  const todayDate = selectedDate ? new Date(selectedDate) : new Date(fixedToday || Date.now());

  function parseNaturalLanguageEvent(text) {
    const result = parseTextCore(text, todayDate);
    // date が未設定なら selectedDate でフォールバック
    if (!result.date) {
      result.date = formatDate(todayDate);
    }
    return result;
  }

  return { parseNaturalLanguageEvent };
}

module.exports = { loadParser };
