/**
 * lib/parser.js — Gemini API でテキスト→予定JSON変換
 *
 * 移植元:
 *   buildSystemPrompt : main/ipc/gemini.js の buildSystemPrompt()（event固定版）
 *   Gemini fetch形式  : main/ipc/gemini.js の fetch 実装（systemInstruction/contents分離）
 *   日付正規化        : renderer/ollama.js parseEventSmart の date 正規化ロジック
 */

const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_TIMEOUT = 15000;
const MAX_TOKENS     = 2048;

// ──────────────────────────────────────────
// システムプロンプト（gemini.js buildSystemPrompt から移植・event固定）
// ──────────────────────────────────────────

export function buildSystemPrompt(today) {
  const [ty, tm, td] = today.split('-').map(Number);
  const todayDate    = new Date(ty, tm - 1, td);
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(todayDate.getDate() + 1);
  const nextWeekDate = new Date(todayDate);
  nextWeekDate.setDate(todayDate.getDate() + 7);

  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tomorrowStr = fmt(tomorrowDate);
  const nextWeekStr = fmt(nextWeekDate);

  return `あなたはカレンダー予定登録用JSONパーサーです。ユーザーが「予定追加」欄に入力したテキストを解析し、JSONのみ返してください。

【絶対ルール: registration_type は常に "event" 固定】
このAPIは「予定追加」専用です。"task" を返すことは一切禁止です。
registration_type: "event" 以外の値を返してはいけません。

【出力フォーマット（必ずJSONのみ、説明文なし）】
{"registration_type":"event","title":"[カテゴリ絵文字]イベント名","category":"カテゴリ絵文字","date":"YYYY-MM-DD","startTime":"HH:MM または null","endTime":"HH:MM または null","allDay":false,"calendarKey":"work|personal","location":"","meetUrl":null,"description":""}

【今日の日付】${today}

【タイトルルール（最重要）】
- タイトル = 「[カテゴリ絵文字] + 簡潔なイベント名」の形式
- 長文の場合: 本文の中から最も具体的なイベント名を抽出して合成する（例: 「HubSpot質問会」）
  - 「■開催日時」「■場所」「■参加対象」「■実施概要」等のセクション見出しはタイトルに含めない
  - 「本日の質問会」のような一般的すぎる表現は避け、固有名（HubSpot, ANH, etc.）を含める
- 日時・URL・ミーティングID・パスコード・助詞（「の」「を」「で」）はタイトルに入れない
- 「N時間」「N分」「N名」「N人」はタイトルに含めない（所要時間・人数）
- ZOOMリンク・ミーティングIDはタイトルに含めない
- 絵文字は必ず先頭に1個だけ付ける

【カテゴリ絵文字ルール（title先頭 & category フィールドに同じ値）】
- 🏀 バスケ/ハピネッツ/ANH/89ERS/HubSpot(ハピネッツ業務ツール)/業務MTG全般
- 📊 データ/分析/レポート/BI
- 📸 撮影/写真/動画/カメラ
- 🚣 ボート/ローイング/エルゴ/コーチ/艇庫/選手/チームマネージャー
- 🤝 会議/MTG/打ち合わせ/面談/商談（ハピネッツ以外）
- 📝 書類/資料/制作/デザイン
- 🏥 病院/歯医者/健康/サウナ/スポーツ/個人
- ✉️ 連絡/メール/返信
- 📦 その他（判断できない場合）
判断ルール: ハピネッツ/ANH/バスケ/HubSpot/業務に関するものは 🏀 優先

【時刻ルール】
- 「N時間」= 所要時間。「15:30から1時間」→ start=15:30, end=16:30
- 時刻範囲「HH:MM‐HH:MM」「HH:MM～HH:MM」「HH:MM-HH:MM」「HH:MM〜HH:MM」「HH:MM–HH:MM」「HH:MM—HH:MM」等（ダッシュ/波線の種類を問わず）→ start と end 両方抽出
  例: "15:30‐16:30" → startTime="15:30", endTime="16:30"
  例: "15:30〜16:30" → startTime="15:30", endTime="16:30"
- 「頃」「おおよそ」付きの時刻 → その時刻をそのまま startTime に使う
- 「終了後」「終わり次第」→ 記載の時刻を startTime に使う
- 深夜/夜中=午前(1〜5時), 朝/早朝=AM, 夕方=17〜19時, 夜=20時前後
- 午前中 = start=09:00, end=12:00
- 時刻不明 → allDay=true
- ★ endTime 未指定かつ allDay=false の場合: endTime = startTime + 1時間（必須）
  例: startTime="15:00" → endTime="16:00"

【日付ルール】
- 明日/あした = 今日+1日、明後日 = 今日+2日
- 来週〇曜 = 今週の該当曜日+7日、曜日のみ = 直近の該当曜日
- 具体的な日付（4月14日・6月16日(火)等）はそのまま解釈
- 年が省略された場合は直近の未来として解釈する（今月より前の月日なら来年扱い）
- ⚠️ date フィールドは必ず YYYY-MM-DD 形式の実際の日付を入れる。「明日」「翌日」等の日本語文字列は絶対に入れない
- 日付が全く読み取れない場合: date=null, allDay=true（Chrome拡張では今日の日付で補完する）

【場所・ミーティングURL抽出ルール】
- 「■場所」「場所：」「会場：」の後に続くテキストを location にする
- ZOOM/Teams/Meet リンク(https://...zoom.us/... 等)は meetUrl に格納（ミーティングID・パスコードは除く）
- ZOOMリンクがある場合: location="オンライン (Zoom)"（物理会場との併催ならその会場名も含める）
- description: 実施概要・参加対象・備考・アジェンダを要約 + 会議URL も含める

【calendarKey ルール】
登録者: 山田龍偉（秋田ノーザンハピネッツ マーケティング/フォト/データ分析 + ボートコーチ）
- "work": ハピネッツ/ANH/バスケ/試合/HubSpot/会議/MTG/打ち合わせ/商談/面談/出張/営業/チケット/集客/撮影（試合・選手）/制作/デザイン/研修/セミナー/採用/契約
- "personal": ボート/ローイング/エルゴ/レース/コーチ/チームマネージャー/選手/艇庫/競技場/病院/歯医者/ランチ/食事/飲み会/旅行/サウナ/スポーツ/趣味/個人
- ハピネッツ/ANH/バスケ/試合/HubSpot 等の業務ツール/会議/MTG/打合せ/商談/面談/出張/チケット/集客/撮影（試合・選手）/制作/研修/セミナー → 迷わず "work"
- ボート/ローイング/エルゴ/レース/コーチ/艇庫/病院/食事/飲み会/旅行/趣味/個人 → "personal"
- 上記どちらとも判断できない真に曖昧な場合のみ "personal" にフォールバック（"work" への安易なデフォルト禁止）

【例1: event（日付あり・endTime 自動補完）】
入力: "明日の21時からサウナ"
出力: {"registration_type":"event","title":"🏥サウナ","category":"🏥","date":"${tomorrowStr}","startTime":"21:00","endTime":"22:00","allDay":false,"calendarKey":"personal","location":"","meetUrl":null,"description":""}

【例2: event（時刻範囲ダッシュ）】
入力: "明日15:30‐16:30 スポンサー提案MTG @秋田ノーザンゲートスクエア"
出力: {"registration_type":"event","title":"🏀スポンサー提案MTG","category":"🏀","date":"${tomorrowStr}","startTime":"15:30","endTime":"16:30","allDay":false,"calendarKey":"work","location":"秋田ノーザンゲートスクエア","meetUrl":null,"description":""}

【例3: event（複数行・長文・Zoom付き・ハピネッツ業務）】
入力: "■開催日時\\n6月16日（火）15:30‐16:30\\nZoom ミーティングに参加する\\nhttps://us02web.zoom.us/j/87485323293?pwd=EuxW1Uf3VRBIa0SC0DJRDOItOLZ0cU.1\\n■参加対象\\nHubSpotを業務で利用する方\\n■実施概要\\n・HubSpotデータ項目説明\\n・本番稼働に向けたご案内\\n■備考\\n後日アーカイブ配信および資料展開予定"
出力: {"registration_type":"event","title":"🏀HubSpot質問会","category":"🏀","date":"2026-06-16","startTime":"15:30","endTime":"16:30","allDay":false,"calendarKey":"work","location":"オンライン (Zoom)","meetUrl":"https://us02web.zoom.us/j/87485323293?pwd=EuxW1Uf3VRBIa0SC0DJRDOItOLZ0cU.1","description":"HubSpotを業務で利用する方向け質問会。後日アーカイブ配信予定。"}

【例4: event（コーチ・Zoom・物理会場）】
入力: "2026年6月5日(金) チームマネージャーミーティング終了後（おおよそ17:00頃～）\\n■場所\\n東京都江東区・海の森水上競技場 艇庫２Fミーティングルーム\\nおよびオンライン\\nZOOM https://us06web.zoom.us/j/87852271325\\nパスコード: 140746\\nコーチミーティング"
出力: {"registration_type":"event","title":"🚣コーチミーティング","category":"🚣","date":"2026-06-05","startTime":"17:00","endTime":"18:00","allDay":false,"calendarKey":"personal","location":"海の森水上競技場 艇庫２Fミーティングルーム","meetUrl":"https://us06web.zoom.us/j/87852271325","description":"チームマネージャーミーティング終了後（17:00頃）。オンライン同時開催。"}

【例5: event（時刻不明・終日）】
入力: "来週 ${nextWeekStr} ハピネッツ試合撮影"
出力: {"registration_type":"event","title":"🏀ハピネッツ試合撮影","category":"🏀","date":"${nextWeekStr}","startTime":null,"endTime":null,"allDay":true,"calendarKey":"work","location":"","meetUrl":null,"description":""}`;
}

