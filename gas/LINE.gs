/**
 * LINE Bot — タスク・予定管理（完全リライト版）
 *
 * ★ 設計原則
 *   1. doPost は必ず200を返す（LINEのリトライ防止）
 *   2. 全処理を try-catch で包み、失敗時もLINEに返信する
 *   3. reply() は必ず1回呼ぶ（replyToken は30秒で失効するため最優先）
 *   4. 長い処理（OCR・URL取得）は reply() で「処理中」を先送りし、結果は push()
 *
 * ★ デプロイ後チェックリスト
 *   [ ] GASエディタ → サービスを追加 → Drive API（v2）を有効化（OCR機能に必須）
 *   [ ] GASエディタ → プロジェクトの設定 → スクリプトプロパティ → LINE_TOKEN を登録
 *   [ ] GASエディタ → デプロイ → 新しいデプロイ → ウェブアプリ（全員アクセス可）
 *   [ ] 発行されたURLをコピー
 *   [ ] LINE Developers → Messaging API設定 → Webhook URL に貼り付け
 *   [ ] 「検証」ボタンで Success を確認
 *   [ ] 「Webhookの利用」を ON にする
 *   [ ] 応答メッセージは OFF にする（Botと競合するため）
 *
 * ★ 朝7時配信のトリガー設定
 *   GASエディタ → トリガー → 追加 → runMorningDigest → 時間ベース → 日タイマー → 7時〜8時
 *   ※ タイムゾーンをプロジェクト設定で Asia/Tokyo にすること
 */

// ============================================================
// 設定（ここだけ編集する）
// ============================================================
var CFG = {
  // ⚠️ 以下はすべてスクリプトプロパティに保存する（GASエディタ → プロジェクトの設定 → スクリプトプロパティ）
  // 必要なキー: LINE_TOKEN / GEMINI_KEY / SHEET_ID / CAL_PERSONAL / CAL_WORK / CAL_ROWING / CAL_HAPPINETS
  LINE_TOKEN: PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || '',

  SHEET_ID:   PropertiesService.getScriptProperties().getProperty('SHEET_ID') || 'YOUR_SHEET_ID',
  SHEET_NAME: 'タスク',

  CAL: {
    personal:  PropertiesService.getScriptProperties().getProperty('CAL_PERSONAL')  || 'YOUR_PERSONAL_CALENDAR_ID@group.calendar.google.com',
    work:      PropertiesService.getScriptProperties().getProperty('CAL_WORK')      || 'YOUR_WORK_CALENDAR_ID@group.calendar.google.com',
    rowing:    PropertiesService.getScriptProperties().getProperty('CAL_ROWING')    || 'YOUR_ROWING_CALENDAR_ID@group.calendar.google.com',
    happinets: PropertiesService.getScriptProperties().getProperty('CAL_HAPPINETS') || 'YOUR_HAPPINETS_CALENDAR_ID@import.calendar.google.com'
  },
  CAL_NAME: {
    personal:  'メイン',
    work:      '仕事',
    rowing:    'ボート',
    happinets: 'ハピネッツ試合日程'
  },

  // Gemini APIキー（スクリプトプロパティから取得）
  GEMINI_KEY: PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '',

  // 仕事カレンダーに自動振り分けするキーワード
  WORK_KEYWORDS: ['ANH','ハピネッツ','会議','MTG','ミーティング','チケット',
                  '集客','大館','営業','商談','出張','業務','報告','資料',
                  '研修','myAN','社内','納品','請求','ami','撮影'],

  AKITA_LAT: 39.72,
  AKITA_LON: 140.13
};

// PropertiesService キー名
var PKEY = {
  MORNING:  'MORNING_USER_ID',
  PENDING:  'PEND_',  // + userId
  DEDUP:    'DEDUP_'  // + messageId
};

// ============================================================
// エントリポイント（Webhook受信）
// ============================================================
function doPost(e) {
  // GASは必ず200を返す。ここで return しても LINE には届かない
  var output = ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);

  // 同時実行の競合（二重登録）を防ぐ
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return output; }

  // ★ P6-2b: ALLOWED_USER_ID フィルタ（未設定なら素通し）
  var allowedUserId = PropertiesService.getScriptProperties().getProperty('ALLOWED_USER_ID') || '';

  try {
    if (!e || !e.postData) return output;
    var body   = JSON.parse(e.postData.contents);

    // ── Electron → GAS POST: createEvent アクション（LINE Webhook とは別ルート）──
    if (body.action === 'createEvent') {
      // APIトークン認証（doGet と同じキーを共用）
      // 【意図的な設計】API_TOKEN 未設定時も含め、常に認証必須（fail-closed）。
      // API_TOKEN がスクリプトプロパティに未登録、または body.token と不一致の場合は
      // 必ず unauthorized を返す。トークンなしでの createEvent は受け付けない。
      // API_TOKEN を設定することで正常に利用できる。
      // 本番強化・外部公開時は必ず API_TOKEN を設定すること。
      var apiToken2 = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
      // fail-closed: API_TOKEN 未設定 OR body.token 不一致なら必ず拒否
      if (!apiToken2 || body.token !== apiToken2) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'unauthorized: createEvent requires a valid API token' }))
                             .setMimeType(ContentService.MimeType.JSON);
      }
      return createCalendarEventFromPost(body);
    }

    var events = body.events || [];

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type !== 'message') continue;

      var msgId      = ev.message.id;
      var msgType    = ev.message.type;
      var replyToken = ev.replyToken;
      var userId     = (ev.source && ev.source.userId) ? ev.source.userId : '';

      // ★ P6-2b: userId フィルタ（ALLOWED_USER_ID が設定されている場合のみ検証）
      if (allowedUserId && userId !== allowedUserId) {
        // 200を返してLINEにリトライさせない。ログのみ残す
        console.warn('[doPost] unauthorized userId: ' + userId);
        continue;
      }

      // 重複チェック（LINEはたまに同じWebhookを2回送る）
      if (isDuplicate(msgId)) continue;
      markDuplicate(msgId);

      // ★ メッセージ処理。失敗しても必ず返信する
      try {
        if (msgType === 'text') {
          handleText(ev.message.text.trim(), replyToken, userId);
        } else if (msgType === 'image') {
          handleImage(msgId, replyToken, userId);
        } else {
          lineReply(replyToken, '📝 テキストか画像を送ってください');
        }
      } catch (msgErr) {
        console.error('[handleMsg] ' + msgErr);
        lineReply(replyToken, '⚠️ エラーが発生しました。もう一度試してください。\n(' + msgErr.message + ')');
      }
    }
  } catch (outerErr) {
    console.error('[doPost] ' + outerErr);
  } finally {
    lock.releaseLock();
  }

  return output;
}

