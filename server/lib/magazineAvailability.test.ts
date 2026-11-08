import { MediaStatus } from '@server/constants/media';
import type { MediaRequestServiceTarget } from '@server/entity/MediaRequest';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { isMagazineRequestFileAvailable } from './magazineAvailability';
const target: MediaRequestServiceTarget = {
  serviceType: 'lazylibrarian',
  format: 'magazine',
  serverId: 0,
  externalServiceId: 0,
  status: MediaStatus.PROCESSING,
};
it('requires an observed file at the requested magazine destination, including service zero', () => {
  const media = {
    status: MediaStatus.AVAILABLE,
    serviceId: 0,
    externalServiceId: 0,
  };
  const request = { serverId: 0, serviceTargets: [target] };
  assert.equal(isMagazineRequestFileAvailable(media, request), true);
  assert.equal(
    isMagazineRequestFileAvailable(
      { ...media, status: MediaStatus.PROCESSING },
      request
    ),
    false
  );
  assert.equal(
    isMagazineRequestFileAvailable({ ...media, serviceId: 1 }, request),
    false
  );
  assert.equal(
    isMagazineRequestFileAvailable({ ...media, serviceId: null }, request),
    false
  );
  assert.equal(
    isMagazineRequestFileAvailable(media, { ...request, serverId: 1 }),
    false
  );
  assert.equal(isMagazineRequestFileAvailable(media, { serverId: 0 }), true);
  assert.equal(isMagazineRequestFileAvailable(media, {}), false);
  assert.equal(
    isMagazineRequestFileAvailable(media, {
      serviceTargets: [{ ...target, serviceType: 'readarr', format: 'ebook' }],
    }),
    false
  );
});

it('retains an observed file when another service is scanned without files', () => {
  const request = {
    serverId: 0,
    serviceTargets: [{ ...target, status: MediaStatus.AVAILABLE }],
  };
  assert.equal(
    isMagazineRequestFileAvailable(
      { status: MediaStatus.PROCESSING, serviceId: 1 },
      request
    ),
    true
  );
  assert.equal(
    isMagazineRequestFileAvailable(
      { status: MediaStatus.DELETED, serviceId: 1 },
      request
    ),
    true
  );
  assert.equal(
    isMagazineRequestFileAvailable(
      { status: MediaStatus.PROCESSING, serviceId: 0 },
      { ...request, serviceTargets: [target] }
    ),
    false
  );
});
