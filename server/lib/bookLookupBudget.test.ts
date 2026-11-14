import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BookLookupTimeoutError,
  isBookLookupTimeout,
  withBookLookupBudget,
} from '@server/lib/bookLookupBudget';

describe('bookLookupBudget', () => {
  it('aborts a lookup that outlives its budget with a BookLookupTimeoutError', async () => {
    await assert.rejects(
      withBookLookupBudget(
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
        5
      ),
      (error: unknown) => isBookLookupTimeout(error)
    );
  });

  it('recognizes a lookup timeout anywhere in the cause chain', () => {
    const wrapped = new Error('Bookshelf lookup failed for audiobook term', {
      cause: new Error('fallback failed', {
        cause: new BookLookupTimeoutError(),
      }),
    });

    assert.equal(isBookLookupTimeout(wrapped), true);
    assert.equal(
      isBookLookupTimeout(new Error('Invalid provider configuration')),
      false
    );
    assert.equal(isBookLookupTimeout(undefined), false);

    const cyclic = new Error('cyclic');
    cyclic.cause = cyclic;
    assert.equal(isBookLookupTimeout(cyclic), false);
  });

  it('keeps the existing timeout message', () => {
    assert.equal(
      new BookLookupTimeoutError().message,
      'Book metadata lookup timed out. Please retry.'
    );
  });
});
