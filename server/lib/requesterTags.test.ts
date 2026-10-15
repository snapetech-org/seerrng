import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Tag } from '@server/api/servarr/base';
import {
  resolveRequesterTag,
  type RequesterTagClient,
} from '@server/lib/requesterTags';

const makeTag = (id: number, label: string): Tag => ({ id, label });

describe('requester tag resolution', () => {
  it('prefers the current label and avoids adding a duplicate configured tag', async () => {
    let createCalls = 0;
    const client: RequesterTagClient = {
      getTags: async () => [
        makeTag(15, '7 - Old label'),
        makeTag(16, '7-New label'),
      ],
      createTag: async () => {
        createCalls += 1;
        return makeTag(17, '7-New label');
      },
    };

    const result = await resolveRequesterTag(client, [12, 16], 7, '7-Name');

    assert.deepEqual(result, { tags: [12, 16], created: false });
    assert.equal(createCalls, 0);
  });

  it('creates and appends the requester tag while retaining configured tags', async () => {
    let createdLabel = '';
    const client: RequesterTagClient = {
      getTags: async () => [],
      createTag: async ({ label }) => {
        createdLabel = label;
        return makeTag(19, label);
      },
    };

    const result = await resolveRequesterTag(client, [12], 7, '7-Name');

    assert.deepEqual(result, { tags: [12, 19], created: true });
    assert.equal(createdLabel, '7-Name');
  });

  it('keeps configured tags and does not mutate them when lookup fails', async () => {
    const originalTags = [12, 13];
    const client: RequesterTagClient = {
      getTags: async () => {
        throw new Error('temporary tag service outage');
      },
      createTag: async () => makeTag(19, '7-Name'),
    };

    const result = await resolveRequesterTag(client, originalTags, 7, '7-Name');

    assert.deepEqual(result, {
      tags: [12, 13],
      created: false,
      failureStage: 'lookup',
    });
    assert.deepEqual(originalTags, [12, 13]);
    assert.notStrictEqual(result.tags, originalTags);
  });

  it('keeps configured and request override tags when creation fails', async () => {
    const originalTags = [12, 18];
    const client: RequesterTagClient = {
      getTags: async () => [],
      createTag: async () => {
        throw new Error('temporary tag service outage');
      },
    };

    const result = await resolveRequesterTag(client, originalTags, 7, '7-Name');

    assert.deepEqual(result, {
      tags: [12, 18],
      created: false,
      failureStage: 'create',
    });
    assert.deepEqual(originalTags, [12, 18]);
  });
});