// ============================================================
// テキストメッセージ処理
// ============================================================
function handleText(text, replyToken, userId) {
  var norm = text.replace(/\s/g, '');

  // 朝配信の登録
  if (/^(朝の天気登録|朝7時でお願い|朝7時登録|朝配信登録)$/.test(norm)) {
    setMorningUser(userId);
    lineReply(replyToken, '✅ 登録しました！\n毎朝7時に天気・花粉・予定をお届けします');
    return;
  }

  // テスト配信
  if (/^(テスト|テスト配信|配信テスト|朝のテスト)$/.test(norm)) {
    setMorningUser(userId);
    lineReply(replyToken, '📤 テスト配信を送ります...');
    var msg = buildMorningMessage();
    linePush(userId, '[テスト]\n\n' + msg);
    return;
  }

  // 確認待ち（「はい」「いいえ」）
  var pending = getPending(userId);
  if (pending) {
    handleConfirmation(text, replyToken, userId, pending);
    return;
  }

  // URLが含まれる
  var urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    lineReply(replyToken, '🔗 ページを取得しています...');
    handleUrl(urlMatch[0], text, userId);
    return;
  }

  // 通常テキスト → 解析して即時登録
  var parsed = parseText(text);
  if (parsed._dateError) {
    lineReply(replyToken, '⚠️ ' + parsed._dateError + '\n日付を確認して再送してください');
    return;
  }
  if (parsed.hasDateTime) {
    var calResult = registerEvent(parsed);
    lineReply(replyToken, fmtEventReply(parsed, calResult));
  } else {
    var sheetResult = registerTask(parsed.title || text);
    lineReply(replyToken, fmtTaskReply(parsed.title || text, sheetResult));
  }
}

// ============================================================
// 画像処理（OCR）
// ============================================================
function handleImage(msgId, replyToken, userId) {
  // reply は即座に送る（replyToken は30秒で失効）
  lineReply(replyToken, '🔍 画像を認識しています...\n少々お待ちください');

  try {
    var blob = getLineContent(msgId);
    if (!blob) { linePush(userId, '❌ 画像の取得に失敗しました'); return; }

    var ocrText = doOCR(blob);
    if (!ocrText) { linePush(userId, '🔍 文字を読み取れませんでした。テキストで入力してください'); return; }

    var clean  = ocrText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    var parsed = parseText(clean);

    savePending(userId, { text: clean, parsed: parsed });
    linePush(userId,
      '🖼 画像から読み取りました\n\n' +
      '📖 「' + clip(clean, 80) + '」\n\n' +
      buildPreview(parsed, clean) +
      '\n\n✅ 登録しますか？（はい／いいえ）'
    );
  } catch (e) {
    console.error('[handleImage] ' + e);
    linePush(userId, '❌ 画像処理中にエラーが発生しました\n(' + e.message + ')');
  }
}

// ============================================================
// URL処理
// ============================================================
function handleUrl(url, fullText, userId) {
  try {
    var title = '';
    try {
      var html  = UrlFetchApp.fetch(url, { muteHttpExceptions: true, deadline: 10 }).getContentText('utf-8');
      var m     = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
      title     = m ? m[1].trim() : '';
    } catch (e) { /* ページ取得失敗は無視 */ }

    var displayTitle = title || fullText.replace(url, '').trim() || url;
    var parsed       = parseText(displayTitle);

    savePending(userId, { url: url, text: displayTitle, parsed: parsed });
    linePush(userId,
      '🔗 URLを検出しました\n\n' +
      (title ? '📄 ' + clip(title, 60) + '\n' : '') +
      '🔗 ' + clip(url, 60) + '\n\n' +
      buildPreview(parsed, displayTitle) +
      '\n\n✅ 登録しますか？（はい／いいえ）'
    );
  } catch (e) {
    console.error('[handleUrl] ' + e);
    linePush(userId, '❌ URL処理中にエラーが発生しました\n(' + e.message + ')');
  }
}

