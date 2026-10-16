import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadIndex } from './index.mjs';

const validIndex = () => ({
  issues: [
    {
      number: 1,
      title: 'A bounded issue',
      state: 'open',
      url: 'https://github.com/snapetech-org/seerrng/issues/1',
      body_preview: 'Details',
      labels: ['bug'],
    },
  ],
  embeddings: [[0.5, -0.5]],
});

const withIndexFile = (value, callback) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'seerr-duplicate-index-')
  );
  try {
    const indexPath = path.join(directory, 'issue_index.json');
    fs.writeFileSync(indexPath, JSON.stringify(value), { mode: 0o600 });
    return callback(indexPath, directory);
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
};

test('loadIndex accepts bounded aligned issue embeddings', () => {
  withIndexFile(validIndex(), (indexPath) => {
    assert.deepEqual(loadIndex(indexPath), validIndex());
  });
});

test('loadIndex rejects mismatched and malformed embeddings', () => {
  const mismatched = validIndex();
  mismatched.embeddings = [];
  withIndexFile(mismatched, (indexPath) => {
    assert.throws(() => loadIndex(indexPath), /top-level shape/u);
  });

  const invalidComponent = validIndex();
  invalidComponent.embeddings[0][0] = 2;
  withIndexFile(invalidComponent, (indexPath) => {
    assert.throws(() => loadIndex(indexPath), /invalid embedding/u);
  });
});

test(
  'loadIndex rejects linked artifact paths',
  {
    skip:
      process.platform === 'win32'
        ? 'Windows requires elevated symbolic-link privileges; Linux CI runs this boundary test.'
        : false,
  },
  () => {
    withIndexFile(validIndex(), (indexPath, directory) => {
      const linkPath = path.join(directory, 'linked-index.json');
      fs.symlinkSync(indexPath, linkPath);
      assert.throws(() => loadIndex(linkPath), /private regular file/u);
    });
  }
);
