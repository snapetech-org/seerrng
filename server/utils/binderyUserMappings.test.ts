import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBinderyUserMappings } from './binderyUserMappings';

test('Bindery ownership links accept only bounded explicit numeric account IDs', () => {
  assert.deepEqual(
    parseBinderyUserMappings({ '2': 7, '2147483647': 2147483647 }),
    {
      value: { '2': 7, '2147483647': 2147483647 },
    }
  );
  assert.deepEqual(parseBinderyUserMappings({}), { value: {} });
  for (const invalid of [
    null,
    [],
    '2:7',
    { '0': 7 },
    { '-1': 7 },
    { '01': 7 },
    { '2': '7' },
    { '2': 0 },
    { '2': 1.5 },
    { '2': Number.NaN },
    { '2147483648': 7 },
    { '2': 2147483648 },
    JSON.parse('{"__proto__":7}'),
    Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [String(i + 1), 7])
    ),
  ]) {
    assert.ok('error' in parseBinderyUserMappings(invalid));
  }
});
