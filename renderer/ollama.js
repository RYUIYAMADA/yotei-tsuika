// ★ Ollama連携・NLP
import { formatDate } from './utils.js';
import * as state from './state.js';
import { parseNaturalLanguageEvent } from './nlp-parser.js';

// ★ P2-3: デフォルト値（app-config.json 未取得時のフォールバック）
const OLLAMA_DEFAULTS = {
  url:   'http://localhost:11434',
  model: 'qwen2.5:3b',
};
// 実際の設定は起動時に get-app-config IPC で上書きされる
let OLLAMA_URL   = OLLAMA_DEFAULTS.url;
let OLLAMA_MODEL = OLLAMA_DEFAULTS.model;

export let ollamaAvailable = null;

/** app-config.json の ollama 設定を反映する（renderer.js の初期化時に呼ぶ） */
export async function initOllamaConfig() {
  try {
    const cfg = await window.api.getAppConfig();
    if (cfg && cfg.ollama) {
      if (cfg.ollama.url)   OLLAMA_URL   = cfg.ollama.url;
      if (cfg.ollama.model) OLLAMA_MODEL = cfg.ollama.model;
    }
  } catch (e) {
    console.warn('[ollama] getAppConfig失敗（デフォルト使用）:', e.message);
  }
}

// 起動時に1回だけ疎通確認
export async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(1500)
    });
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }
}

// ★ Ollamaウォームアップ
export async function warmupOllama() {
  await checkOllama();
  if (ollamaAvailable) {
    fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: '', keep_alive: '30m', stream: false })
    }).catch(() => {});
  }
}

// LLMに渡す固定ナレッジ
const LLM_SYSTEM = `あなたはGoogleカレンダー登録用JSONパーサーです。日本語テキストから予定を抽出しJSONのみ返してください。

【最重要ルール: タイトル抽出】
- タイトル = イベント名のみ。日時・場所・助詞・動詞は含めない
- 「N時間」「N分」「N名」「N人」「N階」はタイトルに含めない（所要時間・人数）
- 「間」「の」「から」「まで」等の助詞/接続詞がタイトル先頭/末尾に残らないよう注意
- 「〜があります」「〜します」「〜を実施します」などの敬語動詞は除去
- 例: 「明日の21時から2時間サウナ」→ title="サウナ"（"間サウナ"や"2時間サウナ"ではない）

【時刻ルール（重要）】
- 「N時間」= 所要時間。時刻ではない。「から2時間」があればendTime=startTime+2h
  例: 「21時から2時間サウナ」→ start=21:00, end=23:00, title="サウナ"
  例: 「10時 1時間の面談」→ start=10:00, end=11:00, title="面談"
- 「N名/N人/N階/N番/N枚/N円」= 数量。時刻として解釈しない
  例: 「14名で懇親会」→ allDay=true（14時ではない）, title="懇親会"
- 深夜/夜中=午前(1〜5時AM), 朝/早朝=午前AM, 夕方=17〜19時, 夜=20時前後
  例: 「深夜2時まで作業」→ start=02:00
  例: 「朝7時ラジオ体操」→ start=07:00（19時ではない）
  例: 「夜8時から食事会」→ start=20:00
- 「N時間後」「N分後」「N分前」= 相対時刻（解析不可）→ allDay=true
- 午前中 = start=09:00, end=12:00

【日付ルール】
- 明日/あした=tomorrow, 明後日=day+2, 翌日/翌朝=明日と同じ
- 来週月曜=今週月曜+7日（必ず7日以上先）
- 再来週=+14日, 今週=今週内の該当曜日
- 曜日のみ(「木曜日」等)=直近の該当曜日（今日含む）

【calendarKeyルール】
登録者: 山田龍偉（秋田ノーザンハピネッツ マーケティング/フォト/データ分析/チケット営業 + 個人事業）
- "work": ハピネッツ/ANH/myAN/89ERS/バスケ/試合 | 会議/MTG/ミーティング/打ち合わせ/商談/面談 | 出張/大館/営業/チケット/集客/スポンサー | 撮影/制作/デザイン/広告 | 研修/セミナー/説明会/振り返り/キックオフ/プレゼン | 採用/契約/発注/受注/納品/請求
- "personal": ボート/ローイング/エルゴ/レース | 病院/歯医者/健康診断 | ランチ/食事/飲み会/旅行 | サウナ/スポーツ/趣味

【few-shot例（必ず参考にすること）】
入力: "明日の21時から2時間サウナ"
出力: {"title":"サウナ","date":"TOMORROW","startTime":"21:00","endTime":"23:00","allDay":false,"calendarKey":"personal","location":"","meetUrl":null}

入力: "来週月曜13時から約2時間の勉強会"
出力: {"title":"勉強会","date":"NEXT_MON","startTime":"13:00","endTime":"15:00","allDay":false,"calendarKey":"work","location":"","meetUrl":null}

入力: "明日 14名で懇親会"
出力: {"title":"懇親会","date":"TOMORROW","startTime":null,"endTime":null,"allDay":true,"calendarKey":"personal","location":"","meetUrl":null}

入力: "4月14日 2:30 PM チームレビュー"
出力: {"title":"チームレビュー","date":"2026-04-14","startTime":"14:30","endTime":"15:30","allDay":false,"calendarKey":"work","location":"","meetUrl":null}

入力: "朝7時 ラジオ体操"
出力: {"title":"ラジオ体操","date":"TODAY","startTime":"07:00","endTime":"08:00","allDay":false,"calendarKey":"personal","location":"","meetUrl":null}

入力: "明日15時 ハピネッツスポンサー提案MTG @秋田ノーザンゲートスクエア"
出力: {"title":"ハピネッツスポンサー提案MTG","date":"TOMORROW","startTime":"15:00","endTime":"16:00","allDay":false,"calendarKey":"work","location":"秋田ノーザンゲートスクエア","meetUrl":null}`;

