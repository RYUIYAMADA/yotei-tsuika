/**
 * parseNaturalLanguageEvent Jest テスト
 * スキップ理由: 既知の不一致（Phase 5 で解消予定） — 0件
 *
 * 変換元:
 *   - tests/parser-test.js A-C ブロック（140件）
 *   - tests/adversarial-cases.js D ブロック（100件）
 *   - tests/parser-test.js E ブロック（70件）
 *   合計: 310件
 *
 * 基準日: 2026-04-08（水曜）固定 — 実行日依存なし
 * ※ adversarial-test.js のヘッダー TODAY=2026-04-07 はバグ。
 *    adversarial-cases.js の期待値は 2026-04-08 水曜基準で記述されている。
 */

'use strict';

const { loadParser } = require('./helpers/load-parser');

// ─── 基準日固定（実行日に依存しない）─────────────────────
const FIXED_TODAY   = '2026-04-08T10:00:00'; // 水曜
const TODAY_STR     = '2026-04-08';
const TOMORROW_STR  = '2026-04-09';
const DAY_AFTER_STR = '2026-04-10';

let parse;

beforeAll(() => {
  const { parseNaturalLanguageEvent } = loadParser({
    selectedDate: new Date(FIXED_TODAY),
    fixedToday: FIXED_TODAY,
  });
  parse = parseNaturalLanguageEvent;
});

// ─── テスト実行ヘルパー ──────────────────────────────────
function runCase(tc) {
  const result = parse(tc.input);
  for (const [key, expected] of Object.entries(tc.expect)) {
    expect(result[key]).toBe(expected);
  }
}

