import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Settings, { type AllSettings } from '..';
import migrate from './0029_preserve_frontend_choice';

setupTestDb();

test('upgrades preserve native home access; fresh setup defaults to included Lumen', () => {
  for (const initialized of [true, false]) {
    const settings = { main: {}, public: { initialized } } as AllSettings;
    const result = migrate(settings);
    assert.equal(result.main.defaultFrontend, initialized ? 'native' : 'lumen');
    assert.equal(
      migrate(result).main.defaultFrontend,
      result.main.defaultFrontend
    );
  }
});
test('explicit interface and companion choices survive subsequent loads', () => {
  for (const choice of ['native', 'lumen', 'external'] as const) {
    const settings = {
      main: {
        defaultFrontend: choice,
        lumenPublicUrl: 'https://lumen.example',
      },
      public: { initialized: true },
    } as AllSettings;
    assert.equal(migrate(settings).main.defaultFrontend, choice);
    assert.equal(settings.main.lumenPublicUrl, 'https://lumen.example');
  }
});

test('disk-backed loading and restart preserve the installation frontend policy', async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'frontend-policy-')
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const settingsPath = path.join(directory, 'settings.json');
  const fresh = await new Settings(undefined, settingsPath).load();
  assert.equal(fresh.main.defaultFrontend, 'lumen');
  assert.equal(fresh.public.initialized, false);
  const defaults = JSON.parse(await fs.readFile(settingsPath, 'utf8'));

  for (const selected of [undefined, 'native', 'lumen', 'external'] as const) {
    const legacy = {
      ...defaults,
      public: { ...defaults.public, initialized: true },
      main: {
        ...defaults.main,
        defaultFrontend: selected,
        lumenPublicUrl: selected === 'external' ? 'https://lumen.example' : '',
      },
    };
    await fs.writeFile(settingsPath, JSON.stringify(legacy), { mode: 0o600 });
    const upgraded = await new Settings(undefined, settingsPath).load();
    assert.equal(upgraded.main.defaultFrontend, selected ?? 'native');
    const restarted = await new Settings(undefined, settingsPath).load();
    assert.equal(restarted.main.defaultFrontend, selected ?? 'native');
    assert.equal(restarted.main.lumenPublicUrl, legacy.main.lumenPublicUrl);
  }
});
