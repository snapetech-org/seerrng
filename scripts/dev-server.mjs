import chokidar from 'chokidar';
import { spawn } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const repositoryRoot = resolve(import.meta.dirname, '..');
const fileExtensions = new Set(['.ts', '.json', '.yml']);

function normalizeRelativePath(path, root = repositoryRoot) {
  return relative(root, resolve(root, path)).split(sep).join('/');
}

export function isServerRestartPath(path, root = repositoryRoot) {
  const relativePath = normalizeRelativePath(path, root);
  if (relativePath === 'seerr-api.yml') return true;
  if (!relativePath.startsWith('server/')) return false;
  return fileExtensions.has(relativePath.slice(relativePath.lastIndexOf('.')));
}

function stopChild(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();

  return new Promise((resolveStop) => {
    let killTimer;
    const finish = () => {
      clearTimeout(killTimer);
      resolveStop();
    };
    child.once('exit', finish);
    killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
    }, 2000);
    killTimer.unref();
    child.kill(signal);
  });
}

export async function runDevServer() {
  const command = [
    resolve(repositoryRoot, 'node_modules/ts-node/dist/bin.js'),
    '-r',
    'tsconfig-paths/register',
    '--files',
    '--project',
    'server/tsconfig.json',
    'server/index.ts',
  ];

  let child;
  let restartTimer;
  let restartQueue = Promise.resolve();
  let shuttingDown = false;
  let shutdownPromise;

  function startServer() {
    if (shuttingDown) return;
    console.log('[dev] Starting the SeerrNG server');
    const nextChild = spawn(process.execPath, command, {
      cwd: repositoryRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
    child = nextChild;
    nextChild.once('error', (error) => {
      console.error('[dev] Could not start the server:', error);
      if (child === nextChild) child = undefined;
    });
    nextChild.once('exit', (code, signal) => {
      if (child === nextChild) child = undefined;
      if (!shuttingDown && (code !== 0 || signal))
        console.log(
          `[dev] Server exited (${signal ?? code}); waiting for a source change`
        );
    });
  }

  const watcher = chokidar.watch(
    [
      resolve(repositoryRoot, 'server'),
      resolve(repositoryRoot, 'seerr-api.yml'),
    ],
    {
      ignoreInitial: true,
      ignored(path, stats) {
        if (stats?.isDirectory() || !stats) return false;
        return !isServerRestartPath(path);
      },
    }
  );

  function shutdown(signal) {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    clearTimeout(restartTimer);
    shutdownPromise = (async () => {
      await watcher.close();
      await restartQueue;
      if (child) {
        const currentChild = child;
        child = undefined;
        await stopChild(currentChild, signal);
      }
    })();
    return shutdownPromise;
  }

  watcher.on('ready', startServer);
  watcher.on('all', (_event, path) => {
    if (!isServerRestartPath(path)) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartQueue = restartQueue.then(async () => {
        if (shuttingDown) return;
        console.log(`[dev] ${normalizeRelativePath(path)} changed; restarting`);
        if (child) await stopChild(child);
        startServer();
      });
    }, 150);
  });
  watcher.on('error', (error) => {
    console.error('[dev] File watcher failed:', error);
    process.exitCode = 1;
    void shutdown();
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      void shutdown(signal).then(() => {
        process.exitCode ??= 0;
      });
    });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runDevServer().catch((error) => {
    console.error('[dev] Could not start the watcher:', error);
    process.exitCode = 1;
  });
}