// ============================================================
// A-C ブロック（parser-test.js 元の 01〜C40 = 140件）
// ============================================================
describe('A-C: 基本・シンプル〜複合パターン', () => {
  const cases = [
  // ─── 基本・シンプル ───────────────────────────────────────
  {
    label: '01_シンプル: 明日14時 打ち合わせ',
    input: '明日14時 打ち合わせ',
    expect: { title: '打ち合わせ', date: TOMORROW_STR, startTime: '14:00', endTime: '15:00', calendarKey: 'work' }
  },
  {
    label: '02_シンプル: 今日10時 歯医者',
    input: '今日10時 歯医者',
    expect: { title: '歯医者', date: TODAY_STR, startTime: '10:00' }
  },
  {
    label: '03_シンプル: 明後日 ランチ',
    input: '明後日 ランチ',
    expect: { title: 'ランチ', date: DAY_AFTER_STR, allDay: true }
  },

  // ─── 時刻パターン ─────────────────────────────────────────
  {
    label: '04_時刻: 3時半 MTG',
    input: '3時半 MTG',
    expect: { title: 'MTG', startTime: '15:30', endTime: '16:30', calendarKey: 'work' }
  },
  {
    label: '05_時刻: 午後3時 面談',
    input: '午後3時 面談',
    expect: { title: '面談', startTime: '15:00', endTime: '16:00', calendarKey: 'work' }
  },
  {
    label: '06_時刻: 午前9時30分 朝礼',
    input: '午前9時30分 朝礼',
    expect: { title: '朝礼', startTime: '09:30' }
  },
  {
    label: '07_時刻: 14:00～16:00 会議',
    input: '14:00～16:00 会議',
    expect: { title: '会議', startTime: '14:00', endTime: '16:00', calendarKey: 'work' }
  },
  {
    label: '08_時刻: 14時～16時 打ち合わせ',
    input: '14時～16時 打ち合わせ',
    expect: { title: '打ち合わせ', startTime: '14:00', endTime: '16:00' }
  },
  {
    label: '09_時刻: 午前10時～午後2時 ハピネッツ会議',
    input: '午前10時～午後2時 ハピネッツ会議',
    expect: { startTime: '10:00', endTime: '14:00', calendarKey: 'work' }
  },
  {
    label: '10_時刻: 午後2時半～3時半 MTG',
    input: '午後2時半～3時半 MTG',
    expect: { startTime: '14:30', endTime: '15:30' }
  },
  {
    label: '11_時刻: 9時～17時（8は午後ではない）',
    input: '9時～17時 研修',
    expect: { startTime: '09:00', endTime: '17:00' }
  },
  {
    label: '12_時刻: PM3:00 打合せ',
    input: 'PM3:00 打合せ',
    expect: { startTime: '15:00' }
  },
  {
    label: '13_時刻: 終日（時間なし）',
    input: '明日 健康診断',
    expect: { title: '健康診断', allDay: true }
  },

  // ─── 日付パターン ─────────────────────────────────────────
  {
    label: '14_日付: 4月10日 14時 営業商談',
    input: '4月10日 14時 営業商談',
    expect: { date: '2026-04-10', startTime: '14:00', title: '営業商談' }
  },
  {
    label: '15_日付: 2026年4月15日 発表会',
    input: '2026年4月15日 発表会',
    expect: { date: '2026-04-15', title: '発表会' }
  },
  {
    label: '16_日付: 来週月曜 10時 朝礼',
    input: '来週月曜 10時 朝礼',
    expect: { date: '2026-04-13', startTime: '10:00', title: '朝礼' }
  },
  {
    label: '17_日付: 来週金曜 営業',
    input: '来週金曜 営業',
    expect: { date: '2026-04-17' }
  },
  {
    label: '18_日付: 再来週火曜 セミナー',
    input: '再来週火曜 セミナー',
    expect: { date: '2026-04-21' }
  },
  {
    label: '19_日付: 今週木曜 打ち合わせ（今日=火なので今週木=4/9）',
    input: '今週木曜 打ち合わせ',
    expect: { date: '2026-04-09' }
  },
  {
    label: '20_日付: 今週月曜（今日=火なので今週月=4/6、過去日）',
    input: '今週月曜 勉強会',
    expect: { date: '2026-04-06' }
  },
  {
    label: '21_日付: 水曜日 面談（直近の水=今日4/8）',
    input: '水曜日 面談',
    expect: { date: TODAY_STR }
  },
  {
    label: '22_日付: 15日 打ち合わせ（直近の15日=4/15）',
    input: '15日 打ち合わせ',
    expect: { date: '2026-04-15' }
  },
  {
    label: '23_日付: 3/19（来年にならないこと確認）',
    input: '3月19日 飲み会',
    expect: { date: '2027-03-19' } // 過去なので来年
  },

  // ─── タイトル抽出 ─────────────────────────────────────────
  {
    label: '24_タイトル: 件名フィールド優先',
    input: '件名: チケット販売会議\n4月10日 14:00',
    expect: { title: 'チケット販売会議', date: '2026-04-10' }
  },
  {
    label: '25_タイトル: イベントサフィックス抽出（懇親会）',
    input: '明日19時 ハピネッツ懇親会',
    expect: { title: 'ハピネッツ懇親会', startTime: '19:00' }
  },
  {
    label: '26_タイトル: イベントサフィックス抽出（講習会）',
    input: '4月15日 審判講習会',
    expect: { title: '審判講習会' }
  },
  {
    label: '27_タイトル: 挨拶文除去',
    input: 'お疲れ様です。\n明日14時から打ち合わせがあります。',
    expect: { startTime: '14:00', date: TOMORROW_STR }
  },
  {
    label: '28_タイトル: 装飾記号除去（━━━等）',
    input: '━━━━━━\n明日10時 朝礼\n━━━━━━',
    expect: { title: '朝礼', startTime: '10:00' }
  },
  {
    label: '29_タイトル: 曜日注釈（括弧）除去',
    input: '4月10日(木) 14時 MTG',
    expect: { title: 'MTG', date: '2026-04-10', startTime: '14:00' }
  },
  {
    label: '30_タイトル: 年除去してタイトル残す',
    input: '2026年4月10日 商談',
    expect: { title: '商談', date: '2026-04-10' }
  },

  // ─── 場所抽出 ─────────────────────────────────────────────
  {
    label: '31_場所: 場所フィールド',
    input: '明日14時 会議\n場所: 秋田ノーザンゲートスクエア',
    expect: { location: '秋田ノーザンゲートスクエア' }
  },
  {
    label: '32_場所: @パターン',
    input: '明日14時 打ち合わせ @秋田市役所',
    expect: { location: '秋田市役所' }
  },
  {
    label: '33_場所: にてパターン',
    input: '4月10日 東京ビッグサイトにて展示会',
    expect: { location: '東京ビッグサイト' }
  },

  // ─── カレンダー振り分け ───────────────────────────────────
  {
    label: '34_カレンダー: ハピネッツ→work',
    input: '明日 ハピネッツ会議',
    expect: { calendarKey: 'work' }
  },
  {
    label: '35_カレンダー: MTG→work',
    input: '明日14時 MTG',
    expect: { calendarKey: 'work' }
  },
  {
    label: '36_カレンダー: 飲み会→personal',
    input: '明日19時 飲み会',
    expect: { calendarKey: 'personal' }
  },
  {
    label: '37_カレンダー: 歯医者→personal',
    input: '明日10時 歯医者',
    expect: { calendarKey: 'personal' }
  },
  {
    label: '38_カレンダー: 撮影→work',
    input: '明日 撮影',
    expect: { calendarKey: 'work' }
  },
  {
    label: '39_カレンダー: 採用面接→work',
    input: '明日14時 採用面接',
    expect: { calendarKey: 'work' }
  },
  {
    label: '40_カレンダー: スポンサー商談→work',
    input: '来週月曜 スポンサー商談',
    expect: { calendarKey: 'work' }
  },

  // ─── Googleカレンダーコピペ ───────────────────────────────
  {
    label: '41_コピペ: Meet URL付き',
    input: '明日14時 定例MTG\nhttps://meet.google.com/abc-defg-hij',
    expect: { title: '定例MTG', meetUrl: 'https://meet.google.com/abc-defg-hij' }
  },
  {
    label: '42_コピペ: ビデオ通話テキスト除去',
    input: 'ビデオ通話のリンク: https://meet.google.com/abc-xyz\n明日10時 朝礼',
    expect: { title: '朝礼', startTime: '10:00' }
  },
  {
    label: '43_コピペ: Googleカレンダー形式',
    input: '件名: チケット販売会議\n場所: 秋田ノーザンゲートスクエア2F\n4月10日(木) 14:00～16:00',
    expect: {
      title: 'チケット販売会議',
      location: '秋田ノーザンゲートスクエア2F',
      date: '2026-04-10',
      startTime: '14:00',
      endTime: '16:00'
    }
  },
  {
    label: '44_コピペ: 挨拶+本文',
    input: 'お疲れ様です。\n以下の通りご案内いたします。\n4月15日(水) 15:00 セミナー',
    expect: { date: '2026-04-15', startTime: '15:00' }
  },
  {
    label: '45_コピペ: 詳細を表示テキスト除去',
    input: '明日 14時 MTG\n詳細を表示',
    expect: { title: 'MTG', startTime: '14:00' }
  },

  // ─── 複雑なケース ─────────────────────────────────────────
  {
    label: '46_複雑: 時刻+日付が混在（日付優先）',
    input: '4月10日 14:00 営業商談',
    expect: { date: '2026-04-10', startTime: '14:00', title: '営業商談' }
  },
  {
    label: '47_複雑: 「まで」含む日付（締切→除外してほしい）',
    input: '締切: 4月10日まで\n来週月曜 打ち合わせ',
    expect: { date: '2026-04-13' }
  },
  {
    label: '48_複雑: 全角コロン時刻',
    input: '明日 14：00 MTG',
    expect: { startTime: '14:00' }
  },
  {
    label: '49_複雑: 時刻なし終日（allDay=true）',
    input: '4月10日 健康診断',
    expect: { date: '2026-04-10', allDay: true }
  },
  {
    label: '50_複雑: 長文コピペ（タイトルだけ取れればOK）',
    input: `お疲れ様です。
以下の内容でご連絡いたします。

■ ハピネッツ営業会議
━━━━━━━━━━
日　時：4月10日(木) 14:00〜16:00
場　所：秋田ノーザンゲートスクエア2F
━━━━━━━━━━
よろしくお願いいたします。`,
    expect: {
      startTime: '14:00',
      endTime: '16:00',
      date: '2026-04-10',
      calendarKey: 'work'
    }
  },
  {
    label: '51_複雑: 曜日+時刻+タイトル',
    input: '木曜日 15時 クライアント訪問',
    expect: { date: '2026-04-09', startTime: '15:00', title: 'クライアント訪問' }
  },
  {
    label: '52_複雑: 「〜」だけの終了時刻',
    input: '明日10時〜 朝礼',
    expect: { startTime: '10:00', date: TOMORROW_STR }
  },
  {
    label: '53_複雑: 半角スペースなしで時刻+タイトル',
    input: '明日14時打ち合わせ',
    expect: { startTime: '14:00', date: TOMORROW_STR }
  },
  {
    label: '54_複雑: 月曜始まりの今週（今日=火=4/7）',
    input: '今週土曜 ゴルフ',
    expect: { date: '2026-04-11' }
  },
  {
    label: '55_複雑: 再来週水曜',
    input: '再来週水曜 商談',
    expect: { date: '2026-04-22' }
  },

  // ─── エッジケース ─────────────────────────────────────────
  {
    label: '56_エッジ: 数字のみのタイトル回避（14を時刻認識する）',
    input: '明日14時 MTG（14名参加）',
    expect: { startTime: '14:00' }
  },
  {
    label: '57_エッジ: 8時（午後推定対象外=8:00のまま）',
    input: '明日8時 朝礼',
    expect: { startTime: '08:00' }
  },
  {
    label: '58_エッジ: 12時（午後12時=正午）',
    input: '明日12時 ランチ',
    expect: { startTime: '12:00' }
  },
  {
    label: '59_エッジ: 0時（深夜）',
    input: '明日0時 深夜作業',
    expect: { startTime: '00:00' }
  },
  {
    label: '60_エッジ: 空文字に近い（最低限タイトルを返す）',
    input: '明日',
    expect: { date: TOMORROW_STR }
  },

  // ─── LINEから来るような短文 ──────────────────────────────
  {
    label: '61_LINE: 「明日14時MTG」（スペースなし）',
    input: '明日14時MTG',
    expect: { date: TOMORROW_STR, startTime: '14:00' }
  },
  {
    label: '62_LINE: 「来週月曜午後3時打合せ」',
    input: '来週月曜午後3時打合せ',
    expect: { date: '2026-04-13', startTime: '15:00' }
  },
  {
    label: '63_LINE: 「4/10 14:00 営業」',
    input: '4/10 14:00 営業',
    expect: { date: '2026-04-10', startTime: '14:00' }
  },
  {
    label: '64_LINE: 「木曜午後2時半から面談」',
    input: '木曜午後2時半から面談',
    expect: { date: '2026-04-09', startTime: '14:30', title: '面談' }
  },
  {
    label: '65_LINE: 「今週金曜19時飲み会」',
    input: '今週金曜19時飲み会',
    expect: { date: '2026-04-10', startTime: '19:00' }
  },

  // ─── タイトル精度 ─────────────────────────────────────────
  {
    label: '66_タイトル精度: 助詞だけ残らないか',
    input: '明日14時に打ち合わせがあります',
    expect: { title: '打ち合わせ' }
  },
  {
    label: '67_タイトル精度: 「の」で始まるタイトル防止',
    input: '明日の14時から会議です',
    expect: { startTime: '14:00' }
  },
  {
    label: '68_タイトル精度: 複数スペース→1つに',
    input: '明日  14時   MTG',
    expect: { title: 'MTG', startTime: '14:00' }
  },
  {
    label: '69_タイトル精度: 区切り文字（|）除去',
    input: '明日14時 | MTG | 第1会議室',
    expect: { startTime: '14:00' }
  },
  {
    label: '70_タイトル精度: 全角スペース対応',
    input: '明日　14時　MTG',
    expect: { title: 'MTG', startTime: '14:00' }
  },

  // ─── 時刻の境界値 ─────────────────────────────────────────
  {
    label: '71_時刻境界: 1時→13時（午後推定）',
    input: '明日1時 打ち合わせ',
    expect: { startTime: '13:00', endTime: '14:00' }
  },
  {
    label: '72_時刻境界: 7時→19時（午後推定）',
    input: '明日7時 夕礼',
    expect: { startTime: '19:00' }
  },
  {
    label: '73_時刻境界: 23時（そのまま）',
    input: '明日23時 深夜作業',
    expect: { startTime: '23:00' }
  },
  {
    label: '74_時刻境界: 午前7時（AM指定でそのまま）',
    input: '明日午前7時 朝練',
    expect: { startTime: '07:00' }
  },
  {
    label: '75_時刻境界: 17時→そのまま（8以上は変換しない）',
    input: '明日17時 退社',
    expect: { startTime: '17:00' }
  },

  // ─── 複数日・長い入力 ─────────────────────────────────────
  {
    label: '76_複数日: 最初の日付を取得',
    input: '4月10日～12日 合宿\n場所: 秋田市',
    expect: { date: '2026-04-10' }
  },
  {
    label: '77_複数日: 年またぎ',
    input: '2026年12月31日 大晦日パーティー',
    expect: { date: '2026-12-31' }
  },
  {
    label: '78_複数日: 1月（来年）',
    input: '1月5日 新年会',
    expect: { date: '2027-01-05' }
  },

  // ─── キーワード振り分け精度 ──────────────────────────────
  {
    label: '79_振り分け: 研修会→work',
    input: '来週月曜 新入社員研修会',
    expect: { calendarKey: 'work' }
  },
  {
    label: '80_振り分け: 入稿→work',
    input: '明日 入稿作業',
    expect: { calendarKey: 'work' }
  },
  {
    label: '81_振り分け: コンペ→work',
    input: '4月10日 デザインコンペ',
    expect: { calendarKey: 'work' }
  },
  {
    label: '82_振り分け: 映画→personal',
    input: '明日19時 映画',
    expect: { calendarKey: 'personal' }
  },
  {
    label: '83_振り分け: 病院→personal',
    input: '明日10時 病院',
    expect: { calendarKey: 'personal' }
  },

  // ─── 実用ケース ───────────────────────────────────────────
  {
    label: '84_実用: Zoom会議',
    input: '明日14時 Zoom会議\nhttps://zoom.us/j/123456789',
    expect: { startTime: '14:00', meetUrl: 'https://zoom.us/j/123456789' }
  },
  {
    label: '85_実用: チケット配布会議',
    input: '来週木曜 14時 チケット配布方針会議',
    expect: { date: '2026-04-16', startTime: '14:00', calendarKey: 'work' }
  },
  {
    label: '86_実用: ハピネッツ試合観戦（個人）',
    input: '4月10日 ハピネッツvs熊本',
    expect: { date: '2026-04-10', calendarKey: 'work' }
  },
  {
    label: '87_実用: 写真撮影依頼',
    input: '来週土曜 撮影 @秋田銀行',
    expect: { date: '2026-04-18', calendarKey: 'work', location: '秋田銀行' } // 来週土曜=来週の月曜基準で4/18
  },
  {
    label: '88_実用: freee経費精算',
    input: '明日 freee経費精算',
    expect: { date: TOMORROW_STR }
  },
  {
    label: '89_実用: 来週火曜15時から2時間商談',
    input: '来週火曜15時から2時間商談',
    expect: { date: '2026-04-14', startTime: '15:00', calendarKey: 'work' }
  },
  {
    label: '90_実用: 「〜17時まで会議」',
    input: '明日10時〜17時 全体会議',
    expect: { startTime: '10:00', endTime: '17:00' }
  },

  // ─── クリーンアップ確認 ───────────────────────────────────
  {
    label: '91_クリーン: 空の括弧が残らない',
    input: '明日14時 MTG()',
    expect: { title: 'MTG' }
  },
  {
    label: '92_クリーン: 句読点が残らない',
    input: '明日、14時に、打ち合わせ。',
    expect: { startTime: '14:00' }
  },
  {
    label: '93_クリーン: 全角スペース混じり',
    input: '明日　14時　打ち合わせ',
    expect: { title: '打ち合わせ', startTime: '14:00' }
  },
  {
    label: '94_クリーン: 年号だけのゴミが残らない',
    input: '2026年4月10日 14時 商談',
    expect: { title: '商談', date: '2026-04-10' }
  },

  // ─── 音声入力ゆらぎ ───────────────────────────────────────
  {
    label: '95_音声: 「あした じゅうよじ うちあわせ」',
    input: 'あした 14時 うちあわせ',
    expect: { date: TOMORROW_STR, startTime: '14:00' }
  },
  {
    label: '96_音声: 「きょう ごご さんじ めんだん」',
    input: 'きょう 午後3時 面談',
    expect: { date: TODAY_STR, startTime: '15:00' }
  },

  // ─── 特殊入力 ─────────────────────────────────────────────
  {
    label: '97_特殊: URLのみ（タイトルフォールバック）',
    input: 'https://meet.google.com/abc-xyz',
    expect: { meetUrl: 'https://meet.google.com/abc-xyz' }
  },
  {
    label: '98_特殊: 数字だけ',
    input: '14',
    expect: {} // クラッシュしないことを確認
  },
  {
    label: '99_特殊: 絵文字付き',
    input: '明日14時🗓 MTG',
    expect: { startTime: '14:00', date: TOMORROW_STR }
  },
  {
    label: '100_特殊: 超長文（100文字超）',
    input: '秋田ノーザンハピネッツ関係者各位\nお疲れ様です。来週月曜日午後2時より、秋田ノーザンゲートスクエア2Fにてハピネッツスポンサー営業会議を開催いたします。ご参加よろしくお願いいたします。',
    expect: { date: '2026-04-13', startTime: '14:00', calendarKey: 'work' }
  },

  // ════════════════════════════════════════════════════════════
  // 複合パターン40問（日付×時刻×タイトル×場所×カレンダー 全組み合わせ）
  // ════════════════════════════════════════════════════════════

  // ─── A. 挨拶+日付+時刻+タイトル ─────────────────────────────
  {
    label: 'C01_複合: 挨拶+来週月曜+午後+打ち合わせ',
    input: 'お疲れ様です。来週月曜日午後3時から打ち合わせをお願いします。',
    expect: { date: '2026-04-13', startTime: '15:00', calendarKey: 'work' }
  },
  {
    label: 'C02_複合: 挨拶+再来週水曜+午前+MTG+場所',
    input: 'お疲れさまです。再来週水曜日の午前10時よりMTGを@秋田市役所で行います。',
    expect: { date: '2026-04-22', startTime: '10:00', calendarKey: 'work', location: '秋田市役所' }
  },
  {
    label: 'C03_複合: 挨拶+今週金曜+時間範囲+会議+場所フィールド',
    input: 'お疲れ様です。今週金曜14時〜16時に営業会議を行います。\n場所: 秋田ノーザンゲートスクエア2F',
    expect: { date: '2026-04-10', startTime: '14:00', endTime: '16:00', calendarKey: 'work', location: '秋田ノーザンゲートスクエア2F' }
  },
  {
    label: 'C04_複合: 挨拶+絶対日付+午後半+撮影+場所',
    input: 'お疲れ様です。4月15日(水)午後2時半から撮影があります。@秋田銀行前',
    expect: { date: '2026-04-15', startTime: '14:30', calendarKey: 'work', location: '秋田銀行前' }
  },
  {
    label: 'C05_複合: 以下の通り+曜日+時刻+セミナー',
    input: '以下の通りご案内いたします。\n木曜日15時〜17時 審判講習会',
    expect: { date: '2026-04-09', startTime: '15:00', endTime: '17:00' }
  },

  // ─── B. Googleカレンダーコピペ形式 ──────────────────────────
  {
    label: 'C06_複合: GCal形式+件名+場所+日付範囲',
    input: '件名: ハピネッツスポンサー商談\n場所: 秋田ノーザンゲートスクエア2F\n4月10日(木) 14:00〜16:00',
    expect: { title: 'ハピネッツスポンサー商談', date: '2026-04-10', startTime: '14:00', endTime: '16:00', calendarKey: 'work', location: '秋田ノーザンゲートスクエア2F' }
  },
  {
    label: 'C07_複合: GCal形式+Meet URL+日付+時刻',
    input: '件名: 定例MTG\n4月15日 15:00〜16:00\nhttps://meet.google.com/abc-xyz-def',
    expect: { title: '定例MTG', date: '2026-04-15', startTime: '15:00', meetUrl: 'https://meet.google.com/abc-xyz-def' }
  },
  {
    label: 'C08_複合: GCal形式+ビデオ通話テキスト+曜日+時刻',
    input: 'ビデオ通話のリンク: https://zoom.us/j/999\n来週火曜 午後2時 チームMTG',
    expect: { date: '2026-04-14', startTime: '14:00', calendarKey: 'work', meetUrl: 'https://zoom.us/j/999' }
  },
  {
    label: 'C09_複合: GCal曜日注釈+全角時刻+タイトル',
    input: '4月20日(月) 14：00〜15：30 スポンサー提案',
    expect: { date: '2026-04-20', startTime: '14:00', endTime: '15:30', calendarKey: 'work' }
  },
  {
    label: 'C10_複合: 装飾線+時刻+タイトル+場所',
    input: '━━━━━━━\n明日15時〜 営業訪問\n場所: 大館市役所\n━━━━━━━',
    expect: { date: TOMORROW_STR, startTime: '15:00', calendarKey: 'work', location: '大館市役所' }
  },

  // ─── C. 長文・複数情報混在 ────────────────────────────────
  {
    label: 'C11_複合: 長文+挨拶+区切り+全フィールド',
    input: `各位
お疲れ様です。以下の通りご連絡いたします。
━━━━━━━━━━
■ハピネッツ入場者数分析会議
日　時：4月16日(木) 14:00〜15:30
場　所：秋田ノーザンゲートスクエア3F
━━━━━━━━━━
よろしくお願いいたします。`,
    expect: { date: '2026-04-16', startTime: '14:00', endTime: '15:30', calendarKey: 'work' }
  },
  {
    label: 'C12_複合: 長文+Zoom+来週曜日+午前午後跨ぎ',
    input: `お疲れ様です。
来週木曜日 午前10時〜午後1時 採用面接を行います。
https://zoom.us/j/123456`,
    expect: { date: '2026-04-16', startTime: '10:00', endTime: '13:00', calendarKey: 'work', meetUrl: 'https://zoom.us/j/123456' }
  },
  {
    label: 'C13_複合: 長文+複数挨拶行+セミナー',
    input: `関係者各位
お疲れ様です。
ご確認ください。
4月22日(水) 13:00 新人研修会`,
    expect: { date: '2026-04-22', startTime: '13:00', calendarKey: 'work' }
  },
  {
    label: 'C14_複合: 長文+今週金曜+半+MTG+場所',
    input: '今週金曜日の午後3時半からスポンサーMTGがあります。会場は秋田ノーザンゲートスクエアです。',
    expect: { date: '2026-04-10', startTime: '15:30', calendarKey: 'work' }
  },
  {
    label: 'C15_複合: 長文+絶対日付+時間範囲+販売戦略MTG',
    input: '5月1日(金) 10:00〜12:00 チケット販売戦略MTGを行います。場所: 会議室A',
    expect: { date: '2026-05-01', startTime: '10:00', endTime: '12:00', calendarKey: 'work', location: '会議室A' }
  },

  // ─── D. 音声入力ゆらぎ×複合 ─────────────────────────────
  {
    label: 'C16_複合: 音声+あした+午後+半+打ち合わせ',
    input: 'あした ごご さんじはん うちあわせ',
    expect: { date: TOMORROW_STR }
    // 音声入力は誤変換が多いので日付だけ確認
  },
  {
    label: 'C17_複合: 音声+来週月曜+午前+採用面接',
    input: 'らいしゅうげつようびごぜんじゅうじさいようめんせつ',
    expect: {} // クラッシュしないことだけ確認
  },
  {
    label: 'C18_複合: 半角+全角混在+日付+時刻',
    input: '明日　１４時〜１６時　MTG',
    // 全角数字は未対応なのでallDay想定（クラッシュしないこと）
    expect: { date: TOMORROW_STR }
  },
  {
    label: 'C19_複合: 句読点だらけ+日付+時刻',
    input: '明日、14時に、打ち合わせ、があります。よろしくお願いします。',
    expect: { date: TOMORROW_STR, startTime: '14:00' }
  },
  {
    label: 'C20_複合: 記号区切り+日付+時刻+タイトル',
    input: '4月10日｜14:00〜15:00｜営業商談｜秋田市内',
    expect: { date: '2026-04-10', startTime: '14:00', endTime: '15:00', calendarKey: 'work' }
  },

  // ─── E. 時刻の境界×カレンダー振り分け ──────────────────
  {
    label: 'C21_複合: 1時（午後推定13時）+仕事キーワード',
    input: '明日1時 スポンサー商談',
    expect: { date: TOMORROW_STR, startTime: '13:00', calendarKey: 'work' }
  },
  {
    label: 'C22_複合: 7時半（午後推定19:30）+個人',
    input: '今日7時半 夕食会',
    expect: { date: TODAY_STR, startTime: '19:30' }
  },
  {
    label: 'C23_複合: 午前7時（指定あり=7:00）+撮影',
    input: '明日午前7時 撮影スタート',
    expect: { date: TOMORROW_STR, startTime: '07:00', calendarKey: 'work' }
  },
  {
    label: 'C24_複合: 0時（深夜）+タイトル',
    input: '明日0時 深夜配信',
    expect: { date: TOMORROW_STR, startTime: '00:00' }
  },
  {
    label: 'C25_複合: 12時（正午）+ランチMTG',
    input: '来週火曜12時 ランチMTG',
    expect: { date: '2026-04-14', startTime: '12:00', calendarKey: 'work' }
  },
  {
    label: 'C26_複合: 午前AM混在+研修',
    input: '来週月曜 AM9時〜PM5時 全日研修',
    expect: { date: '2026-04-13', startTime: '09:00', endTime: '17:00', calendarKey: 'work' }
  },
  {
    label: 'C27_複合: 時刻範囲+仕事多重キーワード',
    input: '4月15日 9:00〜18:00 ハピネッツ大館遠征 撮影',
    expect: { date: '2026-04-15', startTime: '09:00', endTime: '18:00', calendarKey: 'work' }
  },
  {
    label: 'C28_複合: 今週土曜+夜+個人',
    input: '今週土曜19時 友人と飲み会',
    expect: { date: '2026-04-11', startTime: '19:00', calendarKey: 'personal' }
  },
  {
    label: 'C29_複合: 再来週木曜+終日+展示会',
    input: '再来週木曜 終日 展示会',
    expect: { date: '2026-04-23', allDay: true, calendarKey: 'work' }
  },
  {
    label: 'C30_複合: 曜日+午後+半+場所+face to face',
    input: '金曜 午後2時半 面談 @市役所',
    expect: { date: '2026-04-10', startTime: '14:30', calendarKey: 'work', location: '市役所' }
  },

  // ─── F. タイトル精度×複合 ────────────────────────────────
  {
    label: 'C31_複合: イベントサフィックス+日付+時刻+場所',
    input: '4月20日(月) 14時 秋田県ボート審判講習会\n場所: 秋田県立中央公園',
    expect: { date: '2026-04-20', startTime: '14:00', location: '秋田県立中央公園' }
  },
  {
    label: 'C32_複合: 挨拶+件名フィールド+来週日付+時刻',
    input: 'お疲れ様です。\n件名: チケット配布会議\n来週水曜 14:00〜15:30',
    expect: { title: 'チケット配布会議', date: '2026-04-15', startTime: '14:00', endTime: '15:30', calendarKey: 'work' }
  },
  {
    label: 'C33_複合: 装飾記号+サフィックス検索+絶対日付',
    input: '★ 4月25日(土) 13時 ハピネッツ壮行会 ★',
    expect: { date: '2026-04-25', startTime: '13:00', calendarKey: 'work' }
  },
  {
    label: 'C34_複合: 挨拶行+装飾+多行+全フィールド',
    input: `お疲れ様です。
■ 内容: ハピネッツスポンサー説明会
日時: 4月18日(土) 10:00〜12:00
場所: 秋田ノーザンゲートスクエア1F`,
    expect: { date: '2026-04-18', startTime: '10:00', endTime: '12:00', calendarKey: 'work' }
  },
  {
    label: 'C35_複合: 挨拶+以下の通り同行+来週+午後半',
    input: 'お疲れ様です。以下の通りご案内いたします。\n来週火曜午後3時半より採用面接があります。',
    expect: { date: '2026-04-14', startTime: '15:30', calendarKey: 'work' }
  },

  // ─── G. 実務でよく来るパターン ──────────────────────────
  {
    label: 'C36_複合: フル複合（挨拶+長文+件名+場所+Meet+日付+時刻）',
    input: `お疲れ様です。関係者各位
件名: ハピネッツ営業戦略MTG
日時: 来週月曜日 午前10時〜正午
場所: 秋田ノーザンゲートスクエア2F 会議室
https://meet.google.com/zyx-wvu-tsr
よろしくお願いします。`,
    expect: { title: 'ハピネッツ営業戦略MTG', date: '2026-04-13', startTime: '10:00', calendarKey: 'work', meetUrl: 'https://meet.google.com/zyx-wvu-tsr' }
  },
  {
    label: 'C37_複合: LINEコピペ+来週金曜+午後+商談+場所',
    input: '来週金曜午後2時から大館で営業商談があります。お客様先: 大館市内企業',
    expect: { date: '2026-04-17', startTime: '14:00', calendarKey: 'work' }
  },
  {
    label: 'C38_複合: 短文音声入力+来週月曜+時刻+タイトル',
    input: '来週月曜10時MTG',
    expect: { date: '2026-04-13', startTime: '10:00', calendarKey: 'work' }
  },
  {
    label: 'C39_複合: 年月日+曜日注釈+午後+半+キーワード複数',
    input: '2026年4月16日(木) 午後1時半〜3時 ハピネッツチケット販売会議 @Zoom',
    expect: { date: '2026-04-16', startTime: '13:30', endTime: '15:00', calendarKey: 'work' }
  },
  {
    label: 'C40_複合: 最大複合（全5要素+Zoomリンク+挨拶）',
    input: `お疲れ様です。
件名: myAN集客分析MTG
日時: 再来週火曜日 午前10時〜午後12時
場所: 秋田ノーザンゲートスクエア2F
https://zoom.us/j/987654321
以上です。よろしくお願いいたします。`,
    expect: { title: 'myAN集客分析MTG', date: '2026-04-21', startTime: '10:00', calendarKey: 'work', meetUrl: 'https://zoom.us/j/987654321' }
  },
  ];

  for (const tc of cases) {
    test(tc.label, () => runCase(tc));
  }
});

