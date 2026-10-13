import assert from 'node:assert/strict';
import test from 'node:test';

import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import {
  canRequestFromService,
  getRequestServiceKey,
  parseRequestServiceKey,
} from '@server/lib/requestServices';

test('request service grants apply only to their exact instance and service', () => {
  const user = new User({ requestServices: ['radarr:12'] });

  assert.equal(canRequestFromService(user, 'radarr', 12), true);
  assert.equal(canRequestFromService(user, 'radarr', 13), false);
  assert.equal(canRequestFromService(user, 'sonarr', 12), false);
});

test('advanced request managers retain access to configured instances', () => {
  const user = new User({ permissions: Permission.REQUEST_ADVANCED });

  assert.equal(canRequestFromService(user, 'sonarr', 12), true);
});

test('request service keys reject malformed and unsafe identifiers', () => {
  assert.deepEqual(parseRequestServiceKey('sonarr:0'), {
    serviceType: 'sonarr',
    serverId: 0,
  });
  assert.equal(parseRequestServiceKey('radarr:-1'), undefined);
  assert.equal(parseRequestServiceKey('radarr:1.5'), undefined);
  assert.equal(parseRequestServiceKey('radarr:9007199254740992'), undefined);
  assert.equal(parseRequestServiceKey('readarr:12'), undefined);
  assert.equal(getRequestServiceKey('radarr', 12), 'radarr:12');
});
