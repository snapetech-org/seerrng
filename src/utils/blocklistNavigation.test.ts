import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isBlocklistMutationRequest,
  shouldShowBlocklistNavigation,
} from './blocklistNavigation';

describe('blocklist navigation visibility', () => {
  it('hides an empty blocklist unless its route is active or the count failed', () => {
    assert.equal(
      shouldShowBlocklistNavigation({
        count: 0,
        hasError: false,
        isBlocklistRoute: false,
      }),
      false
    );
    assert.equal(
      shouldShowBlocklistNavigation({
        hasError: false,
        isBlocklistRoute: false,
      }),
      false
    );
    assert.equal(
      shouldShowBlocklistNavigation({
        count: 0,
        hasError: false,
        isBlocklistRoute: true,
      }),
      true
    );
    assert.equal(
      shouldShowBlocklistNavigation({
        hasError: true,
        isBlocklistRoute: false,
      }),
      true
    );
    assert.equal(
      shouldShowBlocklistNavigation({
        count: 0,
        hasError: true,
        isBlocklistRoute: false,
      }),
      true
    );
  });

  it('shows the navigation when entries exist', () => {
    assert.equal(
      shouldShowBlocklistNavigation({
        count: 1,
        hasError: false,
        isBlocklistRoute: false,
      }),
      true
    );
  });
});

describe('blocklist mutation request matching', () => {
  it('matches successful mutation endpoints across blocklist routes', () => {
    assert.equal(isBlocklistMutationRequest('post', '/api/v1/blocklist'), true);
    assert.equal(
      isBlocklistMutationRequest(
        'delete',
        'https://seerr.example/api/v1/blocklist/collection/42'
      ),
      true
    );
  });

  it('ignores reads, unrelated endpoints, and similarly prefixed paths', () => {
    assert.equal(isBlocklistMutationRequest('get', '/api/v1/blocklist'), false);
    assert.equal(
      isBlocklistMutationRequest('post', '/api/v1/blocklisted'),
      false
    );
    assert.equal(isBlocklistMutationRequest('post', undefined), false);
  });
});
