import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isValidURL } from './urlValidationHelper';

describe('isValidURL', () => {
  it('accepts empty values and ordinary HTTP URLs', () => {
    assert.strictEqual(isValidURL(''), true);
    assert.strictEqual(isValidURL(undefined), true);
    assert.strictEqual(isValidURL('https://example.com/path'), true);
  });

  it('rejects unsafe protocols, userinfo, and control characters', () => {
    assert.strictEqual(isValidURL('javascript:alert(1)'), false);
    assert.strictEqual(
      isValidURL('https://trusted.example@attacker.example/path'),
      false
    );
    assert.strictEqual(
      isValidURL('https://example.com/path\nnext-line'),
      false
    );
  });
});
