import { lstatSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- The Vitest bootstrap runs before TypeScript aliases are loaded.
import { setIsolatedTestEnvironment } from '../../tools/validation-engine/runtime/test-environment.mjs';

// Must execute BEFORE the original setup imports datasource/settings. Vitest
// isolates JS modules, but environment paths otherwise survive worker reuse.
const prefix = 'seerrng-engine-config-';
const directoryParent = tmpdir();
const directory = mkdtempSync(join(directoryParent, prefix));
setIsolatedTestEnvironment(directory, process.env, {
  includeCi: true,
  includeVitest: true,
});

// A single worker-exit hook keeps config alive until all teardown hooks and
// owned subprocesses finish. Never recursively remove an inherited directory.
const owner = Symbol.for('seerrng.engine.owned-test-configs');
if (!process[owner]) {
  process[owner] = new Map();
  process.once('exit', () => {
    const entries = [...process[owner]].sort(
      ([left], [right]) => right.length - left.length
    );
    for (const [path, parent] of entries) {
      let stat;
      try {
        stat = lstatSync(path);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      if (
        stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        basename(path).startsWith(prefix) &&
        realpathSync(dirname(path)) === realpathSync(parent)
      )
        rmSync(path, { recursive: true });
    }
  });
}
process[owner].set(directory, directoryParent);