// ============================================================
// 確認フロー（はい／いいえ）
// ============================================================
function handleConfirmation(text, replyToken, userId, pending) {
  var norm = text.replace(/\s/g, '');
  var yes  = /^(はい|yes|YES|Yes|y|Y|登録|する|ok|OK|おk)$/.test(norm);
  var no   = /^(いいえ|no|No|NO|n|N|キャンセル|やめ|やめる|止める)$/.test(norm);

  if (!yes && !no) {
    // 新しいメッセージとして処理（確認をキャンセルして上書き）
    clearPending(userId);
    handleText(text, replyToken, userId);
    return;
  }

  clearPending(userId);

  if (no) {
    lineReply(replyToken, '❌ キャンセルしました');
    return;
  }

  var parsed = pending.parsed;
  if (parsed.hasDateTime) {
    var calResult   = registerEvent(parsed);
    lineReply(replyToken, fmtEventReply(parsed, calResult));
  } else {
    var sheetResult = registerTask(parsed.title || pending.text);
    lineReply(replyToken, fmtTaskReply(parsed.title || pending.text, sheetResult));
  }
}

// ============================================================
// テキスト解析 アダプタ（Phase 5 後半: parser-core.gs 正本化）
//
// parseTextCore()（parser-core.gs）を呼び出し、LINE.gs が期待する形に詰め替える。
// 戻り値スキーマ:
//   { title, hasDateTime, date(Date), startTime({h,m}|null), endTime({h,m}|null),
//     allDay, calendarKey, location, meetUrl, description, _dateError }
// ============================================================
function parseText(text) {
  // parseTextCore は parser-core.gs で定義（同一 GAS スクリプト）
  // todayDate 省略 → new Date() を使用
  var coreResult = parseTextCore(text);

  // date: 'YYYY-MM-DD' 文字列 → Date オブジェクト
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

  // startTime: 'HH:MM' 文字列 → { h, m } オブジェクト
  var startTimeObj = null;
  if (coreResult.startTime) {
    var sp = coreResult.startTime.split(':');
    startTimeObj = { h: parseInt(sp[0]), m: parseInt(sp[1] || '0') };
  }

  // endTime: 'HH:MM' 文字列 → { h, m } オブジェクト
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

// ============================================================
// AI一括抽出（Gemini 1回で全フィールドを取得）
// hasDateTime: 正規表現で日付が見つかっていたか（タイトル形式の切り替えに使用）
// ============================================================
function parseWithGemini(text, hasDateTime) {
  if (!CFG.GEMINI_KEY) return null;
  try {
    var titleRule = hasDateTime
      ? "【タイトル生成の考え方】\n" +
        "音声入力テキストの「意味・目的・活動内容」を文脈から理解し、Googleカレンダーに表示して一目でわかるイベント名を自然な日本語で生成してください。\n" +
        "日時情報（今日・明日・夜・朝など）はタイトルに不要です。それ以外は文脈で判断してください。"
      : "[カテゴリ絵文字]+[何を]+[動詞] 形式で生成\n" +
        "絵文字の選び方: 📞連絡/電話 📋報告・資料 📊データ分析 🏀バスケ・試合 📸撮影 📤提出・送付 🔍確認・調査 🎨デザイン 📝メモ・作成 🚣ボート 📚学習\n" +
        "例: \"📞コーチに連絡する\" \"📋市町村応援DAYのレポートを作成する\" \"🔍チケット販売データを確認する\" \"📤スポンサー提案書を送付する\"";

    var prompt =
      "あなたは山田龍偉（秋田ノーザンハピネッツ マーケティングスタッフ）の音声入力をGoogleカレンダーに登録するAIです。\n" +
      "音声入力の文脈・意図を理解して情報を抽出し、JSONのみ返してください。コードブロック・説明文不要。\n\n" +
      "【タイトル】\n" + titleRule + "\n\n" +
      "【カレンダー振り分け（calendarKey）】\n" +
      "- \"work\": ハピネッツ/ANH/89ERS/バスケ/試合/チケット/集客/マーケ/プロモ/撮影（選手・試合）/会議/MTG/ミーティング/出張/スポンサー/ami/myAN/データ分析/レポート/資料/研修\n" +
      "- \"personal\": サウナ/ボート/ローイング/エルゴ/レース/病院/歯医者/食事/飲み会/趣味/プライベート/写真（個人）\n" +
      "- 迷ったら \"personal\"\n\n" +
      "【場所（location）】施設名・会場名・住所があれば抽出する\n\n" +
      "【meetUrl】Zoom/Meet URLがあれば抽出する\n\n" +
      "【description】タイトル・日時・場所・URL以外の補足情報（参加者・持ち物など）\n\n" +
      "JSONスキーマ:\n" +
      "{\"title\":\"...\",\"calendarKey\":\"work|personal\",\"location\":\"...\",\"description\":\"...\",\"meetUrl\":null}\n\n" +
      "音声入力：" + text;

    var res = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + CFG.GEMINI_KEY,
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 }
        }),
        muteHttpExceptions: true,
        deadline: 15
      }
    );

    var json = JSON.parse(res.getContentText());
    var raw = ((json.candidates || [])[0] || {}).content;
    var rawText = raw && raw.parts && raw.parts[0] ? raw.parts[0].text.trim() : "";
    rawText = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();

    var props = JSON.parse(rawText);
    return {
      title:       (typeof props.title === "string" && props.title.length > 0) ? props.title.substring(0, 60) : "",
      calendarKey: (props.calendarKey === "work") ? "work" : "personal",
      location:    typeof props.location === "string" ? props.location : "",
      description: typeof props.description === "string" ? props.description : "",
      meetUrl:     typeof props.meetUrl === "string" && props.meetUrl ? props.meetUrl : null
    };
  } catch (e) {
    console.error("[parseWithGemini] " + e);
    return null;
  }
}

