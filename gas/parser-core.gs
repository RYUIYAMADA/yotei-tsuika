/**
 * parser-core.gs — パーサー正本 v2.0（Phase 5 後半: renderer 一本化）
 *
 * 設計原則:
 *   - renderer/nlp-parser.js の parseNaturalLanguageEvent を GAS 互換構文で移植
 *   - GAS 固有 API 禁止（PropertiesService・CalendarApp・UrlFetchApp 等を入れない）
 *   - ESM/require/process.env 禁止（GAS V8 は CommonJS/ESM 非対応）
 *   - 正規表現の lookbehind は GAS V8 で使用可能
 *   - 朝→8時/昼→12時/夕方→17時/夜→19時 変換を統合（GAS 固有仕様を正本に取り込み）
 *
 * 公開関数:
 *   parseTextCore(text, todayDate)
 *     text      : 解析対象テキスト
 *     todayDate : 基準日 Date オブジェクト（省略時は new Date()）
 *     戻り値    : { title, date, startTime, endTime, allDay, calendarKey,
 *                   meetUrl, location, description, _dateFound }
 *                 date は 'YYYY-MM-DD' 文字列
 *                 startTime / endTime は 'HH:MM' 文字列または null
 *
 * LINE.gs との連携:
 *   LINE.gs の parseText() は parseTextCore() を呼び出す薄いアダプタ。
 *   parseWithGemini 等 GAS 固有処理は LINE.gs に残す。
 *
 * renderer との連携:
 *   renderer/nlp-parser.js は parser-core.gs を vm で評価するラッパ。
 *   parseNaturalLanguageEvent としてエクスポートする。
 *
 * 依存:
 *   なし（CFG.WORK_KEYWORDS は内部に持つ。LINE.gs から上書き不要）
 */

// ============================================================
// 仕事キーワード定義
// ============================================================
var PARSER_WORK_KEYWORDS = [
  'ANH', 'ハピネッツ', 'ノーザン', 'myAN', '89ERS', 'ERS', 'バスケ', 'ホームゲーム',
  '会議', 'MTG', 'ミーティング', '打ち合わせ', '打合せ', '商談', '面談', '面接',
  '出張', '大館', '秋田市内', '営業', 'チケット', '集客', 'スポンサー',
  '訪問', '来客', 'クライアント', '提案', '契約', '採用', '審査',
  'プレゼン', '発注', '受注', '納品', '請求', '業務', '報告', '資料',
  '撮影', 'フォト', 'カメラ', '制作', 'デザイン', '入稿', '広告', 'クリエイティブ',
  '研修', 'セミナー', '研修会', '講習会', '説明会', '勉強会', '委員会', '理事会',
  '展示会', '発表会', '表彰式', '総会', 'コンペ',
  '振り返り', 'ふりかえり', 'レトロ', 'キックオフ', 'キック', 'レビュー',
  'スタッフ', '社内'
];

