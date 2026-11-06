import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getIntl } from './index';

test('account email callers receive an initialized formatter before explicit startup initialization', () => {
  const intl = getIntl('en');
  assert.equal(intl.locale, 'en');
  assert.equal(
    intl.formatMessage(
      { id: 'test.lazy-initialization', defaultMessage: 'Ready, {name}' },
      { name: 'reader' }
    ),
    'Ready, reader'
  );
  assert.equal(getIntl('en'), intl);
});
