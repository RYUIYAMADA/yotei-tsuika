/**
 * lib/gas-client.js — GAS createEvent POST クライアント
 *
 * 移植元: main/ipc/gas.js create-calendar-event ハンドラ
 *   - meetUrl を description 先頭に配置（URL保全・末尾切捨て禁止）
 *   - 10000字制限（アプリ本体 main/ipc/gas.js と同一値）
 *   - token を payload に含める
 *   - redirect: 'follow'
 */

const MAX_DESC = 10000;

/**
 * GAS へ予定を POST 登録する
 * @param {object} eventData   - 確認ポップアップで編集済みの予定データ
 * @param {string} gasWebAppUrl
 * @param {string} gasToken
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function createCalendarEvent(eventData, gasWebAppUrl, gasToken) {
  // meetUrl を description 先頭に配置（gas.js と同一ロジック）
  // - meetUrl がある場合: "meetUrl\n本文"（URL は絶対に切らない）
  // - 既に description 内に meetUrl が含まれる場合は先頭付与しない（重複防止）
  // - 上限超過時は本文側を後ろから切り詰める
  const descBody = eventData.description || '';
  const meetUrl  = eventData.meetUrl || '';
  const urlPrefix = (meetUrl && !descBody.includes(meetUrl))
    ? meetUrl + '\n'
    : '';
  const bodyLimit = Math.max(0, MAX_DESC - urlPrefix.length);
  const descRaw = urlPrefix + descBody.slice(0, bodyLimit);

  const payload = {
    action:      'createEvent',
    title:       eventData.title      || '',
    date:        eventData.date       || '',
    startTime:   eventData.startTime  || '',
    endTime:     eventData.endTime    || '',
    allDay:      String(eventData.allDay || false),
    calendarKey: eventData.calendarKey || 'personal',
    location:    eventData.location   || '',
    description: descRaw
  };

  // token が設定されている場合のみ付与（GAS側はfail-closed: token不一致・未設定で必ずunauthorized）
  if (gasToken) payload.token = gasToken;

  const res = await fetch(gasWebAppUrl, {
    method:   'POST',
    headers:  { 'Content-Type': 'application/json' },
    body:     JSON.stringify(payload),
    redirect: 'follow'
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GAS POST error: ${res.status} ${errText.substring(0, 200)}`);
  }

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_parseErr) {
    throw new Error(`GAS レスポンスがJSONでない（HTMLエラーページの可能性）: ${raw.slice(0, 120)}`);
  }

  if (typeof data.success !== 'boolean') {
    throw new Error(`GAS レスポンス形式不正: ${JSON.stringify(data).substring(0, 100)}`);
  }

  return data;
}
