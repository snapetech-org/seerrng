#!/usr/bin/env node
/* eslint-disable no-console */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compareKeys = ([left], [right]) =>
  left < right ? -1 : left > right ? 1 : 0;
const snapshot = {
  schemaVersion: 1,
  algorithm: 'sha256',
};

for (const [domain, filename] of [
  ['client', 'src/i18n/locale/en.json'],
  ['server', 'server/i18n/locale/en.json'],
]) {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, filename), 'utf8')
  );
  snapshot[domain] = Object.fromEntries(
    Object.entries(catalog)
      .sort(compareKeys)
      .map(([id, message]) => {
        if (typeof message !== 'string' || !message.trim()) {
          throw new Error(filename + ':' + id + ' must be a non-empty string.');
        }
        const hash = createHash('sha256')
          .update(message, 'utf8')
          .digest('hex');
        return [id, hash];
      })
  );
}

const target = path.join(root, 'config/i18n/source-snapshot.json');
fs.writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n');
console.log('Updated client and server English source fingerprints.');
