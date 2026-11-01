import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const emailTemplatesPath = require.resolve('email-templates');
const htmlToTextPath =
  createRequire(emailTemplatesPath).resolve('html-to-text');
const deepmergePath = createRequire(htmlToTextPath).resolve('deepmerge');
const deepmerge = createRequire(deepmergePath)(deepmergePath);

const assertNoPoisonedPrototype = (value, property) => {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.equal(value[property], undefined);
  assert.equal({}[property], undefined);
};

test('deepmerge rejects source __proto__ keys on null-prototype targets', () => {
  const source = JSON.parse('{"__proto__":{"seerrngPolluted":true}}');
  const result = deepmerge(Object.create(null), source);

  assertNoPoisonedPrototype(result, 'seerrngPolluted');
});

test('deepmerge rejects nested source __proto__ keys on null placeholders', () => {
  const source = JSON.parse(
    '{"session":{"__proto__":{"seerrngPolluted":true}}}'
  );
  const result = deepmerge({ session: null }, source);

  assertNoPoisonedPrototype(result.session, 'seerrngPolluted');
});

test('deepmerge rejects own __proto__ keys copied from merge targets', () => {
  const target = JSON.parse('{"__proto__":{"seerrngPolluted":true}}');
  const result = deepmerge(target, {});

  assertNoPoisonedPrototype(result, 'seerrngPolluted');
});

test('deepmerge rejects __proto__ keys while cloning array objects', () => {
  const item = JSON.parse('{"__proto__":{"seerrngPolluted":true}}');
  const result = deepmerge([], [item]);

  assertNoPoisonedPrototype(result[0], 'seerrngPolluted');
});