// ============================================================
// Googleカレンダー登録
// ============================================================
function registerEvent(parsed) {
  try {
    var calId = CFG.CAL[parsed.calendarKey] || CFG.CAL.personal;
    var cal   = CalendarApp.getCalendarById(calId);
    if (!cal) throw new Error('カレンダーが見つかりません: ' + parsed.calendarKey);

    var date = new Date(parsed.date);
    var descParts = [];
    if (parsed.meetUrl) descParts.push(parsed.meetUrl);
    if (parsed.description && (!parsed.meetUrl || parsed.description.indexOf(parsed.meetUrl) < 0)) {
      descParts.push(parsed.description);
    }
    var opts = { description: descParts.join('\n'), location: parsed.location || '' };

    if (parsed.allDay) {
      cal.createAllDayEvent(parsed.title, date, opts);
    } else {
      var start = new Date(date);
      start.setHours(parsed.startTime.h, parsed.startTime.m, 0, 0);
      var end = new Date(date);
      if (parsed.endTime) {
        end.setHours(parsed.endTime.h, parsed.endTime.m, 0, 0);
      } else {
        end.setHours(parsed.startTime.h + 1, parsed.startTime.m, 0, 0);
      }
      cal.createEvent(parsed.title, start, end, opts);
    }

    return { ok: true, calName: CFG.CAL_NAME[parsed.calendarKey] || parsed.calendarKey };
  } catch (e) {
    console.error('[registerEvent] ' + e);
    return { ok: false, error: e.message };
  }
}

// ============================================================
// Google Sheets タスク登録
// ============================================================
function registerTask(title) {
  try {
    var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
    var sheet = ss.getSheetByName(CFG.SHEET_NAME);
    if (!sheet) throw new Error('シート "' + CFG.SHEET_NAME + '" が見つかりません');

    var now = new Date();
    sheet.appendRow([
      Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
      title,
      '未着手',
      ''
    ]);
    return { ok: true, row: sheet.getLastRow(), title: title };
  } catch (e) {
    console.error('[registerTask] ' + e);
    return { ok: false, error: e.message };
  }
}

// ============================================================
// 返信テキスト生成
// ============================================================
function fmtEventReply(parsed, result) {
  if (!result.ok) return '❌ カレンダー登録に失敗しました\n' + result.error;

  var dateStr = parsed.date
    ? Utilities.formatDate(parsed.date, 'Asia/Tokyo', 'yyyy-MM-dd')
    : '（日付不明）';

  var timeStr = '';
  if (!parsed.allDay && parsed.startTime) {
    timeStr = '\n🕐 ' + pad2(parsed.startTime.h) + ':' + pad2(parsed.startTime.m);
    if (parsed.endTime) {
      timeStr += ' 〜 ' + pad2(parsed.endTime.h) + ':' + pad2(parsed.endTime.m);
    }
  }

  return '📅 予定を登録しました\n\n' +
         '📝 ' + parsed.title + '\n' +
         '📆 ' + dateStr + timeStr + '\n' +
         '👤 ' + result.calName +
         (parsed.location ? '\n📍 ' + parsed.location : '') +
         (parsed.meetUrl ? '\n🔗 ' + parsed.meetUrl : '');
}

function fmtTaskReply(title, result) {
  if (!result.ok) return '❌ タスク登録に失敗しました\n' + result.error;
  return '✅ タスクを追加しました\n\n📌 ' + clip(title, 50);
}

function buildPreview(parsed, text) {
  if (parsed.hasDateTime) {
    var dateStr = parsed.date
      ? Utilities.formatDate(parsed.date, 'Asia/Tokyo', 'M月d日')
      : '（日付不明）';
    var timeStr = (!parsed.allDay && parsed.startTime)
      ? pad2(parsed.startTime.h) + ':' + pad2(parsed.startTime.m)
      : '（終日）';
    return '📅 予定として登録します\n' +
           '  タイトル: ' + parsed.title + '\n' +
           '  日時:     ' + dateStr + ' ' + timeStr + '\n' +
           '  カレンダー: ' + (CFG.CAL_NAME[parsed.calendarKey] || parsed.calendarKey);
  } else {
    return '✅ タスクとして登録します\n  タイトル: ' + clip(parsed.title || text, 50);
  }
}

// ============================================================
// 朝の配信（トリガーで毎朝7時に実行）
// ============================================================
function runMorningDigest() {
  var userId = getMorningUser();
  if (!userId) { console.log('朝配信ユーザー未登録'); return; }

  try {
    linePush(userId, buildMorningMessage());
  } catch (e) {
    console.error('[runMorningDigest] ' + e);
  }
}

function buildMorningMessage() {
  var now     = new Date();
  var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'M月d日（E）');

  var weather = fetchWeather();
  var events  = fetchTodayEvents(now);

  var msg = '🌅 おはようございます\n' + dateStr + '\n\n';
  msg += '☀️ 天気（秋田）\n' + weather + '\n\n';
  msg += '📅 今日の予定（' + events.length + '件）\n';

  if (events.length === 0) {
    msg += '  予定はありません';
  } else {
    for (var i = 0; i < events.length; i++) {
      msg += '  ' + events[i] + '\n';
    }
  }
  return msg;
}

