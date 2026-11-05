import { MediaRequestStatus, MediaType } from '@server/constants/media';
import * as datasource from '@server/datasource';
import { BookRequestSearch } from '@server/entity/BookRequestSearch';
import { MediaRequest } from '@server/entity/MediaRequest';
import MediaRequestStatusEvent from '@server/entity/MediaRequestStatusEvent';
import { RequestDispatchOutbox } from '@server/entity/RequestDispatchOutbox';
import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { reconcileActiveRequests } from './requestStatus';

afterEach(() => {
  mock.restoreAll();
});

it('continues reconciliation when an active request has no linked media', async () => {
  const request = {
    id: 42,
    status: MediaRequestStatus.PENDING,
    type: MediaType.MOVIE,
    is4k: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    requestedBy: { id: 7 },
    media: null,
  } as unknown as MediaRequest;
  const requestRepository = {
    find: mock.fn(async () => [request]),
    findOne: mock.fn(async () => request),
  };
  const statusEventRepository = {
    findOne: mock.fn(async () => null),
  };
  const dispatchRepository = {
    exists: mock.fn(async () => false),
  };
  const bookSearchRepository = {
    find: mock.fn(async () => []),
  };

  mock.method(datasource, 'getRepository', ((entity: unknown) => {
    if (entity === MediaRequest) return requestRepository;
    if (entity === MediaRequestStatusEvent) return statusEventRepository;
    if (entity === RequestDispatchOutbox) return dispatchRepository;
    if (entity === BookRequestSearch) return bookSearchRepository;
    throw new Error('Unexpected request-status repository');
  }) as never);

  await assert.doesNotReject(reconcileActiveRequests());
  assert.equal(requestRepository.find.mock.callCount(), 1);
  assert.equal(requestRepository.findOne.mock.callCount(), 1);
});
