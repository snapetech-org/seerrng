import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Author themes from a checkout without compiling the application or starting
// its server. Packaged installations can keep using the compiled Node CLI.
const require = createRequire(import.meta.url);
const source = fileURLToPath(
  new URL('../server/commands/interfaceTheme.ts', import.meta.url)
);
const compiled = fileURLToPath(
  new URL('../dist/commands/interfaceTheme.js', import.meta.url)
);

try {
  let jitiPath;
  try {
    jitiPath = require.resolve('jiti');
  } catch {
    // Production packages intentionally omit development dependencies.
  }
  if (existsSync(source) && jitiPath) {
    const { createJiti } = require(jitiPath);
    await createJiti(import.meta.url).import(source);
  } else if (existsSync(compiled)) {
    require(compiled);
  } else {
    throw new Error(
      'Run pnpm install in the SeerrNG checkout first, or use a packaged release with dist/commands/interfaceTheme.js.'
    );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Theme command failed.'
  );
  process.exitCode = 1;
}
