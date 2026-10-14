import assert from 'node:assert/strict';
import test from 'node:test';

import { getLocaleDirection } from '@app/utils/localeDirection';

test('right-to-left locales include Arabic and Hebrew tags', () => {
  assert.equal(getLocaleDirection('ar'), 'rtl');
  assert.equal(getLocaleDirection('ar-SA'), 'rtl');
  assert.equal(getLocaleDirection('he'), 'rtl');
  assert.equal(getLocaleDirection('he_IL'), 'rtl');
});

test('left-to-right locale tags remain left-to-right', () => {
  assert.equal(getLocaleDirection('en'), 'ltr');
  assert.equal(getLocaleDirection('zh-CN'), 'ltr');
});
