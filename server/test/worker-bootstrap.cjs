// Only the native test CLI preloads this module; application startup does not.
// Forced exits must not discard pending result writes to a redirected pipe.
for (const output of [process.stdout, process.stderr]) {
  output._handle?.setBlocking?.(true);
}

// Load application/test hooks only in isolated workers. Loading node:test hooks
// in the CLI coordinator would create a second, unrelated root test harness.
if (process.env.NODE_TEST_CONTEXT === 'child-v8') {
  require('ts-node/register');
  require('tsconfig-paths/register');
  require('./setup.ts');
}