function fetchWeather() {
  try {
    var url = 'https://api.open-meteo.com/v1/forecast' +
              '?latitude=' + CFG.AKITA_LAT +
              '&longitude=' + CFG.AKITA_LON +
              '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum' +
              '&timezone=Asia%2FTokyo&forecast_days=1';
    var res   = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true, deadline: 10 }).getContentText());
    var daily = (res && res.daily) ? res.daily : {};
    var max   = (daily.temperature_2m_max  || [])[0] || '?';
    var min   = (daily.temperature_2m_min  || [])[0] || '?';
    var rain  = (daily.precipitation_sum   || [])[0];

    var weatherLine = '最高 ' + max + '℃ / 最低 ' + min + '℃';
    if (rain && rain !== '?' && rain > 0) {
      weatherLine += ' / 降水 ' + rain + 'mm';
    }

    // 花粉情報（季節判定）
    var now   = new Date();
    var month = now.getMonth() + 1;
    var pollen = (month >= 3 && month <= 5)
      ? '🌸 花粉シーズン（高）'
      : '🌸 花粉少なし';

    return weatherLine + '\n' + pollen;
  } catch (e) {
    console.error('[fetchWeather] ' + e);
    return '（取得失敗）';
  }
}

function fetchTodayEvents(now) {
  var result = [];
  var start  = new Date(now); start.setHours(0, 0, 0, 0);
  var end    = new Date(now); end.setHours(23, 59, 59, 0);

  var calKeys = Object.keys(CFG.CAL);
  for (var i = 0; i < calKeys.length; i++) {
    try {
      var cal    = CalendarApp.getCalendarById(CFG.CAL[calKeys[i]]);
      var events = cal.getEvents(start, end);
      for (var j = 0; j < events.length; j++) {
        var ev   = events[j];
        var time = ev.isAllDayEvent()
          ? '終日'
          : Utilities.formatDate(ev.getStartTime(), 'Asia/Tokyo', 'HH:mm');
        result.push(time + '  ' + ev.getTitle());
      }
    } catch (e) {
      console.error('[fetchTodayEvents] ' + calKeys[i] + ': ' + e);
    }
  }

  result.sort();
  return result;
}

// ============================================================
// LINE API
// ============================================================
function lineReply(replyToken, text) {
  if (!replyToken || !text) return;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method:             'post',
      contentType:        'application/json',
      headers:            { 'Authorization': 'Bearer ' + CFG.LINE_TOKEN },
      payload:            JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: String(text) }] }),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error('[lineReply] ' + e);
  }
}

function linePush(userId, text) {
  if (!userId || !text) return;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method:             'post',
      contentType:        'application/json',
      headers:            { 'Authorization': 'Bearer ' + CFG.LINE_TOKEN },
      payload:            JSON.stringify({ to: userId, messages: [{ type: 'text', text: String(text) }] }),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error('[linePush] ' + e);
  }
}

// ============================================================
// LINE コンテンツ取得・OCR
// ============================================================
function getLineContent(msgId) {
  try {
    var res = UrlFetchApp.fetch(
      'https://api-data.line.me/v2/bot/message/' + msgId + '/content',
      { headers: { 'Authorization': 'Bearer ' + CFG.LINE_TOKEN }, muteHttpExceptions: true }
    );
    return res.getBlob();
  } catch (e) {
    console.error('[getLineContent] ' + e);
    return null;
  }
}

function doOCR(blob) {
  var fileId = null, docId = null;
  try {
    var file    = DriveApp.getRootFolder().createFile(blob.setName('_ocr_tmp.jpg'));
    fileId      = file.getId();
    var docFile = Drive.Files.copy(
      { title: '_ocr_result', mimeType: 'application/vnd.google-apps.document' },
      fileId,
      { ocr: true, ocrLanguage: 'ja' }
    );
    docId       = docFile.id;
    var text    = DocumentApp.openById(docId).getBody().getText();
    return text.trim();
  } catch (e) {
    console.error('[doOCR] ' + e);
    return '';
  } finally {
    try { if (fileId) DriveApp.getFileById(fileId).setTrashed(true); } catch(e) {}
    try { if (docId)  DriveApp.getFileById(docId).setTrashed(true);  } catch(e) {}
  }
}

// ============================================================
// PropertiesService（状態管理）
// ============================================================
function setMorningUser(userId) {
  PropertiesService.getScriptProperties().setProperty(PKEY.MORNING, userId);
}
function getMorningUser() {
  return PropertiesService.getScriptProperties().getProperty(PKEY.MORNING) || '';
}

function savePending(userId, data) {
  data._ts = Date.now();
  PropertiesService.getScriptProperties()
    .setProperty(PKEY.PENDING + userId, JSON.stringify(data));
}
function getPending(userId) {
  var v = PropertiesService.getScriptProperties().getProperty(PKEY.PENDING + userId);
  if (!v) return null;
  var d = JSON.parse(v);
  if (Date.now() - (d._ts || 0) > 86400000) { clearPending(userId); return null; } // 24時間で自動破棄
  return d;
}
function clearPending(userId) {
  PropertiesService.getScriptProperties().deleteProperty(PKEY.PENDING + userId);
}

function isDuplicate(msgId) {
  return !!PropertiesService.getScriptProperties().getProperty(PKEY.DEDUP + msgId);
}
function markDuplicate(msgId) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PKEY.DEDUP + msgId, '1');
  // 500件超えたら古い重複キーを掃除（PropertiesServiceの上限対策）
  var keys  = props.getKeys().filter(function(k) { return k.indexOf(PKEY.DEDUP) === 0; });
  if (keys.length > 500) {
    keys.slice(0, 200).forEach(function(k) { props.deleteProperty(k); });
  }
}

