import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          testTimeout: 60000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.ts'],
      exclude: ['src/shared/types.ts', 'src/shared/api.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
