import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, it } from 'node:test';

const script = path.resolve('deploy/migrate-bookshelf-to-chaptarrng.sh');
const temporaryDirectories = new Set();

const createRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'seerr-bookshelf-migration-'));
  temporaryDirectories.add(root);
  return root;
};

const run = (environment, ...args) =>
  new Promise((resolve) => {
    const child = spawn(script, args, {
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

const fixture = async (root) => {
  const config = path.join(root, 'config');
  const bin = path.join(root, 'bin');
  const capture = path.join(root, 'docker-args');
  await mkdir(config);
  await mkdir(bin);
  await writeFile(path.join(config, 'readarr.db'), 'fixture database');
  await writeFile(
    path.join(bin, 'docker'),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$DOCKER_ARGS_FILE"\nif [ "${DOCKER_EXIT_WITH_REVIEW:-0}" = "1" ]; then\n  : > "$BOOKSHELF_EBOOKS_CONFIG_DIR/readarr.db.bookshelf-media-review.json"\n  exit 1\nfi\n',
    { mode: 0o700 }
  );
  await chmod(path.join(bin, 'docker'), 0o700);
  return {
    config,
    capture,
    environment: {
      BOOKSHELF_EBOOKS_CONFIG_DIR: config,
      BOOKSHELF_AUDIOBOOKS_CONFIG_DIR: config,
      DOCKER_ARGS_FILE: capture,
      PATH: `${bin}:${process.env.PATH}`,
    },
  };
};

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
  temporaryDirectories.clear();
});

it('previews with the standard ChaptarrNG image and leaves source data untouched', async () => {
  const root = await createRoot();
  const data = await fixture(root);
  const result = await run(data.environment);
  const args = await readFile(data.capture, 'utf8');

  assert.equal(result.code, 0, result.stderr);
  assert.match(args, /ghcr\.io\/snapetech\/chaptarrng:latest/);
  assert.match(args, /-preview-bookshelf-migration/);
  assert.match(args, /--network\nnone\n/);
  assert.doesNotMatch(args, /bookshelf-compat/);
  assert.equal(
    await readFile(path.join(data.config, 'readarr.db'), 'utf8'),
    'fixture database'
  );
  assert.match(result.stdout, /without changing readarr\.db/);
});

it('requires a stopped service and an independent backup for apply', async () => {
  const root = await createRoot();
  const data = await fixture(root);
  const blocked = await run(data.environment, '--apply');
  assert.equal(blocked.code, 2);
  assert.match(blocked.stderr, /requires --confirm-stopped/);

  const applied = await run(
    { ...data.environment, BACKUP_DIR: path.join(root, 'backups') },
    '--apply',
    '--confirm-stopped'
  );
  const args = await readFile(data.capture, 'utf8');
  const backupDirectory = path.join(root, 'backups');
  const backupNames = await readdir(backupDirectory);
  assert.equal(applied.code, 0, applied.stderr);
  assert.match(args, /-migrate-bookshelf/);
  assert.match(args, /-confirm-bookshelf-service-stopped/);
  assert.match(applied.stdout, /Independent config backup:/);
  assert.equal(backupNames.length, 1);
  assert.match(backupNames[0], /^bookshelfng-config-.*\.tar\.gz$/);
  assert.equal(
    (await stat(path.join(backupDirectory, backupNames[0]))).mode & 0o777,
    0o600
  );
});

it('explains the per-book mapping step when preview emits a media review', async () => {
  const root = await createRoot();
  const data = await fixture(root);
  const result = await run({
    ...data.environment,
    DOCKER_EXIT_WITH_REVIEW: '1',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /readarr\.db\.bookshelf-media-review\.json/);
  assert.match(result.stderr, /mediaType to audiobook, ebook, or both/);
  assert.match(result.stderr, /readarr\.db\.bookshelf-media-map\.json/);
  assert.equal(
    await readFile(path.join(data.config, 'readarr.db'), 'utf8'),
    'fixture database'
  );
});

it('refuses to silently ignore a separate audiobook database', async () => {
  const root = await createRoot();
  const data = await fixture(root);
  const audio = path.join(root, 'audiobooks');
  await mkdir(audio);
  await writeFile(path.join(audio, 'readarr.db'), 'separate fixture');
  const result = await run({
    ...data.environment,
    BOOKSHELF_AUDIOBOOKS_CONFIG_DIR: audio,
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /will not merge split libraries/);
});