// LLMはタイトル抽出のみ担当
async function extractTitleWithLLM(text, regexTitle) {
  const prompt = `以下の予定テキストから、イベント名（タイトル）だけを抜き出してください。
ルール:
- 日時・場所・人数・所要時間・挨拶・助詞は含めない
- 動詞（〜します/〜があります）は含めない
- 「N時間」「N名」「N人」は所要時間/人数なので除く
- 簡潔なイベント名のみ返す（例: "サウナ" "MTG" "撮影" "フォトディスカッション"）

予定テキスト: "${text}"
正規表現パーサーの候補タイトル: "${regexTitle}"

タイトルのみ返してください（JSON不要、1行）:`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        num_predict: 30,
        temperature: 0.1,
        stop: ['\n', '。', '、'],
      },
      keep_alive: '30m'
    }),
    signal: AbortSignal.timeout(3000)
  });
  if (!res.ok) throw new Error('ollama error');
  const data = await res.json();
  return data.response.trim().replace(/^["「]|["」]$/g, '');
}

// ハイブリッドパーサー: Gemini優先 → Ollama → 正規表現フォールバック
export async function parseEventSmart(text) {
  const today = formatDate(new Date());

  // ① Gemini API（優先）
  try {
    const res = await window.api.parseEventWithGemini(text, today);
    if (res && !res.success) {
      console.error('[Gemini] API returned failure:', res.error);
    }
    if (res && res.success && res.parsed) {
      const p = res.parsed;
      const isTask = p.registration_type === 'task';

      // date 正規化: Gemini が返した date を YYYY-MM-DD に変換する
      // ★ 予定追加欄専用なので isTask に関わらず常に date 正規化を試みる
      // ★ pDateEmpty: Gemini が date を null/空で返したかを先に記録する
      //   （正規化失敗で null に落としたケースと区別するため）
      const pDateEmpty = !p.date;
      let normalizedDate = p.date || null;
      if (normalizedDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        const pad = n => String(n).padStart(2, '0');
        const base = new Date(today);
        const rel = normalizedDate.replace(/\s/g, '');

        // --- 相対表現 ---
        if (/明日|翌日|あした|TOMORROW/i.test(rel)) {
          base.setDate(base.getDate() + 1);
          normalizedDate = `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}`;
        } else if (/明後日/.test(rel)) {
          base.setDate(base.getDate() + 2);
          normalizedDate = `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}`;
        } else if (/TODAY|今日|本日/i.test(rel)) {
          normalizedDate = today;

        // --- YYYY年M月D日 ---
        } else if (/^(\d{4})年(\d{1,2})月(\d{1,2})日/.test(rel)) {
          const m = rel.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
          normalizedDate = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

        // --- M月D日（曜日カッコ任意） ---
        } else if (/^(\d{1,2})月(\d{1,2})日/.test(rel)) {
          const m = rel.match(/^(\d{1,2})月(\d{1,2})日/);
          const mo = parseInt(m[1], 10);
          const d  = parseInt(m[2], 10);
          // 年は今日基準: その月日が今日以降なら今年、過去なら翌年
          let yr = base.getFullYear();
          const candidate = new Date(yr, mo - 1, d);
          const todayDate = new Date(today);
          todayDate.setHours(0, 0, 0, 0);
          if (candidate < todayDate) yr += 1;
          normalizedDate = `${yr}-${pad(mo)}-${pad(d)}`;

        // --- YYYY/M/D または YYYY-M-D ---
        } else if (/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/.test(rel)) {
          const m = rel.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
          normalizedDate = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

        // --- M/D または M-D（年なし） ---
        } else if (/^(\d{1,2})[\/\-](\d{1,2})$/.test(rel)) {
          const m = rel.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
          const mo = parseInt(m[1], 10);
          const d  = parseInt(m[2], 10);
          let yr = base.getFullYear();
          const candidate = new Date(yr, mo - 1, d);
          const todayDate = new Date(today);
          todayDate.setHours(0, 0, 0, 0);
          if (candidate < todayDate) yr += 1;
          normalizedDate = `${yr}-${pad(mo)}-${pad(d)}`;

        } else {
          // 変換できない表現は null に落として正規表現フォールバックへ
          console.warn('[Gemini] date 正規化失敗、フォールバック:', normalizedDate);
          normalizedDate = null;
        }
      }

      // ★ 予定追加欄専用: Gemini が task を返しても強制 event にする（二重防護）
      // task 判定ロジックは LINE/GAS 側のみ担当。このパスは常に event。
      //
      // date 補完の3分岐:
      //   ケースA: Gemini が date を null/空で返した（pDateEmpty=true）
      //            → selectedDate > today で補完し event 採用（本当に日付指定なし）
      //   ケースB: Gemini が date 文字列を返したが normalizer が YYYY-MM-DD に変換できなかった
      //            （pDateEmpty=false かつ normalizedDate===null）
      //            → 今の我々が読めない表現（例: 来週月曜/NEXT_MON 等）。
      //              today で勝手に補完すると誤登録になるため、
      //              元テキスト(text) を parseNaturalLanguageEvent にフォールバックする。
      //              正規表現で日付が取れればその日付、取れなければ today 補完（後続の regex フォールバック路で処理）。
      //   ケースC: normalizer が YYYY-MM-DD に変換成功（normalizedDate が非null）
      //            → そのまま採用（正常系・何もしない）
      if (p.title && normalizedDate === null) {
        if (pDateEmpty) {
          // ケースA: Gemini が日付を完全省略 → selectedDate/today 補完
          const fallbackDate = state.selectedDate
            ? formatDate(new Date(state.selectedDate))
            : today;
          normalizedDate = fallbackDate;
          console.info('[Gemini] date null(省略) → selectedDate/today で補完:', normalizedDate);
        } else {
          // ケースB: Gemini が日付文字列を返したが normalizer が読めなかった
          // → 元テキストの正規表現パーサーにフォールバックして日付を再取得する
          console.warn('[Gemini] date 文字列あり＆正規化失敗 → 正規表現フォールバック:', p.date);
          const regexResult = parseNaturalLanguageEvent(text);
          regexResult.registration_type = 'event';
          if (!regexResult._dateFound) {
            regexResult.date = state.selectedDate
              ? formatDate(new Date(state.selectedDate))
              : today;
            regexResult.allDay = true;
            console.info('[Gemini→regex] date未検出 → selectedDate/today 補完:', regexResult.date);
          }
          delete regexResult._dateFound;
          regexResult._engine = '⚙️ 正規表現パーサー(Gemini日付不明フォールバック)';
          return regexResult;
        }
      }
      if (p.title) {
        return {
          registration_type: 'event',
          title: p.title,
          category: p.category || '',
          date: normalizedDate,
          startTime: p.startTime || null,
          endTime: p.endTime || null,
          allDay: p.allDay ?? (!p.startTime),
          calendarKey: p.calendarKey || 'personal',
          location: p.location || '',
          meetUrl: p.meetUrl || null,
          description: p.description || '',
          _engine: '✨ Gemini 2.5 Flash'
        };
      }
      // normalizedDate === null → タイトルは Gemini のを保持しつつ正規表現フォールバックへ
      if (!p.title) { /* title もなければ素通りでフォールバック */ }
    }
  } catch (e) {
    console.warn('Gemini parse failed:', e.message);
  }

  // ② 正規表現パーサー（フォールバック）
  const result = parseNaturalLanguageEvent(text);
  // 予定追加欄経由なので日付が見つからなくても event を保証する。
  // date は selectedDate > today で補完し、calendar-register.js の !parsed.date 条件でタスク落ちしないようにする。
  result.registration_type = 'event';
  if (!result._dateFound) {
    result.date = state.selectedDate
      ? formatDate(new Date(state.selectedDate))
      : today;
    result.allDay = true;
    console.info('[regex] date未検出 → selectedDate/today で補完:', result.date);
  }
  delete result._dateFound;
  result._engine = '⚙️ 正規表現パーサー';

  // ③ Ollama（タイトルのみ補正）
  if (ollamaAvailable === null) await checkOllama();
  if (ollamaAvailable) {
    try {
      const llmTitle = await extractTitleWithLLM(text, result.title);
      if (llmTitle && llmTitle.length >= 2 && llmTitle.length <= 30) {
        result.title = llmTitle;
        result._engine = `🤖 ${OLLAMA_MODEL} + ⚙️ 正規表現`;
      }
    } catch (e) {
      console.warn('LLM title extraction failed:', e.message);
      ollamaAvailable = false;
    }
  }

  return result;
}