// ============================================================
// ユーティリティ（clip / pad2 は parser-core.gs に移動済み）
// ============================================================

// ============================================================
// GETエンドポイント（Electronアプリ用タスク取得）
// ============================================================
function doGet(e) {
  // APIトークン認証（スクリプトプロパティに API_TOKEN を登録しておく）
  var apiToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (apiToken) {
    var reqToken = e && e.parameter && e.parameter.token;
    if (reqToken !== apiToken) return jsonOut({ error: 'unauthorized' });
  }

  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'list';
  try {
    if (action === 'list')        return getTaskList();
    if (action === 'update')      return updateTaskField(e.parameter.id, e.parameter.field, e.parameter.value);
    if (action === 'add')         return addTaskDirect(e.parameter.title);
    if (action === 'events')      return getCalendarEvents(e.parameter.date);
    if (action === 'gamedays')    return getHappinetsGameDays();
    // createEvent は doGet 経由を廃止（無認証書き込みバイパスを防止）
    // → doPost + body.token 認証ルートのみ受け付ける
    if (action === 'createEvent') return jsonOut({ success: false, error: 'createEvent via GET is disabled. Use POST with token.' });
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ error: 'unknown action' }))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ★ P2-4: ハピネッツ試合日取得（今後6ヶ月・YYYY-MM-DD配列）
// ============================================================
function getHappinetsGameDays() {
  var now    = new Date();
  var cutoff = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
  var days   = [];

  // CFG.CAL の import カレンダー（happinets キーまたは名前に "ハピネッツ"/"試合" を含むもの）を探す
  var targetCalIds = [];

  // happinets キーが定義されていれば優先
  if (CFG.CAL.happinets) {
    targetCalIds.push(CFG.CAL.happinets);
  }

  // 追加候補: 名前に "ハピネッツ" または "試合" を含むカレンダー
  if (targetCalIds.length === 0) {
    var allCals = CalendarApp.getAllCalendars();
    allCals.forEach(function(cal) {
      var name = cal.getName();
      if (/ハピネッツ|試合/.test(name)) {
        targetCalIds.push(cal.getId());
      }
    });
  }

  targetCalIds.forEach(function(calId) {
    try {
      var cal = CalendarApp.getCalendarById(calId);
      if (!cal) return;
      var evs = cal.getEvents(now, cutoff);
      evs.forEach(function(ev) {
        var d = ev.getStartTime();
        var dateStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
        if (days.indexOf(dateStr) === -1) {
          days.push(dateStr);
        }
      });
    } catch (calErr) {
      console.warn('[getHappinetsGameDays] calId=' + calId + ' : ' + calErr);
    }
  });

  days.sort();
  return ContentService.createTextOutput(JSON.stringify({ days: days }))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ★ Electron→GAS POST 経由カレンダー登録（doPost action=createEvent）
// JSON body: { action, token, title, date, startTime, endTime,
//              allDay, calendarKey, location, description }
// ============================================================
function createCalendarEventFromPost(body) {
  // body を params 形式に変換して共通ロジックへ委譲
  var params = {
    title:       body.title       || '',
    date:        body.date        || '',
    startTime:   body.startTime   || '',
    endTime:     body.endTime     || '',
    allDay:      String(body.allDay || 'false'),
    calendarKey: body.calendarKey || '',
    location:    body.location    || '',
    description: body.description || '',
    colorId:     body.colorId     || ''
  };
  return createCalendarEventFromGet(params);
}

// ============================================================
// ★ Electron→GAS経由カレンダー登録（createEvent アクション）
// パラメータ: title, date(YYYY-MM-DD), startTime(HH:MM), endTime(HH:MM),
//             allDay(true|false), calendarKey, location, description
// description には meetUrl が先頭に配置済みで届く（Electron 側で統合）
// ============================================================
function createCalendarEventFromGet(params) {
  try {
    var title       = params.title      || '';
    var dateStr     = params.date       || '';
    var startTime   = params.startTime  || '';
    var endTime     = params.endTime    || '';
    var allDay      = params.allDay === 'true';
    var calendarKey = params.calendarKey || '';
    var location    = params.location   || '';
    var description = params.description || '';

    // colorId: GCalの有効値 "1"〜"11" のみ受け付ける。不正値は無視（登録は失敗させない）
    var colorIdRaw  = params.colorId ? String(params.colorId) : '';
    var VALID_COLOR_IDS = ['1','2','3','4','5','6','7','8','9','10','11'];
    var colorId     = (colorIdRaw && VALID_COLOR_IDS.indexOf(colorIdRaw) >= 0) ? colorIdRaw : null;

    if (!title)   return jsonOut({ success: false, error: 'title が必要です' });
    if (!dateStr) return jsonOut({ success: false, error: 'date が必要です' });

    // 修正1: 未知 calendarKey を拒否（黙って personal にフォールバックしない）
    if (!calendarKey || !CFG.CAL.hasOwnProperty(calendarKey)) {
      return jsonOut({ success: false, error: 'unknown calendarKey: ' + calendarKey });
    }
    var calId = CFG.CAL[calendarKey];
    var cal   = CalendarApp.getCalendarById(calId);
    if (!cal) return jsonOut({ success: false, error: 'カレンダーが見つかりません: ' + calendarKey });

    var parts = dateStr.split('-');
    if (parts.length !== 3) return jsonOut({ success: false, error: '日付フォーマット不正: ' + dateStr });
    var year  = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var day   = parseInt(parts[2], 10);
    // 修正2: 不正日付検証（Date が要求値と一致しない場合は拒否）
    var date  = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return jsonOut({ success: false, error: '無効な日付: ' + dateStr });
    }

    var opts = {
      location:    location,
      description: description
    };

    var createdEvent;
    if (allDay) {
      createdEvent = cal.createAllDayEvent(title, date, opts);
    } else {
      // 修正3: startTime は HH:MM 形式必須（空・未定義・不正形式・NaN はエラー）
      var timeRe = /^\d{1,2}:\d{2}$/;
      if (!startTime || !timeRe.test(startTime)) {
        return jsonOut({ success: false, error: 'invalid startTime: ' + startTime });
      }
      var sp = startTime.split(':');
      var sh = parseInt(sp[0], 10);
      var sm = parseInt(sp[1], 10);
      if (isNaN(sh) || isNaN(sm) || sh < 0 || sh > 23 || sm < 0 || sm > 59) {
        return jsonOut({ success: false, error: 'invalid startTime: ' + startTime });
      }
      var start = new Date(year, month - 1, day, sh, sm, 0, 0);
      var ep    = endTime ? endTime.split(':') : null;
      var end;
      if (ep) {
        // 修正3: endTime が非null値なら形式・範囲検証
        if (!timeRe.test(endTime)) {
          return jsonOut({ success: false, error: 'invalid endTime: ' + endTime });
        }
        var eh = parseInt(ep[0], 10);
        var em = parseInt(ep[1], 10);
        if (isNaN(eh) || isNaN(em) || eh < 0 || eh > 23 || em < 0 || em > 59) {
          return jsonOut({ success: false, error: 'invalid endTime: ' + endTime });
        }
        end = new Date(year, month - 1, day, eh, em, 0, 0);
        // 日跨ぎ補正: end <= start の場合は end を翌日にする（例: 23:30開始+00:30終了）
        if (end <= start) {
          end.setDate(end.getDate() + 1);
        }
      } else {
        end = new Date(start.getTime() + 60 * 60 * 1000); // デフォルト1時間
      }
      createdEvent = cal.createEvent(title, start, end, opts);
    }

    // 表示色の設定（colorId が有効な場合のみ。例外で登録自体を失敗させない）
    if (colorId && createdEvent) {
      try {
        // CalendarApp.EventColor の定数名マップ（colorId "1"〜"11" 対応）
        var COLOR_MAP = {
          '1':  CalendarApp.EventColor.PALE_BLUE,    // ラベンダー
          '2':  CalendarApp.EventColor.SAGE,          // セージ
          '3':  CalendarApp.EventColor.GRAPE,         // グレープ
          '4':  CalendarApp.EventColor.FLAMINGO,      // フラミンゴ
          '5':  CalendarApp.EventColor.BANANA,        // バナナ
          '6':  CalendarApp.EventColor.TANGERINE,     // タンジェリン
          '7':  CalendarApp.EventColor.PEACOCK,       // ピーコック
          '8':  CalendarApp.EventColor.GRAPHITE,      // グラファイト
          '9':  CalendarApp.EventColor.BLUEBERRY,     // ブルーベリー
          '10': CalendarApp.EventColor.BASIL,         // バジル
          '11': CalendarApp.EventColor.TOMATO         // トマト
        };
        var eventColor = COLOR_MAP[colorId];
        if (eventColor) {
          createdEvent.setColor(eventColor);
        }
      } catch (colorErr) {
        // 色設定失敗は無視（登録は成功扱い）
        console.warn('[createCalendarEventFromGet] setColor 失敗（無視）: ' + colorErr);
      }
    }

    return jsonOut({ success: true, calName: CFG.CAL_NAME[calendarKey] || calendarKey });
  } catch (err) {
    console.error('[createCalendarEventFromGet] ' + err);
    return jsonOut({ success: false, error: err.message });
  }
}

