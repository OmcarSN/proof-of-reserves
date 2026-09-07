import { defineConfig } from 'vitest/config';

// Root Vitest config. The contract tests are pure, in-process simulations of
// the Compact circuit (no network, no proof server), so the default Node
// environment is all they need. `setupFiles` installs a BigInt JSON
// serialiser so the privacy test can stringify the ledger state.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