// ============================================================
// メイン解析関数
// ============================================================
function parseTextCore(text, todayDate) {
  var today = todayDate ? new Date(todayDate.getTime()) : new Date();
  today.setHours(0, 0, 0, 0);

  // formatDate ヘルパー
  function formatDate(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // 初期値: 選択日 = today（renderer の selectedDate に相当）
  var date = formatDate(today);
  var startTime = null;
  var endTime = null;
  var allDay = false;
  var calendarKey = 'personal';
  var meetUrl = null;
  var location = '';
  var description = '';

  // ============================================================
  // STEP 1: URL 抽出
  // ============================================================
  var workText = text;
  var urlMatches = workText.match(/https?:\/\/[^\s　\]）)>\n]+/g);
  if (urlMatches) {
    for (var ui = 0; ui < urlMatches.length; ui++) {
      var u = urlMatches[ui];
      if (!meetUrl && /meet\.google\.com|zoom\.us|teams\.microsoft|webex\.com/.test(u)) {
        meetUrl = u;
      }
      workText = workText.replace(u, ' ');
    }
  }

  // ============================================================
  // STEP 2: 構造化フィールド抽出
  // ============================================================
  var structuredTitle = null;
  var subjectMatch = workText.match(/(?:件名|タイトル|題名)\s*[：:]\s*([^\n]+)/);
  if (subjectMatch) {
    structuredTitle = subjectMatch[1].trim();
    var dateInSubject = subjectMatch[1].match(/\d{1,2}[\/月]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日/);
    if (dateInSubject) {
      workText = workText.replace(subjectMatch[0], ' ' + dateInSubject[0] + ' ');
      structuredTitle = structuredTitle.replace(dateInSubject[0], '').trim();
    } else {
      workText = workText.replace(subjectMatch[0], ' ');
    }
  }

  var locFieldMatch = workText.match(/(?:場所|会場|開催地|開催場所|会場名|Location)\s*[：:]\s*([^\n]+)/i);
  if (locFieldMatch) {
    location = locFieldMatch[1].trim();
    workText = workText.replace(locFieldMatch[0], ' ');
  }

  // ============================================================
  // STEP 3: ノイズ除去
  // ============================================================
  var GREETING_LINE_RE = /^(?:お疲れ様?です|お疲れさまです|おつかれ様?|お世話になっ?(?:て|ており)|ご連絡(?:いた)?します|ご案内(?:いた)?します|よろしくお願い(?:いたします)?|以上です|以下の通り(?:ご.*?します)?|下記の通り|以下のとおり|下記のとおり|以下の内容で|各位|関係者各位|担当者各位|ご確認ください|ご参加(?:よろしく)?お願い)/;
  var GREETING_PREFIX_RE = /^(?:お疲れ様?です。?\s*|お疲れさまです。?\s*|おつかれ様?。?\s*|各位\s*|関係者各位\s*)/;
  workText = workText.split('\n').map(function(line) {
    var trimmed = line.trim();
    if (!trimmed) return '';
    if (GREETING_LINE_RE.test(trimmed) && !/[\d月火水木金土日]/.test(trimmed)) return '';
    return line.replace(GREETING_PREFIX_RE, '');
  }).filter(function(l) { return l.trim().length > 0; }).join('\n');

  workText = workText.replace(/【(?:リマインダー|重要|緊急|お知らせ|通知|連絡|INFO|NOTICE|REMINDER|WARNING)】\s*/gi, ' ');
  workText = workText.replace(/[━─═＝=]{3,}/g, ' ');
  workText = workText.replace(/[■□●○◆◇▶▷★☆▼△▲►]/g, ' ');
  workText = workText.replace(/[·•｜|]{1,}/g, ' ');

  workText = workText.replace(/ビデオ通話の?(リンク|URL)\s*[：:]?\s*/g, ' ');
  workText = workText.replace(/Google\s*Meet\s*(に|で)?(参加|接続)?\s*/gi, ' ');
  workText = workText.replace(/(会議|参加用?|招待|接続)\s*(URL|リンク|ID|情報)\s*[：:]?\s*/g, ' ');
  workText = workText.replace(/ミーティング\s*(URL|リンク|ID)\s*[：:]?\s*/g, ' ');
  workText = workText.replace(/この(イベント|予定|招待)は?[^\n]*/g, ' ');
  workText = workText.replace(/(詳細|カレンダー)(を|で)?(表示|確認|開く)[^\n]*/g, ' ');
  workText = workText.replace(/(道順|アクセス|住所|地図|Map)\s*[：:]\s*[^\n]*/gi, ' ');

  workText = workText.replace(/[日会開時場内]\s　\s*[程場催刻所容]\s*[：:・\s]/g, ' ');
  workText = workText.replace(/[（(][月火水木金土日](・?祝)?[）)]/g, ' ');
  workText = workText.replace(/[（(][月火水木金土日]曜日?[）)]/g, ' ');

  // ============================================================
  // STEP 3.5: 前処理
  // ============================================================
  // 全角数字→半角
  workText = workText.replace(/[０-９]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  // 全角コロン→半角
  workText = workText.replace(/：/g, ':');

  // 時間量をプレースホルダに（時刻誤検出防止）
  workText = workText.replace(/(\d+)\s*時間([後おきコース程内半以前の]|$)/g, function(_, n, s) { return '【' + n + 'h' + s + '】'; });
  workText = workText.replace(/(\d+)\s*時間\s*(\d+)\s*分/g, function(_, h, m) { return '【' + h + 'h' + m + 'm】'; });
  workText = workText.replace(/(\d+)\s*(?:名|人|F|f|階|号室|番|本|枚|冊|台|個|円|万|億)/g, function(_, n, s) { return '【n' + n + s + '】'; });

  // 翌日
  workText = workText.replace(/翌(?:日|朝|晩)/g, '明日');

  // ── 朝昼夕夜変換（GAS 固有仕様を統合） ──
  // 数字付き: 「深夜/夜中N時」→「午前N時」
  workText = workText.replace(/(?:深夜|夜中)\s*(\d{1,2})\s*[時:](\d{0,2})(分|半)?\s*まで/g,
    function(m, h, min, s) { return '午前' + h + '時' + (min ? min + '分' : '') + (s || ''); });
  workText = workText.replace(/(?:深夜|夜中)\s*(\d{1,2})\s*[時:]/g, function(m, h) { return '午前' + h + '時'; });
  workText = workText.replace(/夜\s*(\d{1,2})\s*[時:]/g, function(m, h) {
    var hh = parseInt(h);
    var adjusted = (hh >= 1 && hh <= 11) ? hh + 12 : hh;
    return adjusted + '時';
  });

  // 朝方/早朝 + 数字付き
  workText = workText.replace(/(?:朝方?|早朝)\s*(\d{1,2})\s*[時:]/g, function(m, h) { return '午前' + h + '時'; });

  // 「正午」
  workText = workText.replace(/正午/g, '12:00');

  // 昼 + 数字付き
  workText = workText.replace(/(?:昼|お昼)\s*(\d{1,2})\s*[時:]/g, function(m, h) {
    var hh = parseInt(h);
    var adjusted = (hh >= 1 && hh <= 4) ? hh + 12 : hh;
    return m.replace(String(h), String(adjusted));
  });

  // 夕方 + 数字付き
  workText = workText.replace(/夕方\s*(\d{1,2})\s*[時:]/g, function(m, h) {
    var hh = parseInt(h);
    var adjusted = (hh >= 1 && hh <= 9) ? hh + 12 : hh;
    return m.replace(String(h), String(adjusted));
  });

  // 午前中
  workText = workText.replace(/午前中/g, '午前9時');

  // 朝昼夕夜 単独（後ろに数字なし）→ 固定時刻に変換（GAS 固有仕様）
  // 注意: 複合語（朝礼・昼食・夜食等）は変換しない
  // 「朝/昼/夜/夕方」の後がスペース・句読点・行末・ひらがな(か行など)の場合のみ変換
  workText = workText.replace(/朝イチ|朝一番/g, '8時');
  // 朝: 後ろがスペース/句読点/行末/ひらがな(あ～ん)のみ対象。漢字・英数字は除外
  workText = workText.replace(/(?<!\d)朝(?=[\s　、。\n！？]|[あ-ん]|$)/g, '8時');
  // 昼: 後ろがスペース/句読点/行末/ひらがなのみ対象
  workText = workText.replace(/(?<!\d)昼(?=[\s　、。\n！？]|[あ-ん]|$)/g, '12時');
  // 夕方: 後ろに数字なし（既に数字付きは上で処理済み）
  workText = workText.replace(/夕方(?!\s*\d)/g, '17時');
  // 夜・晩: 後ろがスペース/句読点/行末/ひらがなのみ対象
  workText = workText.replace(/(?<!\d)[夜晩](?=[\s　、。\n！？]|[あ-ん]|$)/g, '19時');

  // 残りの 深夜/夜中/朝方/早朝/お昼/夕方 を除去
  workText = workText.replace(/(?:夜|深夜|夜中)\s*/g, ' ');
  workText = workText.replace(/朝方\s*/g, ' ');
  workText = workText.replace(/早朝\s*/g, ' ');
  workText = workText.replace(/お昼\s*/g, ' ');
  workText = workText.replace(/夕方\s*/g, ' ');

  // 「〜まで」時刻
  workText = workText.replace(/から\s*(\d{1,2})\s*[時:](\d{0,2})(分|半)?\s*まで/g, '〜$1:$2$3');
  workText = workText.replace(/(\d{1,2})\s*[時:](\d{0,2})(分|半)?\s*まで/g, function(m, h, min, s) {
    return '〜' + h + ':' + (min || '00') + (s || '');
  });

  // 「N時からN時」→「N:MM〜N:MM」
  workText = workText.replace(/(\d{1,2})\s*[時:](\d{0,2})(分|半)?\s*から\s*(\d{1,2})\s*[時:](\d{0,2})(分|半)?/g,
    function(m, sh, sm, ss, eh, em, es) { return sh + ':' + (sm || '00') + '〜' + eh + ':' + (em || '00'); });

  // 今月・来月展開
  var thisMonth = today.getMonth() + 1;
  workText = workText.replace(/今月\s*(\d{1,2})\s*日/g, thisMonth + '月$1日');
  workText = workText.replace(/今月末/g, thisMonth + '月' + new Date(today.getFullYear(), thisMonth, 0).getDate() + '日');

  var nextMonth = thisMonth === 12 ? 1 : thisMonth + 1;
  var nextMonthYear = thisMonth === 12 ? today.getFullYear() + 1 : today.getFullYear();
  workText = workText.replace(/来月\s*(\d{1,2})\s*日/g, nextMonthYear + '年' + nextMonth + '月$1日');

  // 英語曜日・英語相対日変換
  var enDayMap = { monday:'月曜日', tuesday:'火曜日', wednesday:'水曜日', thursday:'木曜日', friday:'金曜日', saturday:'土曜日', sunday:'日曜日', mon:'月曜日', tue:'火曜日', wed:'水曜日', thu:'木曜日', fri:'金曜日', sat:'土曜日', sun:'日曜日' };
  workText = workText.replace(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi, function(m, next, day) {
    var jp = enDayMap[day.toLowerCase()];
    return next ? '来週' + jp : jp;
  });
  workText = workText.replace(/\btomorrow\b/gi, '明日');
  workText = workText.replace(/\btoday\b/gi, '今日');
  workText = workText.replace(/(\d{1,2})(?::(\d{2}))?\s*(am|AM)/g, function(m, h, min) { return '午前' + h + '時' + (min ? min + '分' : ''); });
  workText = workText.replace(/(\d{1,2})(?::(\d{2}))?\s*(pm|PM)/g, function(m, h, min) { return '午後' + h + '時' + (min ? min + '分' : ''); });

  // 「〜の」除去
  workText = workText.replace(/(明日|明後日|今日|本日|昨日)\s*の\s*/g, '$1 ');
  workText = workText.replace(/(来週|再来週|今週)\s*の\s*/g, '$1');
  workText = workText.replace(/([月火水木金土日]曜日?)\s*の\s*/g, '$1 ');

  // ============================================================
  // STEP 4: 場所抽出
  // ============================================================
  if (!location) {
    var niteMatch = workText.match(/([^\s　、。\n]{2,15})(?:にて|で開催|において)/);
    if (niteMatch && !/会議|ミーティング|打ち合わせ|MTG/.test(niteMatch[1])) {
      location = niteMatch[1].trim();
      workText = workText.replace(niteMatch[0], ' ');
    }
  }
  if (!location) {
    var atMatch = workText.match(/[@＠]\s*([^\s　@＠\n、。！？]{2,20}?)(?=[\s　\n、。！？]|[でにへ][^の0-9Ａ-Ｚa-zA-Z]|から|まで|$)/);
    if (atMatch && !/gmail|google|calendar/.test(atMatch[1])) {
      location = atMatch[1].trim();
      workText = workText.replace(atMatch[0], ' ');
    }
  }
  if (!location) {
    var venueMatch = workText.match(/(?:東京|大阪|京都|神奈川|秋田|宮城|北海道|愛知|福岡)[都道府県]?[^\s　\n]{0,8}(?:センター|アリーナ|ホール|スタジアム|体育館|会館|ビル|タワー|スクエア|プラザ)/);
    if (venueMatch) {
      location = venueMatch[0].trim();
      workText = workText.replace(venueMatch[0], ' ');
    }
  }

  // ============================================================
  // STEP 5: 日付解析
  // ============================================================
  var weekdayMap = { '日':0,'月':1,'火':2,'水':3,'木':4,'金':5,'土':6 };
  var dateFound = false;

  function nextWeekdayDate(targetJsDay) {
    var d = new Date(today.getTime());
    var diff = targetJsDay - d.getDay();
    if (diff < 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function resolveYear(m, d) {
    var y = today.getFullYear();
    var candidate = new Date(y, m - 1, d);
    if (candidate < today) {
      var daysAgo = (today - candidate) / 86400000;
      if (daysAgo > 7) y++;
    }
    return y;
  }

  // 1. 年月日フル
  var fullDateMatch = workText.match(/(\d{4})\s*[年\/\-]\s*(\d{1,2})\s*[月\/\-]\s*(\d{1,2})\s*日?/);
  if (fullDateMatch) {
    date = fullDateMatch[1] + '-' + String(parseInt(fullDateMatch[2])).padStart(2, '0') + '-' + String(parseInt(fullDateMatch[3])).padStart(2, '0');
    workText = workText.replace(fullDateMatch[0], ' ');
    dateFound = true;
  }

  // 2. 相対日付
  if (!dateFound) {
    var relDayMatch = workText.match(/明後日|あさって|明日|あした|今日|きょう|本日/);
    if (relDayMatch) {
      var rd = new Date(today.getTime());
      if (/明後日|あさって/.test(relDayMatch[0])) rd.setDate(rd.getDate() + 2);
      else if (/明日|あした/.test(relDayMatch[0])) rd.setDate(rd.getDate() + 1);
      date = formatDate(rd);
      workText = workText.replace(relDayMatch[0], ' ');
      dateFound = true;
    }
  }

  // 3. 再来週/来週 + 曜日
  if (!dateFound) {
    var relWeekMatch = workText.match(/(再来週|来週)\s*(月|火|水|木|金|土|日)曜?日?/);
    if (relWeekMatch) {
      var weeksOffset = relWeekMatch[1] === '再来週' ? 2 : 1;
      var targetJsDay = weekdayMap[relWeekMatch[2]];
      var rwd = new Date(today.getTime());
      var todayMon = (rwd.getDay() + 6) % 7;
      var targetMon = (targetJsDay + 6) % 7;
      rwd.setDate(rwd.getDate() - todayMon + targetMon + weeksOffset * 7);
      date = formatDate(rwd);
      workText = workText.replace(relWeekMatch[0], ' ');
      dateFound = true;
    }
  }

  // 4. 今週 + 曜日
  if (!dateFound) {
    var thisWeekMatch = workText.match(/今週\s*(月|火|水|木|金|土|日)曜?日?/);
    if (thisWeekMatch) {
      var twTargetJsDay = weekdayMap[thisWeekMatch[1]];
      var twd = new Date(today.getTime());
      var twTodayMon = (twd.getDay() + 6) % 7;
      var twTargetMon = (twTargetJsDay + 6) % 7;
      twd.setDate(twd.getDate() - twTodayMon + twTargetMon);
      date = formatDate(twd);
      workText = workText.replace(thisWeekMatch[0], ' ');
      dateFound = true;
    }
  }

  // 5. 月日のみ
  if (!dateFound) {
    var mdMatch = workText.match(/(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*日?/);
    if (mdMatch) {
      var mdM = parseInt(mdMatch[1]);
      var mdD = parseInt(mdMatch[2]);
      if (mdM >= 1 && mdM <= 12 && mdD >= 1 && mdD <= 31) {
        var mdY = resolveYear(mdM, mdD);
        date = mdY + '-' + String(mdM).padStart(2, '0') + '-' + String(mdD).padStart(2, '0');
        workText = workText.replace(mdMatch[0], ' ');
        dateFound = true;
      }
    }
  }

  // 6. 曜日のみ
  if (!dateFound) {
    var weekdayOnly = workText.match(/(月|火|水|木|金|土|日)曜日?/);
    if (weekdayOnly) {
      var wod = nextWeekdayDate(weekdayMap[weekdayOnly[1]]);
      date = formatDate(wod);
      workText = workText.replace(weekdayOnly[0], ' ');
      dateFound = true;
    }
  }

  // 7. ◯日のみ
  if (!dateFound) {
    var dayOnlyMatch = workText.match(/(\d{1,2})\s*日/);
    if (dayOnlyMatch) {
      var dd = parseInt(dayOnlyMatch[1]);
      if (dd >= 1 && dd <= 31) {
        var dom = today.getMonth();
        var doy = today.getFullYear();
        var doCandidate = new Date(doy, dom, dd);
        if (doCandidate < today) {
          dom++;
          if (dom > 11) { dom = 0; doy++; }
          doCandidate = new Date(doy, dom, dd);
        }
        date = formatDate(doCandidate);
        workText = workText.replace(dayOnlyMatch[0], ' ');
        dateFound = true;
      }
    }
  }

  // ============================================================
  // STEP 6: 時刻解析
  // ============================================================
  function toHHmm(h, mStr, suffix) {
    var min = suffix === '半' ? 30 : (mStr ? parseInt(mStr) || 0 : 0);
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }
  function pmGuess(h) {
    return (h >= 1 && h <= 7) ? h + 12 : h;
  }
  function applyAmPm(h, ampm) {
    var isPM = /午後|PM/i.test(ampm);
    if (isPM && h < 12) return h + 12;
    if (!isPM && h === 12) return 0;
    return h;
  }

  // パターン1: 午前/午後 + 時間範囲
  var ampmRangeMatch = workText.match(/(午前|午後|AM|PM)\s*(\d{1,2})\s*[時:]\s*(\d{0,2})(分|半)?\s*[〜~ー\-～→]\s*(?:(午前|午後|AM|PM)\s*)?(\d{1,2})\s*[時:]?\s*(\d{0,2})(分|半)?/i);
  if (ampmRangeMatch) {
    var arSh = applyAmPm(parseInt(ampmRangeMatch[2]), ampmRangeMatch[1]);
    var arSm = ampmRangeMatch[4] === '半' ? 30 : (parseInt(ampmRangeMatch[3]) || 0);
    var arEndAmPm = ampmRangeMatch[5] || ampmRangeMatch[1];
    var arEh = applyAmPm(parseInt(ampmRangeMatch[6]), arEndAmPm);
    var arEm = ampmRangeMatch[8] === '半' ? 30 : (parseInt(ampmRangeMatch[7]) || 0);
    startTime = String(arSh).padStart(2, '0') + ':' + String(arSm).padStart(2, '0');
    endTime = String(arEh).padStart(2, '0') + ':' + String(arEm).padStart(2, '0');
    workText = workText.replace(ampmRangeMatch[0], ' ');
  }

  // パターン2: 午前/午後 + 単独時刻
  if (!startTime) {
    var ampmMatch = workText.match(/(午前|午後|AM|PM)\s*(\d{1,2})\s*[時:]\s*(\d{0,2})(分|半)?/i);
    if (ampmMatch) {
      var amH = applyAmPm(parseInt(ampmMatch[2]), ampmMatch[1]);
      startTime = toHHmm(amH, ampmMatch[3], ampmMatch[4]);
      endTime = String(Math.min(amH + 1, 23)).padStart(2, '0') + ':' + startTime.slice(3);
      workText = workText.replace(ampmMatch[0], ' ');
    }
  }

  // パターン3: 24h 範囲
  if (!startTime) {
    var rangeMatch = workText.match(/(\d{1,2})\s*[時:]\s*(\d{0,2})(分|半)?\s*[〜~ー\-～→]\s*(\d{1,2})\s*[時:]?\s*(\d{0,2})(分|半)?/);
    if (rangeMatch) {
      var rSh = pmGuess(parseInt(rangeMatch[1]));
      var rSm = rangeMatch[3] === '半' ? 30 : (parseInt(rangeMatch[2]) || 0);
      var rEh = pmGuess(parseInt(rangeMatch[4]));
      var rEm = rangeMatch[6] === '半' ? 30 : (parseInt(rangeMatch[5]) || 0);
      if (rSh <= 23 && rEh <= 23) {
        startTime = String(rSh).padStart(2, '0') + ':' + String(rSm).padStart(2, '0');
        endTime = String(rEh).padStart(2, '0') + ':' + String(rEm).padStart(2, '0');
        workText = workText.replace(rangeMatch[0], ' ');
      }
    }
  }

  // パターン4: 終了時刻のみ
  if (!endTime) {
    var endOnlyMatch = workText.match(/[〜~ー～→]\s*(\d{1,2})\s*[時:](\d{0,2})(分|半)?/);
    if (endOnlyMatch) {
      var eoEh = pmGuess(parseInt(endOnlyMatch[1]));
      var eoEm = endOnlyMatch[3] === '半' ? 30 : (parseInt(endOnlyMatch[2]) || 0);
      endTime = String(eoEh).padStart(2, '0') + ':' + String(eoEm).padStart(2, '0');
      workText = workText.replace(endOnlyMatch[0], ' ');
    }
  }

  // パターン5: 単独時刻
  if (!startTime) {
    var timeMatch = workText.match(/(\d{1,2})\s*[時:](\d{0,2})(分|半)?/);
    if (timeMatch) {
      var tmH = pmGuess(parseInt(timeMatch[1]));
      if (tmH <= 23) {
        startTime = toHHmm(tmH, timeMatch[2], timeMatch[3]);
        if (!endTime) {
          endTime = String(Math.min(tmH + 1, 23)).padStart(2, '0') + ':' + startTime.slice(3);
        }
        workText = workText.replace(timeMatch[0], ' ');
      }
    }
  }

  // パターン6: 「N時終了」
  if (startTime) {
    var endSufixMatch = workText.match(/(\d{1,2})\s*[時:](\d{0,2})(分|半)?\s*(?:終了|迄)/);
    if (endSufixMatch) {
      var esEh = pmGuess(parseInt(endSufixMatch[1]));
      var newEnd = toHHmm(esEh, endSufixMatch[2], endSufixMatch[3]);
      if (newEnd !== startTime) {
        endTime = newEnd;
        workText = workText.replace(endSufixMatch[0], ' ');
      }
    }
  }

  if (!startTime) allDay = true;

  // ============================================================
  // STEP 7: カレンダー振り分け
  // ============================================================
  var textUpper = text.toUpperCase();
  for (var ki = 0; ki < PARSER_WORK_KEYWORDS.length; ki++) {
    if (textUpper.indexOf(PARSER_WORK_KEYWORDS[ki].toUpperCase()) >= 0) {
      calendarKey = 'work';
      break;
    }
  }

  // ============================================================
  // STEP 8: タイトル抽出
  // ============================================================
  var title = '';

  // 8-0: カギ括弧内
  if (!title) {
    var quoteMatch = workText.match(/「([^」]{2,30})」/);
    if (quoteMatch) title = quoteMatch[1].trim();
  }

  // 8-1: 構造化フィールド
  if (!title && structuredTitle) title = structuredTitle;

  // 8-2: イベントサフィックス逆引き
  if (!title) {
    var EVENT_SUFFIXES = [
      'カンファレンス', 'ワークショップ', 'シンポジウム', 'オリエンテーション',
      '養成講習会', '審判講習', '合同練習', '懇親会', '歓迎会', '送別会',
      '忘年会', '新年会', '壮行会', '祝賀会', '表彰式', '開会式', '閉会式',
      '講習会', '研修会', 'セミナー', '練習会', '説明会', '報告会', '発表会',
      '展示会', '選考会', '審査会', '委員会', '理事会', '勉強会', '交流会',
      'フォーラム', 'イベント', '測定会', '反省会', '大会', '試合',
      'ミーティング', '打ち合わせ', '打合せ', '面談', 'MTG',
      '研修', '会議', '検定', '合宿', '遠征', '練習', 'コンペ', '学会', '総会', 'レース'
    ];
    for (var si = 0; si < EVENT_SUFFIXES.length; si++) {
      var sfRe = new RegExp('([^\\s　、。\\n]{1,15}' + EVENT_SUFFIXES[si] + ')');
      var sfM = workText.match(sfRe);
      if (sfM) {
        title = sfM[1].trim();
        break;
      }
    }
  }

  // 8-3: 最初の意味のある行
  if (!title) {
    var lines = workText.split(/[\n。\.]+/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
    for (var li = 0; li < lines.length; li++) {
      var candidate = lines[li]
        .replace(/\d{4}\s*年\s*/g, '')
        .replace(/\d{1,2}\s*[月\/]\s*\d{1,2}\s*日?/g, '')
        .replace(/[（(][月火水木金土日]曜?日?[）)]/g, '')
        .replace(/[〜~\-～→]/g, '')
        .replace(/[\s　]+/g, ' ')
        .trim();
      if (candidate.length >= 2 && !/^[のからにへでをはがも、,\s　]+$/.test(candidate)) {
        title = candidate;
        break;
      }
    }
  }

  // ============================================================
  // STEP 9: タイトル最終クリーンアップ
  // ============================================================
  title = title.replace(/【[^\]】]+】/g, '').trim();
  title = title.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
  title = title
    .replace(/\d{4}\s*年\s*/g, '')
    .replace(/\d{1,2}\s*[月\/]\s*\d{1,2}\s*日?/g, '')
    .replace(/[（(][月火水木金土日]曜?日?[）)]/g, '')
    .replace(/(?:場所|道順|アクセス|住所|地図)\s*[：:][^\n]*/gi, '')
    .replace(/^[のからにへでをはがも、,．\.\s　]+/, '')
    .replace(/(?:があります|をします|いたします|(?:し|で|い)ます|でした|でしょう|でしょうか|をお願いします)\s*$/, '')
    .replace(/[のからにへでをはがも、,．\.\s　]+$/, '')
    .replace(/^[。、・\s　]+/, '')
    .replace(/[。、・\s　]+$/, '')
    .replace(/[（(]\s*[）)]/g, '')
    .replace(/[\s　]+/g, ' ')
    .trim();

  if (!title) {
    title = text.replace(/https?:\/\/[^\s　]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 30) || text;
  }

  // ============================================================
  // STEP 10: 説明文
  // ============================================================
  if (meetUrl) {
    description = 'ビデオ通話: ' + meetUrl;
  }

  return {
    title:      title,
    date:       date,
    startTime:  startTime,
    endTime:    endTime,
    allDay:     allDay,
    calendarKey: calendarKey,
    meetUrl:    meetUrl,
    location:   location,
    description: description,
    _dateFound: dateFound
  };
}

// ============================================================
// ユーティリティ（LINE.gs が参照する可能性があるため残す）
// ============================================================
function clip(text, max) {
  if (!text) return '';
  return text.length <= max ? text : text.substring(0, max) + '...';
}
function pad2(n) {
  return String(n).padStart(2, '0');
}
