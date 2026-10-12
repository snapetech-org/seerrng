import { Linter } from 'eslint';
import assert from 'node:assert/strict';
import test from 'node:test';
import nextjsRules from './nextjs-rules.mjs';

const linter = new Linter();
const config = [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        document: 'readonly',
        globalThis: 'readonly',
        location: 'readonly',
        self: 'readonly',
        window: 'readonly',
      },
    },
    plugins: { '@next/next': nextjsRules },
    rules: { '@next/next/no-location-assign-relative-destination': 'warn' },
  },
];

const lint = (source) =>
  linter
    .verify(source, config)
    .filter(
      ({ ruleId }) =>
        ruleId === '@next/next/no-location-assign-relative-destination'
    );

test('the local Next rule flags relative location navigation forms', () => {
  const messages = lint(`
    location.assign('/settings');
    window.location['assign']('/profile');
    globalThis.location.href = '/requests';
    document.location.href = '/settings';
  `);
  assert.equal(messages.length, 4);
});

test('the local Next rule follows constant strings and template prefixes', () => {
  const messages = lint(
    "const target = '/settings'; location.assign(target); location.assign(`/requests/${id}`);"
  );
  assert.equal(messages.length, 2);
});

test('the local Next rule allows absolute URLs and shadowed location objects', () => {
  const messages = lint(`
    location.assign('https://example.test/settings');
    window.location.href = '//example.test/profile';
    function local(location) {
      location.assign('/local');
    }
    function localWindow(window) {
      window.location.assign('/local');
    }
  `);
  assert.equal(messages.length, 0);
});
