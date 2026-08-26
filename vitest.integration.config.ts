import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Deliberately separate from vitest.config.ts (unit tests): these tests
// need a real dedicated test Supabase project (see
// docs/INTEGRATION_TESTING.md) and are never run by ci.yml's npm test,
// which must succeed on a clean checkout with no secrets at all (a
// Dependabot PR never receives repo secrets, by GitHub's own design).
// Longer default timeout than unit tests since every test here makes real
// network round trips to Supabase, not in-process function calls.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['scripts/integration/**/*.test.ts'],
    testTimeout: 20_000,
    // Integration tests share real rows/users within a test file (signed-in
    // sessions, seeded fixtures) -- running test files in parallel risks
    // one file's cleanup racing another's setup against the same project.
    fileParallelism: false,
  },
});
