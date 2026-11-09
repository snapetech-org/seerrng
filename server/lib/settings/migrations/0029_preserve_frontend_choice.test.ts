import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AllSettings } from '..';
import migrate from './0029_preserve_frontend_choice';

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
