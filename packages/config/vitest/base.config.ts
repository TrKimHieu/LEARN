import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      // Worker chứa pipeline AI — phần logic phức tạp nhất repo — mà trước đây nằm
      // ngoài glob nên không test nào chạm tới.
      'apps/worker/src/**/*.test.ts',
      // Test của apps/web chạy bằng vitest của chính app đó (`npm test -w apps/web`).
    ],
    // *.integration.test.ts cần hạ tầng thật (Postgres/Redis/server) — chạy riêng qua
    // vitest.int.config.ts, không chạy chung với unit test.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
  },
});