// ============================================================
// D ブロック（adversarial-cases.js 意地悪テスト = 100件）
// 基準日: 2026-04-08 水曜
// ============================================================
describe('D: adversarial（意地悪テスト）', () => {
  const cases = [

  // ================================================================
  // カテゴリA: 時間量・相対時刻の誤検出（D01〜D12）
  // ================================================================
  {
    label: 'D01_時間量誤検出: 「2時間」が2時(14時)と誤検出されないか',
    input: '明日 2時間の研修',
    expect: { date: '2026-04-09', allDay: true, title: '研修' }
    // 「2時間」は時刻ではなく時間量なので startTime は null であるべき
  },
  {
    label: 'D02_時間量誤検出: 「3時間後」がパース時に時刻化されないか',
    input: '3時間後に打ち合わせ',
    expect: { allDay: true }
    // 「3時間後」は相対時刻→未実装。startTime=nullが正しい
  },
  {
    label: 'D03_時間量誤検出: 「1時間」を含むタイトル',
    input: '明日10時 1時間の面談',
    expect: { date: '2026-04-09', startTime: '10:00', endTime: '11:00' }
    // 「1時間」→ 13時と誤検出せず、endTimeは10+1=11:00が理想
  },
  {
    label: 'D04_時間量誤検出: 「約2時間」を含む',
    input: '来週月曜 13時から約2時間の勉強会',
    expect: { date: '2026-04-13', startTime: '13:00' }
    // 「2時間」が14時とは誤検出しないこと
  },
  {
    label: 'D05_時間量誤検出: 「2時間半」が2時半(14:30)と誤検出されないか',
    input: '4月10日 10時から2時間半の研修',
    expect: { date: '2026-04-10', startTime: '10:00' }
  },
  {
    label: 'D06_時間量誤検出: 「所要時間1時間30分」',
    input: '明日 所要時間1時間30分 健康診断',
    expect: { date: '2026-04-09', allDay: true }
    // 「1時間30分」を13:30と誤検出しないか
  },
  {
    label: 'D07_時間量誤検出: 「2時間おき」',
    input: '明日 2時間おきに服薬',
    expect: { date: '2026-04-09', allDay: true }
  },
  {
    label: 'D08_時間量誤検出: 「半日」が半=30分と誤検出されないか',
    input: '来週月曜 半日休暇',
    expect: { date: '2026-04-13', allDay: true }
    // 「半」を30分と誤検出してstartTimeが設定されないか確認
  },
  {
    label: 'D09_時間量誤検出: タイトルに「2時間コース」',
    input: '明後日 2時間コースのエステ',
    expect: { date: '2026-04-10', allDay: true }
  },
  {
    label: 'D10_時間量誤検出: 「1時間程度で終わる会議」14時指定あり',
    input: '4月10日 14時 1時間程度で終わる会議',
    expect: { date: '2026-04-10', startTime: '14:00' }
    // 1時間程度→endTimeが15:00(正常)か14+1=13時と壊れるか
  },
  {
    label: 'D11_相対時刻: 「30分後」は時刻ではない',
    input: '30分後に電話',
    expect: { allDay: true }
  },
  {
    label: 'D12_相対時刻: 「15分前に集合」',
    input: '明日9時15分前に集合',
    expect: { date: '2026-04-09' }
    // 「9時15分」と取るか「9時、15分前」と取るか。クラッシュしないこと
  },

  // ================================================================
  // カテゴリB: 夜・朝・昼・正午プレフィックス（D13〜D22）
  // ================================================================
  {
    label: 'D13_夜prefix: 「夜8時」→ 20:00',
    input: '明日 夜8時 飲み会',
    expect: { date: '2026-04-09', startTime: '20:00', calendarKey: 'personal' }
  },
  {
    label: 'D14_夜prefix: 「夜10時」→ 22:00（pmGuessが効かない時間帯）',
    input: '今日 夜10時 帰宅',
    expect: { date: '2026-04-08', startTime: '22:00' }
    // 10はpmGuess対象外(1〜7のみ)なので「夜」が無効なら10:00になってしまう
  },
  {
    label: 'D15_朝prefix: 「朝9時」→ 09:00',
    input: '明日 朝9時 ジョギング',
    expect: { date: '2026-04-09', startTime: '09:00' }
    // pmGuessが9に適用されると21時になってしまうバグの確認
  },
  {
    label: 'D16_朝prefix: 「朝7時」→ 07:00（pmGuessすると19時になるバグ）',
    input: '朝7時 ラジオ体操',
    expect: { startTime: '07:00' }
    // 重要: 7はpmGuess範囲(1〜7)なので「朝」を無視すると19時になる
  },
  {
    label: 'D17_昼prefix: 「昼12時」→ 12:00',
    input: '明日 昼12時 ランチミーティング',
    expect: { date: '2026-04-09', startTime: '12:00' }
  },
  {
    label: 'D18_昼prefix: 「昼1時」→ 13:00（pmGuessで13:00になるはず）',
    input: '昼1時から打ち合わせ',
    expect: { startTime: '13:00', calendarKey: 'work' }
  },
  {
    label: 'D19_正午: 「正午」→ 12:00',
    input: '明日 正午 ランチ',
    expect: { date: '2026-04-09', startTime: '12:00' }
    // 「正午」パターンが実装されていない可能性
  },
  {
    label: 'D20_深夜: 「深夜0時」→ 00:00',
    input: '深夜0時に作業終了',
    expect: { startTime: '00:00' }
    // 0時 → pmGuessは0には適用されないはず
  },
  {
    label: 'D21_深夜: 「深夜2時」→ 02:00（pmGuessすると14時になるバグ）',
    input: '深夜2時まで作業',
    expect: { startTime: '02:00' }
    // 「深夜」prefixを無視すると2→14:00になる
  },
  {
    label: 'D22_夕方: 「夕方5時」→ 17:00',
    input: '夕方5時 退社',
    expect: { startTime: '17:00' }
    // 5はpmGuess範囲なので「夕方」なしでも17:00になるはず。ただし確認
  },

  // ================================================================
  // カテゴリC: 数字がタイトルに含まれる誤検出（D23〜D32）
  // ================================================================
  {
    label: 'D23_タイトル数字: 「14名で懇親会」→ 14時と誤検出しないか',
    input: '明日 14名で懇親会',
    expect: { date: '2026-04-09', allDay: true, title: '懇親会' }
    // 「14名」の「14」が時刻として拾われないか
  },
  {
    label: 'D24_タイトル数字: 「3チームに分かれて練習」',
    input: '今日 3チームに分かれて練習',
    expect: { date: '2026-04-08', allDay: true }
    // 「3」が15時と誤検出されないか
  },
  {
    label: 'D25_タイトル数字: 「第2回 キックオフMTG」',
    input: '4月10日 第2回 キックオフMTG',
    expect: { date: '2026-04-10', allDay: true, calendarKey: 'work' }
    // 「2」が14時と誤検出されないか
  },
  {
    label: 'D26_タイトル数字: 「5人でランチ」',
    input: '明日 5人でランチ',
    expect: { date: '2026-04-09', allDay: true }
    // 「5」が17時と誤検出されないか
  },
  {
    label: 'D27_会議室番号: 「会議室3F」→ 3時と誤検出しないか',
    input: '4月10日 14時 会議室3Fで会議',
    expect: { date: '2026-04-10', startTime: '14:00', calendarKey: 'work' }
    // 「3F」の「3」が二つ目の時刻として拾われないか
  },
  {
    label: 'D28_会議室番号: 「B2会議室」',
    input: '来週月曜 10時 B2会議室でMTG',
    expect: { date: '2026-04-13', startTime: '10:00', calendarKey: 'work' }
  },
  {
    label: 'D29_階数: 「8階ホール」',
    input: '4月15日 13時 8階ホールで発表会',
    expect: { date: '2026-04-15', startTime: '13:00', calendarKey: 'work' }
    // 「8」が20時と誤検出されないか
  },
  {
    label: 'D30_電話番号: 署名の電話番号が時刻化されないか',
    input: '明日15時 打ち合わせ\n山田龍偉\n090-1234-5678',
    expect: { date: '2026-04-09', startTime: '15:00', calendarKey: 'work' }
    // 「090-1234」等が誤検出されないか
  },
  {
    label: 'D31_番地: 「1-2-3」形式の住所',
    input: '明日 秋田市南通みその町1-2-3で打ち合わせ',
    expect: { date: '2026-04-09', calendarKey: 'work' }
    // 住所の数字が時刻として誤検出されないか
  },
  {
    label: 'D32_人数付き: 「10名参加の研修」10時と重複',
    input: '4月10日 10名参加の研修',
    expect: { date: '2026-04-10', allDay: true }
    // 「10名」の「10」が10時として拾われないか
  },

  // ================================================================
  // カテゴリD: URLポート番号・URL内数字（D33〜D38）
  // ================================================================
  {
    label: 'D33_URL数字: ポート番号8080が時刻化されないか',
    input: '明日 接続先 http://example.com:8080 でオンライン打ち合わせ',
    expect: { date: '2026-04-09', allDay: true, calendarKey: 'work' }
    // URLはSTEP1で除去されるはずだが、除去漏れで「8」「080」が拾われないか
  },
  {
    label: 'D34_URL数字: Google MeetのURL内の数字',
    input: '明日14時 https://meet.google.com/abc-1234-xyz オンラインMTG',
    expect: { date: '2026-04-09', startTime: '14:00', calendarKey: 'work', meetUrl: 'https://meet.google.com/abc-1234-xyz' }
  },
  {
    label: 'D35_URL数字: Zoomの数字ID',
    input: '来週月曜 10時 https://zoom.us/j/98765432100 会議',
    expect: { date: '2026-04-13', startTime: '10:00', calendarKey: 'work' }
    // Zoom URL内の「98765432100」が時刻化されないか
  },
  {
    label: 'D36_URL数字: パスに時刻っぽい数字 /14/00',
    input: '明日 http://example.com/event/14/00/detail 展示会',
    expect: { date: '2026-04-09', allDay: true }
    // URLがSTEP1で除去されれば問題ないはず
  },
  {
    label: 'D37_URL数字: URLが複数行にわたって混入',
    input: '件名: 定例会議\n日時: 4月10日 14時\nURL: https://meet.google.com/xxx-yyy-zzz\n場所: オンライン',
    expect: { date: '2026-04-10', startTime: '14:00', calendarKey: 'work' }
  },
  {
    label: 'D38_URL数字: 「3000円」の金額が時刻化されないか',
    input: '明日 3000円のランチ会',
    expect: { date: '2026-04-09', allDay: true }
    // 「3」が15時と誤検出されないか（「3000」は時刻範囲外なので問題ないはず）
  },

  // ================================================================
  // カテゴリE: 連続日付・日付範囲（D39〜D46）
  // ================================================================
  {
    label: 'D39_日付範囲: 「4月10日〜4月12日」→ 開始日を取得',
    input: '4月10日〜4月12日 出張',
    expect: { date: '2026-04-10' }
    // 最初の日付を取得する
  },
  {
    label: 'D40_日付範囲: 「4/10-4/12」スラッシュ形式',
    input: '4/10-4/12 展示会',
    expect: { date: '2026-04-10' }
  },
  {
    label: 'D41_日付範囲: 「10日〜12日」日のみ範囲',
    input: '10日〜12日 合宿',
    expect: { date: '2026-04-10' }
    // 「10日」が開始日になるか、「12日」と誤解しないか
  },
  {
    label: 'D42_日付範囲: 「来週月曜〜水曜」',
    input: '来週月曜〜水曜 出張',
    expect: { date: '2026-04-13' }
    // 月曜日を取得し、水曜日はend扱い（または無視）
  },
  {
    label: 'D43_連続日付: 「2026年4月10日（金）〜2026年4月12日（日）」',
    input: '2026年4月10日（金）〜2026年4月12日（日） 大会',
    expect: { date: '2026-04-10', allDay: true }
  },
  {
    label: 'D44_連続日付: 範囲の後半がendTimeと誤検出されないか',
    input: '4月10日〜4月12日 14時 会議',
    expect: { date: '2026-04-10', startTime: '14:00' }
    // 「12日」の「12」が12時と誤検出されないか
  },
  {
    label: 'D45_日付範囲: 「〜4月15日」終了日のみ記載',
    input: '〜4月15日 申込締切',
    expect: { date: '2026-04-15', allDay: true }
    // 「〜4月15日」が終了日のみのケース
  },
  {
    label: 'D46_日付範囲: 「今週金曜から月曜まで」',
    input: '今週金曜から月曜まで 連休',
    expect: { date: '2026-04-10', allDay: true }
  },

  // ================================================================
  // カテゴリF: 今月・来月・翌日・翌朝（D47〜D56）
  // ================================================================
  {
    label: 'D47_今月: 「今月15日」→ 2026-04-15',
    input: '今月15日 健康診断',
    expect: { date: '2026-04-15', allDay: true }
    // 「今月」パターンが未実装の可能性
  },
  {
    label: 'D48_今月: 「今月末」→ 2026-04-30',
    input: '今月末 月次報告',
    expect: { date: '2026-04-30', allDay: true }
  },
  {
    label: 'D49_来月: 「来月1日」→ 2026-05-01',
    input: '来月1日 GW前最終出社',
    expect: { date: '2026-05-01', allDay: true }
    // 「来月」パターンが未実装の可能性
  },
  {
    label: 'D50_来月: 「来月15日 14時」→ 2026-05-15 14:00',
    input: '来月15日 14時 健康診断',
    expect: { date: '2026-05-15', startTime: '14:00' }
  },
  {
    label: 'D51_翌日: 「翌日」→ 今日の翌日（明日と同じ）',
    input: '翌日10時 フォローアップ',
    expect: { date: '2026-04-09', startTime: '10:00' }
    // 「翌日」が未実装→終日または日付未変更になる可能性
  },
  {
    label: 'D52_翌朝: 「翌朝9時」→ 明日9時',
    input: '翌朝9時 朝礼',
    expect: { date: '2026-04-09', startTime: '09:00' }
  },
  {
    label: 'D53_来週: 「来週」のみ（曜日なし）',
    input: '来週 大会',
    expect: {}
    // 「来週」のみでは日付が確定できない→クラッシュしないこと
  },
  {
    label: 'D54_再来週: 「再来週」のみ（曜日なし）',
    input: '再来週 出張',
    expect: {}
    // クラッシュしないこと
  },
  {
    label: 'D55_今月初め: 「今月初め」',
    input: '今月初め 入社式',
    expect: {}
    // クラッシュしないこと。日付は不定
  },
  {
    label: 'D56_来年: 「来年1月1日」→ 2027-01-01',
    input: '来年1月1日 元旦',
    expect: { date: '2027-01-01', allDay: true }
    // resolveYearの動作確認（来年→+1年）
  },

  // ================================================================
  // カテゴリG: 年末年始・月境界（D57〜D63）
  // ================================================================
  {
    label: 'D57_年末: 「12月31日」→ 2026-12-31',
    input: '12月31日 大晦日パーティー',
    expect: { date: '2026-12-31', allDay: true }
  },
  {
    label: 'D58_年始: 「1月1日」→ 2027-01-01（来年）',
    input: '1月1日 初詣',
    expect: { date: '2027-01-01', allDay: true }
    // resolveYear: 現在が4月なので1月は来年
  },
  {
    label: 'D59_年始: 「1/1」スラッシュ形式→ 2027-01-01',
    input: '1/1 新年会',
    expect: { date: '2027-01-01', allDay: true }
  },
  {
    label: 'D60_月境界: 「4月30日」→ 2026-04-30（今月内、当日より後）',
    input: '4月30日 月末締め',
    expect: { date: '2026-04-30', allDay: true }
  },
  {
    label: 'D61_月境界: 「5月1日」→ 2026-05-01（来月）',
    input: '5月1日 メーデー',
    expect: { date: '2026-05-01', allDay: true }
  },
  {
    label: 'D62_年末年始: 「12/31〜1/3」→ 12月31日を取得',
    input: '12/31〜1/3 年末年始休暇',
    expect: { date: '2026-12-31', allDay: true }
  },
  {
    label: 'D63_うるう年考慮: 「2028年2月29日」',
    input: '2028年2月29日 うるう年イベント',
    expect: { date: '2028-02-29', allDay: true }
  },

  // ================================================================
  // カテゴリH: 0時・24時・深夜境界（D64〜D68）
  // ================================================================
  {
    label: 'D64_0時: 「0時」→ 00:00',
    input: '今日 0時 日付変わり',
    expect: { date: '2026-04-08', startTime: '00:00' }
    // 0はpmGuess対象外(1〜7のみ)なので0:00になるはず
  },
  {
    label: 'D65_0時半: 「0時半」→ 00:30',
    input: '深夜0時半に帰宅',
    expect: { startTime: '00:30' }
  },
  {
    label: 'D66_24時: 「24時」→ どう処理するか（クラッシュしない）',
    input: '24時に締め切り',
    expect: {}
    // 24時は00:00の翌日。クラッシュしないこと
  },
  {
    label: 'D67_23時台: 「23時30分」→ 23:30',
    input: '今日 23時30分 終電',
    expect: { date: '2026-04-08', startTime: '23:30' }
  },
  {
    label: 'D68_深夜帯範囲: 「23時〜1時」→ 開始23:00（pmGuessで1→13になるバグ）',
    input: '23時〜1時 夜通し作業',
    expect: { startTime: '23:00' }
    // 「1時」がpmGuessで13:00になる可能性
  },

  // ================================================================
  // カテゴリI: 漢数字（D69〜D74）
  // ================================================================
  {
    label: 'D69_漢数字: 「三時」→ 15:00（未対応なら終日）',
    input: '明日 三時 MTG',
    expect: { date: '2026-04-09', calendarKey: 'work' }
    // 「三時」が数字として認識されるか。未対応ならallDay=true
  },
  {
    label: 'D70_漢数字: 「十四時」→ 14:00（未対応チェック）',
    input: '4月10日 十四時 会議',
    expect: { date: '2026-04-10', calendarKey: 'work' }
    // 未対応なら allDay: true
  },
  {
    label: 'D71_漢数字: 「二十時」→ 20:00（未対応チェック）',
    input: '二十時から飲み会',
    expect: {}
    // クラッシュしないこと
  },
  {
    label: 'D72_漢数字: 「四月十日」→ 2026-04-10（未対応チェック）',
    input: '四月十日 発表会',
    expect: {}
    // クラッシュしないこと
  },
  {
    label: 'D73_漢数字: タイトルに「第三章」が含まれる',
    input: '明日14時 第三章の発表',
    expect: { date: '2026-04-09', startTime: '14:00' }
    // 「三」が時刻として誤検出されないか
  },
  {
    label: 'D74_漢数字: 「一時間」（漢数字の時間量）',
    input: '来週月曜 一時間のMTG',
    expect: { date: '2026-04-13', allDay: true, calendarKey: 'work' }
    // 「一時間」を「1時間」と解釈→時刻化されないこと
  },

  // ================================================================
  // カテゴリJ: 複数時刻候補・どちらを選ぶか（D75〜D82）
  // ================================================================
  {
    label: 'D75_複数時刻: 「9時に確認して14時に会議」→ 最初の9時',
    input: '明日 9時に確認して14時に会議',
    expect: { date: '2026-04-09', startTime: '09:00', calendarKey: 'work' }
    // 最初に登場した時刻を選ぶ（9時）
  },
  {
    label: 'D76_複数時刻: 「10時から12時と15時から17時」→ 最初の範囲',
    input: '4月10日 10時から12時と15時から17時 会議',
    expect: { date: '2026-04-10', startTime: '10:00', endTime: '12:00' }
  },
  {
    label: 'D77_複数時刻: 「午後1時と3時の予定」',
    input: '明日 午後1時と3時の予定',
    expect: { date: '2026-04-09', startTime: '13:00' }
  },
  {
    label: 'D78_複数時刻: 開始と終了が離れた文',
    input: '来週月曜 朝10時スタート、夕方17時終了の研修',
    expect: { date: '2026-04-13', startTime: '10:00', endTime: '17:00' }
    // 範囲パターンで拾えるか
  },
  {
    label: 'D79_時刻とタイトル: 「6時のニュース」→ タイトル抽出不要、クラッシュしない',
    input: '今日 6時のニュース',
    expect: { date: '2026-04-08', startTime: '18:00' }
    // 「6時」→pmGuessで18時。「のニュース」がタイトルになるか
  },
  {
    label: 'D80_時刻とタイトル: 「12時のランチ」',
    input: '明日 12時のランチ',
    expect: { date: '2026-04-09', startTime: '12:00' }
  },
  {
    label: 'D81_複数時刻: 「資料は9時までに、会議は10時から」',
    input: '明日 資料は9時までに、会議は10時から',
    expect: { date: '2026-04-09' }
    // クラッシュしないこと。どちらの時刻を取るか
  },
  {
    label: 'D82_複数時刻: 「第1部14時、第2部16時」',
    input: '4月10日 第1部14時、第2部16時 発表会',
    expect: { date: '2026-04-10', startTime: '14:00', calendarKey: 'work' }
  },

  // ================================================================
  // カテゴリK: メール署名・ノイズ混入（D83〜D90）
  // ================================================================
  {
    label: 'D83_署名: 電話番号付き署名の混入',
    input: '4月10日 14時 打ち合わせ\n\n山田龍偉\n秋田ノーザンハピネッツ\n090-1234-5678\nryui@example.com',
    expect: { date: '2026-04-10', startTime: '14:00', calendarKey: 'work' }
  },
  {
    label: 'D84_署名: 「以上」「よろしくお願いいたします」の除去確認',
    input: '来週月曜 10時から定例会議をお願いします。\nよろしくお願いいたします。\n山田',
    expect: { date: '2026-04-13', startTime: '10:00', calendarKey: 'work' }
  },
  {
    label: 'D85_署名: Eメールアドレスが時刻化されないか',
    input: '明日14時 MTG\nryui2026@gmail.com',
    expect: { date: '2026-04-09', startTime: '14:00', calendarKey: 'work' }
    // 「2026」「14」等がparsed again されないか
  },
  {
    label: 'D86_箇条書き: 「・日時：4月10日14時」「・場所：会議室A」',
    input: '・日時：4月10日14時\n・場所：会議室A\n・内容：キックオフMTG',
    expect: { date: '2026-04-10', startTime: '14:00', calendarKey: 'work' }
  },
  {
    label: 'D87_メール転送: 「From:」「Subject:」ヘッダー混入',
    input: 'Subject: 打ち合わせの件\n明日15時に打ち合わせをお願いします',
    expect: { date: '2026-04-09', startTime: '15:00', calendarKey: 'work' }
  },
  {
    label: 'D88_ノイズ: 記号・区切り線が混入',
    input: '━━━━━━━━━\n4月10日 14時 会議\n━━━━━━━━━',
    expect: { date: '2026-04-10', startTime: '14:00', calendarKey: 'work' }
  },
  {
    label: 'D89_ノイズ: 全角スペース混入「4月10日　14時　会議」',
    input: '4月10日　14時　会議',
    expect: { date: '2026-04-10', startTime: '14:00', calendarKey: 'work' }
  },
  {
    label: 'D90_ノイズ: 空テキスト→クラッシュしない',
    input: '',
    expect: {}
    // 空文字列でクラッシュしないこと
  },

  // ================================================================
  // カテゴリL: 「〜から」「〜より」時刻開始パターン（D91〜D96）
  // ================================================================
  {
    label: 'D91_から: 「14時から打ち合わせ」',
    input: '明日 14時から打ち合わせ',
    expect: { date: '2026-04-09', startTime: '14:00', calendarKey: 'work' }
  },
  {
    label: 'D92_から: 「午後3時から会議」',
    input: '4月10日 午後3時から会議',
    expect: { date: '2026-04-10', startTime: '15:00', calendarKey: 'work' }
  },
  {
    label: 'D93_より: 「10時より研修開始」',
    input: '来週月曜 10時より研修開始',
    expect: { date: '2026-04-13', startTime: '10:00', calendarKey: 'work' }
  },
  {
    label: 'D94_から範囲: 「14時から16時まで会議」',
    input: '明日 14時から16時まで会議',
    expect: { date: '2026-04-09', startTime: '14:00', endTime: '16:00', calendarKey: 'work' }
  },
  {
    label: 'D95_まで: 「〜16時まで」終了時刻のみ',
    input: '明日 〜16時まで打ち合わせ',
    expect: { date: '2026-04-09', endTime: '16:00', calendarKey: 'work' }
  },
  {
    label: 'D96_から: 「9時半から打ち合わせ」',
    input: '来週水曜 9時半から打ち合わせ',
    expect: { date: '2026-04-15', startTime: '09:30', calendarKey: 'work' }
  },

  // ================================================================
  // カテゴリM: エッジケース・クラッシュ確認（D97〜D100）
  // ================================================================
  {
    label: 'D97_エッジ: 数字のみの入力',
    input: '14',
    expect: {}
    // クラッシュしないこと
  },
  {
    label: 'D98_エッジ: 非常に長いテキスト（500文字超）',
    input: '4月10日 14時 会議\n' + '関係者各位、お疲れ様です。'.repeat(30),
    expect: { date: '2026-04-10', startTime: '14:00' }
    // 長いテキストでクラッシュしないこと
  },
  {
    label: 'D99_エッジ: 時刻が2桁ゼロ詰め「09:00」→ 正しくパース',
    input: '明日 09:00 朝礼',
    expect: { date: '2026-04-09', startTime: '09:00' }
    // 「09」がpmGuessで21時にならないか（9はpmGuess範囲だが09は整数値9）
  },
  {
    label: 'D100_エッジ: タイトルに日付と同じ数字「4月会議」',
    input: '4月10日 14時 4月会議',
    expect: { date: '2026-04-10', startTime: '14:00', calendarKey: 'work' }
    // タイトル「4月会議」が日付処理に巻き込まれないか
  },
  ];

  for (const tc of cases) {
    test(tc.label, () => runCase(tc));
  }
});

