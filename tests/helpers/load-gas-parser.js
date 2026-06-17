/**
 * parser-core.gs + LINE.gs parseText アダプタを Node.js 環境で動かすヘルパー
 *
 * Phase 5 後半: parser-parity.test.js の「真のパリティテスト」用。
 * parseText() = parseTextCore() を呼び出して LINE.gs 形式に詰め替えたもの。
 *
 * 返す parseText の戻り値スキーマ（LINE.gs アダプタ仕様）:
 *   { title, hasDateTime, date(Date|null), startTime({h,m}|null), endTime({h,m}|null),
 *     allDay, calendarKey, location, meetUrl, description, _dateError }
 *
 * 使い方:
 *   const { loadGasParser } = require('./helpers/load-gas-parser');
 *   const { parseText } = loadGasParser({ fixedToday: '2026-04-08T10:00:00' });
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// LINE.gs の parseText アダプタロジック（GAS 固有 API 除去版）
// parser-core.gs の parseTextCore を呼んで { h, m } / Date に変換する。
const GAS_ADAPTER_SRC = `
function parseText(text) {
  var coreResult = parseTextCore(text);

  var dateObj = null;
  if (coreResult.date) {
    var parts = coreResult.date.split('-');
    if (parts.length === 3) {
      dateObj = new Date(
        parseInt(parts[0]),
        parseInt(parts[1]) - 1,
        parseInt(parts[2])
      );
    }
  }

  var startTimeObj = null;
  if (coreResult.startTime) {
    var sp = coreResult.startTime.split(':');
    startTimeObj = { h: parseInt(sp[0]), m: parseInt(sp[1] || '0') };
  }

  var endTimeObj = null;
  if (coreResult.endTime) {
    var ep = coreResult.endTime.split(':');
    endTimeObj = { h: parseInt(ep[0]), m: parseInt(ep[1] || '0') };
  }

  return {
    title:       coreResult.title,
    hasDateTime: coreResult._dateFound || !coreResult.allDay,
    date:        dateObj,
    startTime:   startTimeObj,
    endTime:     endTimeObj,
    allDay:      coreResult.allDay,
    calendarKey: coreResult.calendarKey,
    location:    coreResult.location || '',
    meetUrl:     coreResult.meetUrl  || null,
    description: coreResult.description || text,
    _dateError:  coreResult._dateError || null
  };
}
`;

function loadGasParser({ fixedToday } = {}) {
  const corePath = path.resolve(__dirname, '../../gas/parser-core.gs');
  const coreSrc = fs.readFileSync(corePath, 'utf8');

  // Date スタブ
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

  // parser-core.gs + アダプタを結合して評価
  const combinedSrc = coreSrc + '\n' + GAS_ADAPTER_SRC + '\nmodule.exports = { parseText };';
  const script = new vm.Script(combinedSrc);
  const mod = { exports: {} };
  const ctxWithModule = Object.assign({ module: mod, exports: mod.exports }, context);
  vm.createContext(ctxWithModule);
  script.runInContext(ctxWithModule);

  return mod.exports;
}

module.exports = { loadGasParser };
