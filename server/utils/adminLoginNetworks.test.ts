import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  isClientIpAllowedForAdministratorLogin as allowed,
  parseAdministratorLoginNetworks as parse,
} from './adminLoginNetworks';

it('accepts bounded IPv4, IPv6 and mapped peers only inside configured subnets', () => {
  const networks = '192.0.2.0/24,2001:db8::/32';
  for (const ip of ['192.0.2.10', '::ffff:192.0.2.10', '2001:db8::10'])
    assert.equal(allowed(ip, networks), true);
  for (const ip of [
    '192.0.3.10',
    '2001:db9::10',
    '127.0.0.1',
    '192.0.2.10, 127.0.0.1',
    undefined,
  ])
    assert.equal(allowed(ip, networks), false);
});

it('fails closed for missing, malformed and oversized policy and refreshes cached rules', () => {
  for (const networks of [
    '',
    'example.com',
    '192.0.2.1/33',
    '::1/129',
    '192.0.2.0/24/1',
    '192.0.2.0/-1',
    'x'.repeat(4097),
    Array(101).fill('192.0.2.1').join(','),
  ]) {
    assert.equal(allowed('192.0.2.1', networks), false);
    if (networks) assert.ok('error' in parse(networks));
  }
  assert.equal(allowed('192.0.2.1', '192.0.2.0/24'), true);
  assert.equal(allowed('192.0.2.1', '198.51.100.0/24'), false);
});
