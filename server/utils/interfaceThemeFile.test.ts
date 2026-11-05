import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { readInterfaceThemeFile } from './interfaceThemeFile';

it('reads bounded UTF-8 theme data and rejects hard links and oversized files', (t) => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'seerr-theme-file-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'theme.css');
  fs.writeFileSync(filename, '🎬');
  assert.equal(readInterfaceThemeFile(filename, 4), '🎬');
  assert.throws(
    () => readInterfaceThemeFile(filename, 3),
    /bounded regular file/
  );
  fs.linkSync(filename, path.join(directory, 'linked.css'));
  assert.throws(
    () => readInterfaceThemeFile(filename, 4),
    /bounded regular file/
  );
});

it(
  'rejects a symlink substituted between validation and open',
  { skip: process.platform === 'win32' },
  (t) => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'seerr-theme-race-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const filename = path.join(directory, 'theme.css');
    const privateFile = path.join(directory, 'private.css');
    fs.writeFileSync(filename, 'safe');
    fs.writeFileSync(privateFile, 'private');
    const open = fs.openSync;
    t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
      if (args[0] === filename) {
        fs.unlinkSync(filename);
        fs.symlinkSync(privateFile, filename);
      }
      return open(...args);
    });
    assert.throws(() => readInterfaceThemeFile(filename, 32));
    assert.equal(fs.readFileSync(privateFile, 'utf8'), 'private');
  }
);

it('rejects a replacement regular file and closes the opened descriptor', (t) => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'seerr-theme-replace-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'theme.css');
  const replacement = path.join(directory, 'replacement.css');
  fs.writeFileSync(filename, 'safe');
  fs.writeFileSync(replacement, 'other');
  const open = fs.openSync;
  let descriptor: number | undefined;
  t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
    if (args[0] === filename) fs.renameSync(replacement, filename);
    descriptor = open(...args);
    return descriptor;
  });
  assert.throws(
    () => readInterfaceThemeFile(filename, 32),
    /changed while opening/
  );
  assert.notEqual(descriptor, undefined);
  assert.throws(() => fs.fstatSync(descriptor!), { code: 'EBADF' });
});
