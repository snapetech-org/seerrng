import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { copyServerAssets } from './copy-server-assets.mjs';

const temporaryDirectories = [];

const createProjectDirectory = async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'seerrng-copy-server-assets-')
  );
  temporaryDirectories.push(directory);
  return directory;
};

const writeProjectFile = async (projectDirectory, relativePath, contents) => {
  const filePath = path.join(projectDirectory, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('server asset copying', () => {
  it('preserves build paths and copies only the assets each output needs', async () => {
    const projectDirectory = await createProjectDirectory();
    await writeProjectFile(
      projectDirectory,
      'server/templates/email/resetpassword/html.pug',
      'reset template'
    );
    await writeProjectFile(
      projectDirectory,
      'server/templates/email/resetpassword/notes.txt',
      'not a template'
    );
    await writeProjectFile(
      projectDirectory,
      'server/templates/email/resetpassword/.hidden.pug',
      'hidden template'
    );
    await writeProjectFile(
      projectDirectory,
      'server/i18n/locale/en.json',
      '{"locale":"en"}'
    );
    await writeProjectFile(
      projectDirectory,
      'server/i18n/locale/.hidden.json',
      '{"locale":"hidden"}'
    );
    await writeProjectFile(
      projectDirectory,
      'server/i18n/locale/nested/fr.json',
      '{"locale":"nested"}'
    );
    await writeProjectFile(
      projectDirectory,
      'server/i18n/not-a-locale.json',
      '{"locale":"wrong"}'
    );
    await writeProjectFile(
      projectDirectory,
      'themes/seerrOrig/manifest.json',
      '{"id":"seerrOrig"}'
    );
    await writeProjectFile(
      projectDirectory,
      'themes/seerrOrig/.private',
      'hidden theme file'
    );

    await copyServerAssets(projectDirectory);

    assert.equal(
      await readFile(
        path.join(
          projectDirectory,
          'dist/templates/email/resetpassword/html.pug'
        ),
        'utf8'
      ),
      'reset template'
    );
    assert.equal(
      await readFile(
        path.join(projectDirectory, 'dist/i18n/locale/en.json'),
        'utf8'
      ),
      '{"locale":"en"}'
    );
    assert.equal(
      await readFile(
        path.join(
          projectDirectory,
          'dist/interface-themes/seerrOrig/manifest.json'
        ),
        'utf8'
      ),
      '{"id":"seerrOrig"}'
    );
    await assert.rejects(
      readFile(
        path.join(
          projectDirectory,
          'dist/templates/email/resetpassword/notes.txt'
        )
      ),
      { code: 'ENOENT' }
    );
    await assert.rejects(
      readFile(
        path.join(
          projectDirectory,
          'dist/templates/email/resetpassword/.hidden.pug'
        )
      ),
      { code: 'ENOENT' }
    );
    await assert.rejects(
      readFile(path.join(projectDirectory, 'dist/i18n/not-a-locale.json')),
      { code: 'ENOENT' }
    );
    await assert.rejects(
      readFile(path.join(projectDirectory, 'dist/i18n/locale/nested/fr.json')),
      { code: 'ENOENT' }
    );
    await assert.rejects(
      readFile(
        path.join(projectDirectory, 'dist/interface-themes/seerrOrig/.private')
      ),
      { code: 'ENOENT' }
    );
  });
});
