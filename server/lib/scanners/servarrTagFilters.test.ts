import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  getServarrSyncExcludedTagsForEndpoint,
  getServarrSyncServerIdsForEndpoint,
} from './servarrTagFilters';

it('does not apply another protocol endpoint tag policy or clear its availability', () => {
  const http = {
    id: 1,
    hostname: '127.0.0.1',
    port: 8989,
    baseUrl: '',
    useSsl: false,
    syncEnabled: true,
    syncExcludedTags: [11],
  };
  const https = { ...http, id: 2, useSsl: true, syncExcludedTags: [22] };
  const aliases = { ...http, id: 3, syncExcludedTags: [33] };
  assert.deepEqual(
    getServarrSyncExcludedTagsForEndpoint(http, [http, https, aliases]),
    [11, 33]
  );
  assert.deepEqual(
    getServarrSyncServerIdsForEndpoint(http, [http, https, aliases]),
    [1, 3]
  );
});
