import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  editionIdKey,
  isProviderBookEdition,
  localEditionIdFrom,
  localEditionRef,
  sameEditionId,
} from './bookEdition';

test('localEditionRef and localEditionIdFrom round-trip positive safe integers only', () => {
  assert.equal(localEditionRef(17337), 'local:17337');
  assert.equal(localEditionIdFrom('local:5'), 5);
  assert.equal(localEditionIdFrom('LOCAL:5'), 5);
  assert.equal(localEditionIdFrom(' local:17337 '), 17337);

  assert.equal(localEditionIdFrom('local:0'), undefined);
  assert.equal(localEditionIdFrom('local:-1'), undefined);
  assert.equal(localEditionIdFrom('local:05'), undefined);
  assert.equal(localEditionIdFrom('local:9007199254740992'), undefined);
  assert.equal(localEditionIdFrom('local:abc'), undefined);
  assert.equal(localEditionIdFrom('hc:5'), undefined);
  assert.equal(localEditionIdFrom('gr:5'), undefined);
  assert.equal(localEditionIdFrom('5'), undefined);
  assert.equal(localEditionIdFrom(''), undefined);
  assert.equal(localEditionIdFrom(null), undefined);
  assert.equal(localEditionIdFrom(undefined), undefined);
});

test('local edition IDs stay provider-level choices isolated from provider/bare IDs', () => {
  assert.equal(isProviderBookEdition('local:5'), true);
  assert.equal(isProviderBookEdition('LOCAL:17337'), true);

  assert.equal(editionIdKey('local:5'), 'local:5');
  assert.equal(editionIdKey('LOCAL:5'), 'local:5');

  assert.equal(sameEditionId('local:5', 'LOCAL:5'), true);
  assert.equal(sameEditionId('local:5', 'hc:5'), false);
  assert.equal(sameEditionId('local:5', 'gr:5'), false);
  assert.equal(sameEditionId('local:5', '5'), false);
});