function getCalendarEvents(dateStr) {
  try {
    var date = dateStr ? new Date(dateStr) : new Date();
    var events = [];
    var calIds = Object.values(CFG.CAL);
    calIds.forEach(function(calId) {
      try {
        var cal = CalendarApp.getCalendarById(calId);
        if (!cal) return;
        var dayEvents = cal.getEventsForDay(date);
        dayEvents.forEach(function(ev) {
          var start = ev.getStartTime();
          var end   = ev.getEndTime();
          var isAllDay = ev.isAllDayEvent();
          events.push({
            id:       ev.getId(),
            title:    ev.getTitle(),
            start:    isAllDay ? null : start.toISOString(),
            end:      isAllDay ? null : end.toISOString(),
            allDay:   isAllDay,
            location: ev.getLocation() || '',
            calendar: cal.getName()
          });
        });
      } catch (ignore) {}
    });
    events.sort(function(a, b) {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (a.start || '') < (b.start || '') ? -1 : 1;
    });
    return jsonOut({ success: true, events: events });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  }
}

// ============================================================
// ★ P6-1: UUID ユーティリティ
// ============================================================

/**
 * 文字列が UUID 形式（xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）かを判定する。
 * @param {string} id
 * @returns {boolean}
 */
function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
}

/**
 * シートの1行目ヘッダーから「uuid」列のインデックス（0始まり）を返す。
 * 存在しない場合は -1 を返す。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {number}
 */
