import type BookRequestSearch from '@server/entity/BookRequestSearch';
import type { ReadarrSettings } from '@server/lib/settings';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bookOrbitRequestLinks } from './bookorbitRequestLinks';

const service = {
  id: 7,
  backend: 'bookorbit',
  syncEnabled: true,
  useSsl: true,
  hostname: 'books.example',
  port: 443,
  baseUrl: '/library',
  bookorbitUsername: 'private',
  apiKey: 'secret',
} as ReadarrSettings;
const operation = (format: 'ebook' | 'audiobook', id: number | null) =>
  ({
    serviceId: 7,
    format,
    bookorbitRequestId: id,
    providerManagedSearch: false,
    state: 'needs_review',
  }) as BookRequestSearch;

describe('BookOrbit request actions', () => {
  it('links each active format to its own request without exposing credentials', () => {
    const links = bookOrbitRequestLinks(
      [operation('ebook', 31), operation('audiobook', 32)],
      [service]
    );
    assert.deepEqual(links, [
      { format: 'ebook', url: 'https://books.example/library/requests/31' },
      {
        format: 'audiobook',
        url: 'https://books.example/library/requests/32',
      },
    ]);
    assert.ok(!JSON.stringify(links).includes('secret'));
    assert.ok(!JSON.stringify(links).includes('private'));
  });

  it('omits unrelated, unavailable, or malformed operations', () => {
    assert.deepEqual(
      bookOrbitRequestLinks(
        [
          operation('ebook', null),
          operation('audiobook', -1),
          { ...operation('ebook', 31), state: 'available' },
          { ...operation('ebook', 31), providerManagedSearch: true },
          { ...operation('ebook', 31), serviceId: 999 },
        ],
        [service]
      ),
      []
    );
    assert.deepEqual(
      bookOrbitRequestLinks(
        [operation('ebook', 31)],
        [{ ...service, syncEnabled: false }]
      ),
      []
    );
  });
});