// ============================================================
// E ブロック（parser-test.js E01〜E75 = 70件）
// ============================================================
describe('E: 招待メール・絵文字・英語・エッジケース', () => {
  const cases = [
  // ─ E01〜E15: Google Calendar招待メール形式 ──────────────
  { label:'E01_招待: Google Calendar標準形式', input:`タイトル: 第2四半期レビュー\n日時: 2026年4月10日(金) 14:00 〜 15:00\n場所: 会議室A`, expect:{ date:'2026-04-10', startTime:'14:00', endTime:'15:00', title:'第2四半期レビュー' } },
  { label:'E02_招待: 終日イベント招待', input:`件名: 創立記念日\n日時: 2026年4月13日(月) 終日`, expect:{ date:'2026-04-13', allDay:true, title:'創立記念日' } },
  { label:'E03_招待: 複数参加者メール', input:`件名: 【招待】戦略会議\n日時: 4月15日（水）13:00〜17:00\n場所: 大会議室`, expect:{ date:'2026-04-15', startTime:'13:00', endTime:'17:00', calendarKey:'work' } },
  { label:'E04_招待: 繰り返し予定', input:`件名: 定例ミーティング\n次回: 2026年4月14日 10:00〜11:00\n場所: 会議室B`, expect:{ date:'2026-04-14', startTime:'10:00', endTime:'11:00', title:'定例ミーティング' } },
  { label:'E05_招待: タイムゾーン付き', input:`件名: グローバルチームコール\n日時: 2026/04/16 (木) 09:00-10:00 JST\nhttps://meet.google.com/abc-defg-hij`, expect:{ date:'2026-04-16', startTime:'09:00', endTime:'10:00', meetUrl:'https://meet.google.com/abc-defg-hij' } },
  { label:'E06_招待: 日付が件名に含まれる', input:`件名: 4/13 キックオフMTG\n時間: 10:00〜11:30\n場所: 会議室1`, expect:{ date:'2026-04-13', startTime:'10:00', endTime:'11:30' } },
  { label:'E07_招待: Outlookスタイル', input:`件名: RE: 打ち合わせのご案内\n日時: 2026年4月17日 金曜日 15:30-16:30`, expect:{ date:'2026-04-17', startTime:'15:30', endTime:'16:30' } },
  { label:'E08_招待: 場所フィールド複数行', input:`件名: 現地視察\n日時: 4月20日（月）10:00〜\n場所: 秋田市\n秋田ノーザンゲートスクエア2F`, expect:{ date:'2026-04-20', startTime:'10:00' } },
  { label:'E09_招待: 複数日程候補', input:`候補日程:\n① 4月13日（月）14:00〜\n② 4月14日（火）15:00〜\n件名: スポンサー商談`, expect:{ title:'スポンサー商談' } },
  { label:'E10_招待: ZoomとMeet両方', input:`来週月曜 10:00 チームMTG\nZoom: https://zoom.us/j/123456789\nMeet: https://meet.google.com/abc-defg-hij`, expect:{ date:'2026-04-13', startTime:'10:00', title:'チームMTG' } },
  { label:'E11_招待: 長文ビジネスメール', input:`お世話になっております。\n下記の通りお打ち合わせをご提案いたします。\n\n日時: 2026年4月20日（月）午後2時〜3時\n場所: 弊社会議室\n議題: スポンサー契約について`, expect:{ date:'2026-04-20', startTime:'14:00', endTime:'15:00', calendarKey:'work' } },
  { label:'E12_招待: 転送メールヘッダ混入', input:`---------- Forwarded message ----------\nFrom: 田中 <tanaka@example.com>\n\n明日12:00からランチMTGはどうでしょう？`, expect:{ startTime:'12:00' } },
  { label:'E13_招待: Slackリマインダー風', input:`【リマインダー】\n明日（4月9日木曜日') の午後2時から\n「Q1振り返り会」を実施します.`, expect:{ date:'2026-04-09', startTime:'14:00', title:'Q1振り返り会', calendarKey:'work' } },
  { label:'E14_招待: 件名コロン含む', input:`件名: スポンサー: A社との打ち合わせ\n日時: 4月14日 14:00`, expect:{ date:'2026-04-14', startTime:'14:00' } },
  { label:'E15_招待: 全角コロン件名', input:`件名：プロジェクト：フェーズ2キックオフ\n日時：4月14日 10:00〜`, expect:{ date:'2026-04-14', startTime:'10:00' } },

  // ─ E16〜E25: 絵文字付き ────────────────────────────────
  { label:'E16_絵文字: 先頭に📅', input:'📅明日14時 MTG', expect:{ date:'2026-04-09', startTime:'14:00', title:'MTG' } },
  { label:'E17_絵文字: 時刻前に🕐', input:'明日🕐15時 打ち合わせ', expect:{ date:'2026-04-09', startTime:'15:00', title:'打ち合わせ' } },
  { label:'E18_絵文字: 複数散在', input:'📌来週月曜🗓️10:00〜11:00 ✅チームMTG', expect:{ date:'2026-04-13', startTime:'10:00', endTime:'11:00' } },
  { label:'E19_絵文字: 場所に📍', input:'4月14日 13:00 商談\n📍場所: 秋田駅前カフェ', expect:{ date:'2026-04-14', startTime:'13:00', title:'商談' } },
  { label:'E20_絵文字: 🗓️4/10 形式', input:'🗓️4/10 15:00 締め切り確認', expect:{ date:'2026-04-10', startTime:'15:00' } },
  { label:'E21_絵文字: Zoomリンク前に💻', input:'来週水曜14:00 オンラインMTG\n💻 https://zoom.us/j/123456789', expect:{ date:'2026-04-15', startTime:'14:00', title:'オンラインMTG' } },
  { label:'E22_絵文字: タイトルに🚀', input:'今日15:00 キックオフ🚀ミーティング', expect:{ date:'2026-04-08', startTime:'15:00' } },
  { label:'E23_絵文字: 国旗絵文字', input:'🇯🇵 4月17日 14:00 国際会議', expect:{ date:'2026-04-17', startTime:'14:00', title:'国際会議' } },
  { label:'E24_絵文字: タイトルのみ絵文字', input:'4月13日 10:00 🎉', expect:{ date:'2026-04-13', startTime:'10:00' } },
  { label:'E25_絵文字: ★4月装飾', input:'★4月16日14:00 スポンサー報告会', expect:{ date:'2026-04-16', startTime:'14:00', title:'スポンサー報告会' } },

  // ─ E26〜E35: 英語混じり ────────────────────────────────
  { label:'E26_英語: Tuesday 14:00 Team Meeting', input:'Tuesday 14:00 Team Meeting', expect:{ startTime:'14:00', title:'Team Meeting' } },
  { label:'E27_英語: 4/13 10am キックオフ', input:'4/13 10am キックオフ', expect:{ date:'2026-04-13', startTime:'10:00', title:'キックオフ' } },
  { label:'E28_英語: 来週金曜 + 英語タイトル', input:'来週金曜 15:00 Stakeholder Review Meeting', expect:{ date:'2026-04-17', startTime:'15:00', title:'Stakeholder Review Meeting' } },
  { label:'E29_英語: AM/PM表記', input:'4月14日 2:30 PM チームレビュー', expect:{ date:'2026-04-14', startTime:'14:30', title:'チームレビュー' } },
  { label:'E30_英語: 来週月曜 Q2 OKR Review', input:'来週月曜 14:00 Q2 OKR Review', expect:{ date:'2026-04-13', startTime:'14:00', title:'Q2 OKR Review' } },
  { label:'E31_英語: tomorrow at 10:00', input:'tomorrow at 10:00 1on1', expect:{ date:'2026-04-09', startTime:'10:00' } },
  { label:'E32_英語: Friday 9:00 AM Sales Meeting', input:'Friday 9:00 AM Sales Meeting', expect:{ date:'2026-04-10', startTime:'09:00', title:'Sales Meeting' } },
  { label:'E33_英語: at表現', input:'Team Meeting at 3pm on Friday', expect:{ date:'2026-04-10', startTime:'15:00' } },
  { label:'E34_英語: Sprint Planning', input:'4月10日 10:00-11:00 Sprint Planning', expect:{ date:'2026-04-10', startTime:'10:00', endTime:'11:00', title:'Sprint Planning' } },
  { label:'E35_英語: next Monday', input:'next Monday 10:00 チームMTG', expect:{ date:'2026-04-13', startTime:'10:00' } },

  // ─ E36〜E45: 「の」が入る日時表現 ─────────────────────
  { label:'E36_の付き: 今日の14時', input:'今日の14時に打ち合わせ', expect:{ date:'2026-04-08', startTime:'14:00' } },
  { label:'E37_の付き: 明日の10時', input:'明日の10時からMTG', expect:{ date:'2026-04-09', startTime:'10:00', title:'MTG' } },
  { label:'E38_の付き: 明日の午後3時', input:'明日の午後3時に商談があります', expect:{ date:'2026-04-09', startTime:'15:00', title:'商談' } },
  { label:'E39_の付き: 来週月曜の朝9時', input:'来週月曜の朝9時から全体会議', expect:{ date:'2026-04-13', startTime:'09:00', title:'全体会議' } },
  { label:'E40_の付き: 来週水曜の14時から', input:'来週の水曜日に打ち合わせを入れてください 14:00から', expect:{ date:'2026-04-15', startTime:'14:00', title:'打ち合わせ' } },
  { label:'E41_の付き: 今日の夜8時', input:'今日の夜8時から食事会', expect:{ date:'2026-04-08', startTime:'20:00', title:'食事会' } },
  { label:'E42_の付き: 来週木曜の昼12時', input:'来週木曜の昼12時からランチMTG', expect:{ date:'2026-04-16', startTime:'12:00', title:'ランチMTG' } },
  { label:'E43_の付き: 4月13日の午前', input:'4月13日の午前中にミーティング', expect:{ date:'2026-04-13', title:'ミーティング' } },
  { label:'E44_の付き: 再来週の月曜', input:'再来週の月曜の10時から新人研修', expect:{ date:'2026-04-20', startTime:'10:00', title:'新人研修' } },
  { label:'E45_の付き: 今週金曜の夕方5時', input:'今週金曜の夕方5時から飲み会', expect:{ date:'2026-04-10', startTime:'17:00', title:'飲み会' } },

  // ─ E46〜E55: タイトルサフィックス ─────────────────────
  { label:'E46_サフィックス: 〜の予定', input:'明日14時から会議の予定です', expect:{ date:'2026-04-09', startTime:'14:00' } },
  { label:'E47_サフィックス: 〜があります', input:'来週月曜10時からプレゼンがあります', expect:{ date:'2026-04-13', startTime:'10:00' } },
  { label:'E48_サフィックス: 第3回ハピネッツスポンサー懇親会', input:'第3回ハピネッツスポンサー懇親会 4月20日 18:00', expect:{ date:'2026-04-20', startTime:'18:00', calendarKey:'work' } },
  { label:'E49_サフィックス: 第3回MTG', input:'第3回MTG 来週月曜 10:00', expect:{ date:'2026-04-13', startTime:'10:00' } },
  { label:'E50_サフィックス: 【重要】全体会議', input:'【重要】来週月曜 10:00 全体会議', expect:{ date:'2026-04-13', startTime:'10:00', title:'全体会議' } },

  // ─ E56〜E65: カレンダー振り分け境界 ──────────────────
  { label:'E56_カレンダー: ハピネッツ観戦チケット購入（personal?）', input:'来週月曜 19:00 ハピネッツ観戦チケット購入', expect:{ date:'2026-04-13', startTime:'19:00', calendarKey:'work' } },
  { label:'E57_カレンダー: 歯医者は個人', input:'4月14日 10:00 歯医者の予約', expect:{ date:'2026-04-14', startTime:'10:00', calendarKey:'personal' } },
  { label:'E58_カレンダー: 飲み会は個人', input:'4月17日 19:00 チームで飲み会', expect:{ date:'2026-04-17', startTime:'19:00', calendarKey:'personal' } },
  { label:'E59_カレンダー: 誕生日は個人', input:'4月13日 田中さんの誕生日', expect:{ date:'2026-04-13', calendarKey:'personal', allDay:true } },
  { label:'E60_カレンダー: 記念日は個人', input:'4月20日 結婚記念日', expect:{ date:'2026-04-20', calendarKey:'personal', allDay:true } },
  { label:'E61_カレンダー: MTGはwork', input:'来週火曜 10:00 MTG', expect:{ date:'2026-04-14', startTime:'10:00', calendarKey:'work' } },
  { label:'E62_カレンダー: クライアントランチはwork', input:'来週水曜 12:00 クライアントランチ', expect:{ date:'2026-04-15', startTime:'12:00', calendarKey:'work' } },
  { label:'E63_カレンダー: スポンサー懇親会はwork', input:'第2回ハピネッツスポンサー懇親会 4月21日 18:30', expect:{ date:'2026-04-21', startTime:'18:30', calendarKey:'work' } },
  { label:'E64_カレンダー: 研修はwork', input:'来週月曜から木曜 新入社員研修', expect:{ date:'2026-04-13', calendarKey:'work' } },
  { label:'E65_カレンダー: 映画は個人', input:'今週土曜 19:00 映画', expect:{ date:'2026-04-11', startTime:'19:00', calendarKey:'personal' } },

  // ─ E66〜E75: エッジケース ──────────────────────────────
  { label:'E66_エッジ: 空文字列', input:'', expect:{} },
  { label:'E67_エッジ: 記号だけ', input:'---!!!---', expect:{} },
  { label:'E68_エッジ: 非常に長いテキスト', input:'来週月曜 10:00 MTG\n' + 'これは備考です。'.repeat(500), expect:{ date:'2026-04-13', startTime:'10:00', title:'MTG' } },
  { label:'E69_エッジ: 改行だらけ', input:'\n\n件名: 月次報告\n\n\n日時: 4月14日\n\n時間: 13:00〜14:00\n', expect:{ date:'2026-04-14', startTime:'13:00', endTime:'14:00', title:'月次報告' } },
  { label:'E70_エッジ: タブ区切り', input:'件名\tチームMTG\t日時\t4月15日\t時間\t10:00', expect:{ date:'2026-04-15', startTime:'10:00' } },
  { label:'E71_エッジ: 不正日付(13月)', input:'13月40日 10:00 不正な日付', expect:{} },
  { label:'E72_エッジ: 不正時刻(25時)', input:'来週月曜 25:00 MTG', expect:{ date:'2026-04-13' } },
  { label:'E73_エッジ: 逆転時刻', input:'4月14日 15:00〜13:00 逆転MTG', expect:{ date:'2026-04-14', startTime:'15:00' } },
  { label:'E74_エッジ: 全角数字日時', input:'４月１４日　１４：００　チームMTG', expect:{ date:'2026-04-14', startTime:'14:00', title:'チームMTG' } },
  { label:'E75_エッジ: 口語音声入力', input:'えーと来週の月曜日の午前10時からチームの定例ミーティングを入れておいてください場所は会議室Aです', expect:{ date:'2026-04-13', startTime:'10:00', calendarKey:'work' } }
  ];

  for (const tc of cases) {
    test(tc.label, () => runCase(tc));
  }
});
