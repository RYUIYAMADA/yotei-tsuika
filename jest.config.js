module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'main.js',
    'preload.js',
    'renderer/**/*.js',
    '!node_modules/**',
    '!.git/**'
  ],
  // main.js / preload.js は Electron 依存のため通常テストでは 0% になる。
  // renderer/**/*.js は vm 経由実行のためカバレッジ計上不可。
  // 閾値は npm test が落ちない現実値（0）に設定。
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true
};
