import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const htmlToText = createRequire(require.resolve('email-templates')).resolve(
  'html-to-text'
);
const consumers = [
  ['email rendering', createRequire(htmlToText)],
  ['Formik', createRequire(require.resolve('formik'))],
  [
    'SVG optimization',
    createRequire(
      createRequire(require.resolve('@svgr/webpack')).resolve(
        '@svgr/plugin-svgo'
      )
    ),
  ],
];
for (const [consumer, consumerRequire] of consumers) {
  const root = dirname(consumerRequire.resolve('deepmerge/package.json'));
  for (const entry of ['dist/cjs.js', 'dist/umd.js', 'dist/es.js']) {
    const path = join(root, entry);
    if (!existsSync(path)) continue;
    test(`${consumer} ${entry} rejects prototype keys from both merge operands`, async () => {
      const merge = entry.endsWith('/es.js')
        ? (
            await import(
              `data:text/javascript;base64,${readFileSync(path).toString('base64')}`
            )
          ).default
        : createRequire(path)(path);
      const poisoned = () =>
        JSON.parse('{"__proto__":{"seerrngPoisoned":true}}');
      const targets = [
        {},
        Object.create(null),
        poisoned(),
        JSON.parse('{"__proto__":null}'),
        JSON.parse('{"__proto__":0}'),
      ];
      for (const target of targets) {
        for (const source of [{}, poisoned()]) {
          const result = merge(target, source);
          assert.equal(Object.getPrototypeOf(result), Object.prototype);
          assert.equal(Object.hasOwn(result, '__proto__'), false);
          assert.equal(result.seerrngPoisoned, undefined);
        }
      }
      const nested = merge(
        { values: [poisoned()], nested: poisoned() },
        { nested: {} }
      );
      assert.equal(nested.values[0].seerrngPoisoned, undefined);
      assert.equal(nested.nested.seerrngPoisoned, undefined);
      assert.equal({}.seerrngPoisoned, undefined);
      assert.deepEqual(
        merge.all([
          { values: ['a'], nested: { a: 1 } },
          { values: ['b'], nested: { b: 2 } },
        ]),
        { values: ['a', 'b'], nested: { a: 1, b: 2 } }
      );
    });
  }
}