// ──────────────────────────────────────────
// 日付正規化（renderer/ollama.js parseEventSmart から移植）
// date=null → 今日の日付で補完（拡張版: 選択日UIがないため today 基準）
// ──────────────────────────────────────────

export function normalizeDate(dateStr, today) {
  if (!dateStr) {
    // null/空 → 今日で補完
    return today;
  }

  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // ローカル0:00 起点の「今日」文字列（ロールオーバー判定用）
  const localToday = fmt(new Date());

  // 和暦変換（令和N年 → 西暦）
  const warekiMatch = dateStr.match(/令和(\d+)年/);
  if (warekiMatch) {
    const year = 2018 + parseInt(warekiMatch[1], 10);
    dateStr = dateStr.replace(/令和\d+年/, `${year}年`);
  }

  // すでに YYYY-MM-DD 形式
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // 年が省略されていない → そのまま返す
    return dateStr;
  }

  // YYYY年M月D日（完全和暦・年あり）→ 年を保持・ロールオーバーしない
  const jpYmdMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jpYmdMatch) {
    return `${jpYmdMatch[1]}-${pad(jpYmdMatch[2])}-${pad(jpYmdMatch[3])}`;
  }

  // YYYY/M/D または YYYY-M-D（明示年・ロールオーバーしない）
  const ymdMatch = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${pad(ymdMatch[2])}-${pad(ymdMatch[3])}`;
  }

  // M/D または M-D（年なし）— 文字列辞書比較でロールオーバー判定（JST統一）
  const mdMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (mdMatch) {
    const m = parseInt(mdMatch[1], 10) - 1;
    const d = parseInt(mdMatch[2], 10);
    let year = new Date().getFullYear();
    const candYMD = fmt(new Date(year, m, d));
    if (candYMD < localToday) year++;
    return fmt(new Date(year, m, d));
  }

  // 年なし「N月N日」— 文字列辞書比較でロールオーバー判定（JST統一）
  const jpMdMatch = dateStr.match(/(\d{1,2})月(\d{1,2})日/);
  if (jpMdMatch) {
    const m = parseInt(jpMdMatch[1], 10) - 1;
    const d = parseInt(jpMdMatch[2], 10);
    let year = new Date().getFullYear();
    const candYMD = fmt(new Date(year, m, d));
    if (candYMD < localToday) year++;
    return fmt(new Date(year, m, d));
  }

  // 相対表現（Gemini が文字列を返してきた場合のフォールバック）
  if (dateStr === 'TODAY' || dateStr === '今日') return today;
  if (dateStr === 'TOMORROW' || dateStr === '明日') {
    const d = new Date(); d.setDate(d.getDate() + 1); return fmt(d);
  }

  // 変換できなかった場合 → 今日
  return today;
}

// ──────────────────────────────────────────
// Gemini API 呼び出し（gemini.js fetch実装を移植）
// ──────────────────────────────────────────

/**
 * テキストを Gemini に渡して予定 JSON を得る
 * @param {string} text        - 選択テキスト
 * @param {string} apiKey      - GEMINI_API_KEY
 * @param {string} today       - YYYY-MM-DD
 * @returns {Promise<{success:boolean, parsed?:object, error?:string}>}
 */
export async function parseWithGemini(text, apiKey, today) {
  const systemPrompt = buildSystemPrompt(today);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: `入力: "${text}"\n出力:` }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: MAX_TOKENS,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT)
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errBody.substring(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

  // ```json ... ``` ブロック除去
  const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  // date が null → 今日で補完
  if (!parsed.date) {
    parsed.date = today;
    parsed.allDay = true;
  } else {
    parsed.date = normalizeDate(parsed.date, today);
  }

  // registration_type を event に強制
  parsed.registration_type = 'event';

  return { success: true, parsed };
}
