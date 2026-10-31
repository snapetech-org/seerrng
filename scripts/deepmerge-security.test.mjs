import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const emailTemplatesPath = require.resolve('email-templates');
const htmlToTextPath =
  createRequire(emailTemplatesPath).resolve('html-to-text');
const deepmergePath = createRequire(htmlToTextPath).resolve('deepmerge');
const deepmerge = createRequire(deepmergePath)(deepmergePath);

test('deepmerge rejects own __proto__ keys on null-prototype merge targets', () => {
  const source = JSON.parse('{"__proto__":{"seerrngPolluted":true}}');
  const result = deepmerge(Object.create(null), source);

  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.equal(result.seerrngPolluted, undefined);
  assert.equal({}.seerrngPolluted, undefined);
});
