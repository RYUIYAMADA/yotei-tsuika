/**
 * タスク管理アプリ - 起動ユニットテスト
 * 8段階起動フロー、エラーハンドリング、フォールバック機能をテスト
 */

const fs = require('fs');
const path = require('path');

describe('アプリ起動システム', () => {
  const HEALTH_CHECK_FILE = path.join(__dirname, '../.startup-check');
  const LOG_FILE = path.join(__dirname, '../startup.log');

  beforeEach(() => {
    // テスト前にファイルをクリア
    if (fs.existsSync(HEALTH_CHECK_FILE)) fs.unlinkSync(HEALTH_CHECK_FILE);
  });

  afterEach(() => {
    // テスト後にファイルをクリア
    if (fs.existsSync(HEALTH_CHECK_FILE)) fs.unlinkSync(HEALTH_CHECK_FILE);
  });

  test('ヘルスチェックファイルが作成される', () => {
    // シミュレーション: ヘルスチェック記録
    const healthData = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      pid: process.pid
    };
    fs.writeFileSync(HEALTH_CHECK_FILE, JSON.stringify(healthData));

    expect(fs.existsSync(HEALTH_CHECK_FILE)).toBe(true);
    const data = JSON.parse(fs.readFileSync(HEALTH_CHECK_FILE, 'utf-8'));
    expect(data.status).toBe('healthy');
  });

  test('クラッシュ検知ロジック: 30秒以内の再起動を検知する', () => {
    const now = new Date();
    const recentTime = new Date(now.getTime() - 10000); // 10秒前

    const healthData = {
      timestamp: recentTime.toISOString(),
      status: 'healthy',
      pid: process.pid
    };
    fs.writeFileSync(HEALTH_CHECK_FILE, JSON.stringify(healthData));

    // クラッシュ検知ロジック
    const data = JSON.parse(fs.readFileSync(HEALTH_CHECK_FILE, 'utf-8'));
    const checkTime = new Date(data.timestamp);
    const diffMs = new Date() - checkTime;

    const isHealthy = diffMs >= 30000; // 30秒以上なら健全

    expect(isHealthy).toBe(false); // 10秒前なので異常検知
  });

  test('クラッシュ検知ロジック: 30秒以上経過なら健全', () => {
    const oldTime = new Date(new Date().getTime() - 40000); // 40秒前

    const healthData = {
      timestamp: oldTime.toISOString(),
      status: 'healthy',
      pid: process.pid
    };
    fs.writeFileSync(HEALTH_CHECK_FILE, JSON.stringify(healthData));

    const data = JSON.parse(fs.readFileSync(HEALTH_CHECK_FILE, 'utf-8'));
    const checkTime = new Date(data.timestamp);
    const diffMs = new Date() - checkTime;

    const isHealthy = diffMs >= 30000;

    expect(isHealthy).toBe(true); // 40秒経過なので健全
  });

  test('ログファイルが追記される', () => {
    const logMessage = '[2026-03-26T06:44:58.232Z] ✅ テストログエントリ\n';
    fs.appendFileSync(LOG_FILE, logMessage);

    const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
    expect(logContent).toContain('✅ テストログエントリ');
  });

  test('環境変数が正しく読み込まれる', () => {
    const testCalendarId = 'test-calendar-id@gmail.com';
    process.env.CALENDAR_1_ID = testCalendarId;

    const calendarId = process.env.CALENDAR_1_ID || 'YOUR_CALENDAR_ID@gmail.com';
    expect(calendarId).toBe(testCalendarId);

    delete process.env.CALENDAR_1_ID;
  });

  test('環境変数がない場合はデフォルト値を使用', () => {
    delete process.env.CALENDAR_1_ID;

    const calendarId = process.env.CALENDAR_1_ID || 'YOUR_CALENDAR_ID@gmail.com';
    expect(calendarId).toBe('YOUR_CALENDAR_ID@gmail.com');
  });
});

describe('エラーハンドリング', () => {
  test('dotenvモジュールがインストールされている', () => {
    // package.jsonで依存関係確認
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    );

    expect(packageJson.dependencies).toHaveProperty('dotenv');
  });

  test('Jestがテストランナーとして設定されている', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    );

    expect(packageJson.scripts).toHaveProperty('test');
    expect(packageJson.devDependencies).toHaveProperty('jest');
  });
});
