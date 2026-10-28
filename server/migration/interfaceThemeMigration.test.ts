import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

for (const dialect of ['sqlite', 'postgres']) {
  test(`${dialect} interface migration defaults to Orig and retains an explicit John preset`, () => {
    const source = readFileSync(
      `server/migration/${dialect}/1792700000000-AddUserInterfaceTheme.ts`,
      'utf8'
    );
    assert.match(
      source,
      /ADD COLUMN "interfaceTheme" varchar NOT NULL DEFAULT 'seerrOrig'/
    );
    assert.match(
      source,
      /SET "interfaceTheme" = 'seerrNGJ' WHERE "advancedThemeOverrides" LIKE .*john-redesign/
    );
    assert.match(source, /DROP COLUMN "interfaceTheme"/);
  });
}
