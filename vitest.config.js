import { defineConfig } from 'vitest/config';

// Dev-only test harness for Greylux. This does NOT introduce a runtime build
// step for the pages — they still open directly in a browser. Vitest only runs
// the property/example tests that import the pure logic in js/*.js modules.
export default defineConfig({
  test: {
    // jsdom so tests can assert on rendered DOM fragments (deltas, badges,
    // KPI/transaction rendering, renderWithSkeleton).
    environment: 'jsdom',
    // Only collect tests from the tests/ directory.
    include: ['tests/**/*.test.js'],
    // No watch mode — `npm test` runs once via the --run flag in package.json.
    watch: false,
  },
});
