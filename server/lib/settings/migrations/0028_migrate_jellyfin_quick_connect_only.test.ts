import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import migrate from './0028_migrate_jellyfin_quick_connect_only';

describe('unified Jellyfin Quick Connect-only setting', () => {
  for (const enabled of [true, false]) {
    it(`preserves legacy policy ${enabled}`, () => {
      const settings = { main: { quickConnectOnly: enabled } };
      const result = migrate(settings);
      assert.equal(result.main.jellyfinQuickConnectOnly, enabled);
      assert.equal(Object.hasOwn(result.main, 'quickConnectOnly'), false);
    });
  }
  it('keeps an explicit canonical policy and is idempotent', () => {
    const settings = {
      main: { quickConnectOnly: true, jellyfinQuickConnectOnly: false },
    };
    const first = migrate(settings);
    assert.equal(first.main.jellyfinQuickConnectOnly, false);
    const snapshot = JSON.stringify(first);
    assert.equal(migrate(first), first);
    assert.equal(JSON.stringify(first), snapshot);
  });
  it('does not invent a media-server configuration in empty settings', () => {
    const result = migrate({});
    assert.equal(result.main, undefined);
    assert.deepEqual(result.migrations, [
      '0028_migrate_jellyfin_quick_connect_only',
    ]);
  });
});
