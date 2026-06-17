// ★ 定数・設定値

// ★ アーカイブ設定
export const ARCHIVE_DELAY_MS = 4000;

// ★ カレンダー自動同期間隔（30秒）
export const SYNC_INTERVAL_MS = 30 * 1000;

// ★ Exponential backoff設定
export const SYNC_BACKOFF_BASE_MS = 30 * 1000;
export const SYNC_BACKOFF_MAX_MS = 5 * 60 * 1000;

// ★ Sheets同期間隔（1分）
export const SHEETS_SYNC_INTERVAL_MS = 1 * 60 * 1000;

// ★ ハピネッツ試合日（YYYY-MM-DD形式）
// ⚠️ 更新タイミング: ① 2026-27シーズン日程発表時  ② CSに進出した場合は即追記
// 2025-26レギュラーシーズン終了: 2026-05-03（CS日程は別途追記が必要）
export const HAPPINETS_GAME_DAYS = [
  // 2026年3月
  '2026-03-07','2026-03-08','2026-03-11','2026-03-14','2026-03-15','2026-03-28','2026-03-29',
  // 2026年4月
  '2026-04-01','2026-04-04','2026-04-05','2026-04-08','2026-04-11','2026-04-12',
  '2026-04-15','2026-04-18','2026-04-19','2026-04-22','2026-04-25','2026-04-26',
  // 2026年5月（レギュラーシーズン最終）
  '2026-05-02','2026-05-03',
  // TODO: CS進出時はここに日程を追加
];

// ★ 日付変更チェック間隔（1分）
export const DATE_CHECK_INTERVAL_MS = 60 * 1000;

// ★ カレンダー名マップ
export const CALENDAR_DISPLAY_NAMES = {
  personal: 'RYUI YAMADA（個人）',
  work: 'myAN_山田龍偉（仕事）'
};

// ★ 統計カラー
export const STATS_COLORS = {
  today:   '#f44336',
  soon:    '#ffc107',
  anytime: '#4a9eff',
  mbp:     '#4a9eff',
  mini:    '#9c5fff',
  ollama:  '#4caf50',
};
