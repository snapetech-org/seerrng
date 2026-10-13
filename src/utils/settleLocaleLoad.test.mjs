import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { settleLocaleLoad } from './settleLocaleLoad.mjs';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
};

describe('settleLocaleLoad', () => {
  it('does not let a stale failed chunk cancel the latest language selection', async () => {
    const staleRequest = deferred();
    const latestRequest = deferred();
    let requestedLocale = 'en';
    let loadedLocale = 'en';
    let activeLocale = 'en';
    let staleRequestIsActive = true;

    requestedLocale = 'ar';
    const staleLoad = settleLocaleLoad(staleRequest.promise, {
      isActive: () => staleRequestIsActive,
      onSuccess: () => {
        loadedLocale = 'ar';
        activeLocale = 'ar';
      },
      onFailure: () => {
        requestedLocale = loadedLocale;
      },
    });

    requestedLocale = 'id';
    staleRequestIsActive = false;
    const latestLoad = settleLocaleLoad(latestRequest.promise, {
      isActive: () => requestedLocale === 'id',
      onSuccess: (messages) => {
        loadedLocale = 'id';
        activeLocale = 'id';
        assert.equal(messages.language, 'Bahasa Indonesia');
      },
      onFailure: () => {
        requestedLocale = loadedLocale;
      },
    });

    staleRequest.reject(new Error('Arabic chunk unavailable'));
    await staleLoad;
    assert.equal(requestedLocale, 'id');

    latestRequest.resolve({ language: 'Bahasa Indonesia' });
    await latestLoad;
    assert.equal(requestedLocale, 'id');
    assert.equal(activeLocale, 'id');
    assert.equal(loadedLocale, 'id');
  });

  it('recovers the active failed selection to the last loaded locale', async () => {
    const request = deferred();
    let requestedLocale = 'id';
    const loadedLocale = 'en';
    let recovered = false;

    const load = settleLocaleLoad(request.promise, {
      isActive: () => true,
      onSuccess: () => {
        assert.fail('A rejected locale load cannot succeed.');
      },
      onFailure: () => {
        requestedLocale = loadedLocale;
        recovered = true;
      },
    });

    request.reject(new Error('Indonesian chunk unavailable'));
    await load;
    assert.equal(requestedLocale, 'en');
    assert.equal(recovered, true);
  });
});
