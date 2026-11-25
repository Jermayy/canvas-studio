import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': resolve(import.meta.dirname, 'src'),
  '@build': resolve(import.meta.dirname, 'build'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['build/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/shared/**'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'build/**/*.ts'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'build/**/*.test.ts',
        'src/**/*.d.ts',
        'src/test/**',
        'src/main.tsx',
      ],
      thresholds: {
        // Business logic must stay above 90%, UI above 70%.
        'src/modules/**/domain/**': { lines: 90, branches: 85 },
        'src/modules/**/application/**': { lines: 90, branches: 80 },
        'src/modules/**/state/**': { lines: 90, branches: 80 },
        'src/modules/**/data/**': { lines: 90, branches: 80 },
        'src/modules/sync/syncEngine.ts': { lines: 90, branches: 80 },
        'src/modules/sync/infrastructure/**': { lines: 90, branches: 80 },
        'src/modules/sync/*.ts': { lines: 90, branches: 80 },
        'src/modules/workspace/infrastructure/**': { lines: 90 },
        'src/modules/account/*.ts': { lines: 90, branches: 80 },
        'src/modules/account/infrastructure/**': { lines: 90 },
        'src/modules/share/infrastructure/**': { lines: 90 },
        'src/modules/auth/infrastructure/wrappedKeyStores.ts': {
          lines: 90,
          branches: 80,
        },
        'src/modules/export/infrastructure/fileDelivery.ts': {
          lines: 90,
          branches: 85,
        },
        'src/shared/lib/**': { lines: 90 },
        'build/**': { lines: 90 },
        'src/modules/**/components/**': { lines: 70 },
      },
    },
  },
});
