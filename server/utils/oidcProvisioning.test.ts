import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Permission } from '@server/lib/permissions';
import {
  getOidcRolePermissions,
  isOidcProvisioningAllowed,
} from './oidcProvisioning';

describe('isOidcProvisioningAllowed', () => {
  it('preserves existing open registration when no allowlist is configured', () => {
    assert.strictEqual(
      isOidcProvisioningAllowed({}, 'user@example.com', {}),
      true
    );
  });

  it('matches an exact email domain without accepting lookalikes or subdomains', () => {
    const policy = { allowedEmailDomains: ['Example.com'] };
    assert.strictEqual(
      isOidcProvisioningAllowed(policy, 'user@EXAMPLE.COM', {}),
      true
    );
    assert.strictEqual(
      isOidcProvisioningAllowed(policy, 'user@sub.example.com', {}),
      false
    );
    assert.strictEqual(
      isOidcProvisioningAllowed(policy, 'user@example.com.attacker.test', {}),
      false
    );
  });

  it('requires every configured allowlist and accepts string or array groups', () => {
    const policy = {
      allowedEmailDomains: ['example.com'],
      groupClaim: 'memberOf',
      allowedGroups: ['seerr-users'],
    };

    assert.strictEqual(
      isOidcProvisioningAllowed(policy, 'user@example.com', {
        memberOf: ['other-group', 'seerr-users'],
      }),
      true
    );
    assert.strictEqual(
      isOidcProvisioningAllowed(policy, 'user@example.com', {
        memberOf: 'other-group',
      }),
      false
    );
    assert.strictEqual(
      isOidcProvisioningAllowed(policy, 'user@other.example', {
        memberOf: 'seerr-users',
      }),
      false
    );
  });

  it('fails closed for empty or malformed allowlists', () => {
    assert.strictEqual(
      isOidcProvisioningAllowed(
        { allowedEmailDomains: [] },
        'user@example.com',
        {}
      ),
      false
    );
    assert.strictEqual(
      isOidcProvisioningAllowed(
        { allowedEmailDomains: ['*.example.com'] },
        'user@example.com',
        {}
      ),
      false
    );
    assert.strictEqual(
      isOidcProvisioningAllowed(
        { allowedGroups: ['seerr-users'] },
        'user@example.com',
        {}
      ),
      false
    );
  });
});

describe('getOidcRolePermissions', () => {
  const defaultPermissions = Permission.REQUEST | Permission.VIEW_ISSUES;

  it('does not change existing permissions when role mapping is not configured', () => {
    assert.strictEqual(
      getOidcRolePermissions({}, {}, defaultPermissions),
      undefined
    );
  });

  it('maps only explicit claim values to administrator access', () => {
    const policy = {
      roleClaim: 'groups',
      roleMappings: [{ value: 'seerr-admins', role: 'admin' as const }],
    };
    assert.strictEqual(
      getOidcRolePermissions(policy, { groups: ['users', 'seerr-admins'] }, 0),
      Permission.ADMIN
    );
    assert.strictEqual(
      getOidcRolePermissions(policy, { groups: ['users'] }, defaultPermissions),
      defaultPermissions
    );
  });

  it('assigns normal user defaults for mapped or unknown non-admin claims', () => {
    const policy = {
      roleClaim: 'role',
      roleMappings: [{ value: 'member', role: 'user' as const }],
    };
    assert.strictEqual(
      getOidcRolePermissions(policy, { role: 'member' }, defaultPermissions),
      defaultPermissions
    );
    assert.strictEqual(
      getOidcRolePermissions(policy, { role: 'unmapped' }, defaultPermissions),
      defaultPermissions
    );
  });

  it('falls back to normal user permissions when provider mapping is malformed', () => {
    assert.strictEqual(
      getOidcRolePermissions(
        {
          roleClaim: 'groups',
          roleMappings: [{ value: 'admins', role: 'superuser' }],
        },
        { groups: ['admins'] },
        defaultPermissions
      ),
      defaultPermissions
    );
  });
});
