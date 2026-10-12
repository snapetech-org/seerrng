import { Linter } from 'eslint';
import assert from 'node:assert/strict';
import test from 'node:test';
import formatjs from './formatjs-no-offset.mjs';

const linter = new Linter();
const config = [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { formatjs },
    rules: { 'formatjs/no-offset': 'error' },
  },
];

const lint = (source) =>
  linter
    .verify(source, config)
    .map(({ ruleId, message }) => ({ ruleId, message }));

test('the local FormatJS rule allows plural messages without offsets', () => {
  assert.deepEqual(
    lint(
      "intl.formatMessage({ defaultMessage: '{count, plural, one {# item} other {# items}}' });"
    ),
    []
  );
});

test('the local FormatJS rule rejects offsets in nested plural messages', () => {
  assert.deepEqual(
    lint(
      "intl.formatMessage({ defaultMessage: '{count, plural, one {{nested, plural, offset:1 one {#} other {#}}} other {# items}}' });"
    ).map(({ ruleId }) => ruleId),
    ['formatjs/no-offset']
  );
});

test('the local FormatJS rule covers defineMessages and JSX descriptors', () => {
  const messages = lint(`
    defineMessages({
      count: { defaultMessage: '{count, plural, offset:1 one {#} other {#}}' }
    });
    const element = <FormattedMessage defaultMessage="{count, plural, offset:1 one {#} other {#}}" />;
  `);
  assert.equal(messages.length, 2);
  assert.ok(messages.every(({ ruleId }) => ruleId === 'formatjs/no-offset'));
});

test('the local FormatJS rule covers SeerrNG namespace message dictionaries', () => {
  const messages = lint(`
    defineMessages('components.Example', {
      count: '{count, plural, offset:1 one {#} other {#}}'
    });
  `);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, 'formatjs/no-offset');
});

test('the local FormatJS rule retains parser errors for static message text', () => {
  const [diagnostic] = lint(
    "intl.formatMessage({ defaultMessage: '{count, plural, one {#}' });"
  );
  assert.equal(diagnostic.ruleId, 'formatjs/no-offset');
  assert.match(diagnostic.message, /^Failed to parse message string/u);
});