function getUuidColIndex(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase() === 'uuid') return i;
  }
  return -1;
}

/**
 * ★ P6-1: UUID マイグレーション（冪等）
 *
 * 実行前にスプレッドシートのコピーを作成しログに URL を出す。
 * 「uuid」列が既に存在する場合は列追加をスキップ。
 * uuid が空の行にだけ Utilities.getUuid() を付与する。
 * 手動で GAS エディタから実行する関数（Electron からは呼ばない）。
 */
function migrateAddUuidColumn() {
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sheet = ss.getSheetByName(CFG.SHEET_NAME);
  if (!sheet) { console.error('[migrate] シートが見つかりません'); return; }

  // ① バックアップ（毎回作成）
  var backup = ss.copy('[BACKUP before uuid migration] ' + CFG.SHEET_NAME + ' ' + new Date().toISOString());
  console.log('[migrate] バックアップ作成完了: ' + backup.getUrl());

  // ② uuid 列の確認・追加（冪等）
  var uuidCol = getUuidColIndex(sheet); // 0始まり
  if (uuidCol < 0) {
    // 最終列の右に追加
    var newColNum = sheet.getLastColumn() + 1;
    sheet.getRange(1, newColNum).setValue('uuid');
    uuidCol = newColNum - 1; // 0始まりに変換
    console.log('[migrate] uuid 列を追加しました（列' + newColNum + '）');
  } else {
    console.log('[migrate] uuid 列は既に存在します（列インデックス ' + uuidCol + '）。スキップ。');
  }

  // ③ 既存行に UUID 付与（空セルのみ）
  var lastRow   = sheet.getLastRow();
  var uuidColNum = uuidCol + 1; // getRange は 1始まり
  var added = 0;
  for (var r = 2; r <= lastRow; r++) {
    var cell = sheet.getRange(r, uuidColNum);
    var existing = cell.getValue();
    if (!existing) {
      cell.setValue(Utilities.getUuid());
      added++;
    }
  }
  console.log('[migrate] UUID 付与完了: ' + added + '行（既存値はスキップ）');
}

// ============================================================
// GETエンドポイント — タスク操作
// ============================================================

function getTaskList() {
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sheet = ss.getSheetByName(CFG.SHEET_NAME);
  if (!sheet) return jsonOut({ success: true, tasks: [] });

  // ★ P6-1: uuid 列の有無を確認（デュアルモード）
  var uuidColIdx = getUuidColIndex(sheet); // -1 なら uuid 列なし
  var hasUuid    = uuidColIdx >= 0;

  var data  = sheet.getDataRange().getValues();
  var tasks = [];

  // priority 正規化マップ: シート上の日本語ステータスを内部 priority 値に変換する
  // 未着手・空文字・未分類 → "medium"（デフォルト）
  var STATUS_TO_PRIORITY = {
    "今日": "today",
    "high": "high",
    "高":   "high",
    "medium": "medium",
    "中":   "medium",
    "low":  "low",
    "低":   "low"
  };

  for (var i = 1; i < data.length; i++) {
    var status    = data[i][2] || "未着手";
    var completed = (status === "完了");

    // id: uuid 列があれば uuid を使用、なければ従来の行番号（デュアルモード）
    var taskId = hasUuid ? String(data[i][uuidColIdx] || (i + 1)) : String(i + 1);

    // priority: ステータスから正規化。未着手・完了・空文字など未定義のものは "medium" にフォールバック
    var priority = STATUS_TO_PRIORITY[status] || "medium";

    tasks.push({
      id:        taskId,
      date:      data[i][0] ? String(data[i][0]) : "",
      title:     data[i][1] || "",
      status:    status,
      memo:      data[i][3] || "",
      source:    "line",
      priority:  priority,
      completed: completed
    });
  }
  return jsonOut({ success: true, tasks: tasks });
}

function updateTaskField(rowId, field, value) {
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sheet = ss.getSheetByName(CFG.SHEET_NAME);

  // ★ P6-1: UUID 形式なら uuid 列で行検索、数値なら従来の行番号（恒久互換）
  var row;
  if (isUuid(rowId)) {
    var uuidColIdx = getUuidColIndex(sheet);
    if (uuidColIdx < 0) return jsonOut({ error: 'uuid 列が存在しません。migrateAddUuidColumn() を先に実行してください' });
    var uuidColNum = uuidColIdx + 1;
    var lastRow    = sheet.getLastRow();
    row = -1;
    for (var r = 2; r <= lastRow; r++) {
      if (sheet.getRange(r, uuidColNum).getValue() === rowId) {
        row = r;
        break;
      }
    }
    if (row < 0) return jsonOut({ error: 'UUID に対応する行が見つかりません: ' + rowId });
  } else {
    row = parseInt(rowId); // 従来: id はシート行番号そのまま（getTaskList で id: i+1 で返している）
    if (isNaN(row) || row < 2) return jsonOut({ error: '不正な rowId: ' + rowId });
  }

  // completed/archived → ステータス列を「完了」に更新
  if (field === "completed" || field === "archived") {
    if (value === "true") {
      sheet.getRange(row, 3).setValue("完了");
    }
    return jsonOut({ ok: true });
  }

  var col = { title: 2, status: 3, memo: 4 }[field];
  if (!col) return jsonOut({ error: 'invalid field' });
  sheet.getRange(row, col).setValue(value);
  return jsonOut({ ok: true });
}

function addTaskDirect(title) {
  var result = registerTask(title);
  return jsonOut(result);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}
