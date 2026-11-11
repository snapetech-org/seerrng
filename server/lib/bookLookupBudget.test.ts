import {
  BookLookupTimeoutError,
  getBookLookupBudget,
  withBookLookupBudget,
} from '@server/lib/bookLookupBudget';
import { CanceledError } from 'axios';
import assert from 'node:assert/strict';
import { it } from 'node:test';

it('restores the owned deadline when a transport reports cancellation', async () => {
  await assert.rejects(
    withBookLookupBudget(
      () =>
        new Promise((_resolve, reject) => {
          getBookLookupBudget()!.signal.addEventListener('abort', () => {
            reject(new CanceledError('canceled'));
          });
        }),
      20
    ),
    (error) => error instanceof BookLookupTimeoutError
  );
});

it('preserves cancellation unrelated to the owned deadline', async () => {
  const canceled = new CanceledError('caller canceled');
  await assert.rejects(
    withBookLookupBudget(async () => {
      throw canceled;
    }),
    (error) => error === canceled
  );
});

it('nested provider fallbacks share the original deadline', async () => {
  await withBookLookupBudget(async () => {
    const outer = getBookLookupBudget();
    await withBookLookupBudget(async () => {
      assert.equal(getBookLookupBudget(), outer);
    }, 1);
    assert.equal(getBookLookupBudget(), outer);
  });
  assert.equal(getBookLookupBudget(), undefined);
});
