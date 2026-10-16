import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canReportMovieIssue,
  canReportSeriesIssue,
  getIssueMediaAndFormatLabel,
  getReportableIssueQualities,
  getReportableIssueSeasons,
} from '@app/components/IssueDetails/issueMediaFormat';
import { MediaStatus, MediaType } from '@server/constants/media';

test('issue media labels include the saved movie and series quality', () => {
  assert.equal(
    getIssueMediaAndFormatLabel(MediaType.MOVIE, false),
    'Movie · HD'
  );
  assert.equal(
    getIssueMediaAndFormatLabel(MediaType.MOVIE, true),
    'Movie · 4K'
  );
  assert.equal(getIssueMediaAndFormatLabel(MediaType.TV, false), 'Series · HD');
  assert.equal(getIssueMediaAndFormatLabel(MediaType.TV, true), 'Series · 4K');
  assert.equal(
    getIssueMediaAndFormatLabel(MediaType.MUSIC, false),
    'Music · Album'
  );
  assert.equal(getIssueMediaAndFormatLabel(MediaType.BOOK, false), 'Book');
});

test('issue quality choices include available and processing qualities', () => {
  assert.deepEqual(
    getReportableIssueQualities({
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
    }),
    ['hd']
  );
  assert.deepEqual(
    getReportableIssueQualities({
      status: MediaStatus.UNKNOWN,
      status4k: MediaStatus.AVAILABLE,
    }),
    ['4k']
  );
  assert.deepEqual(
    getReportableIssueQualities({
      status: MediaStatus.PARTIALLY_AVAILABLE,
      status4k: MediaStatus.AVAILABLE,
    }),
    ['hd', '4k']
  );
  assert.deepEqual(
    getReportableIssueQualities({
      status: MediaStatus.PROCESSING,
      status4k: MediaStatus.UNKNOWN,
    }),
    ['hd']
  );
  assert.deepEqual(
    getReportableIssueQualities({
      status: MediaStatus.UNKNOWN,
      status4k: MediaStatus.PROCESSING,
    }),
    ['4k']
  );
});

test('movie and series issue eligibility includes processing with quality permissions preserved', () => {
  assert.equal(canReportMovieIssue({ status: MediaStatus.PROCESSING }), true);
  assert.equal(
    canReportMovieIssue({ status: MediaStatus.PARTIALLY_AVAILABLE }),
    false
  );
  assert.equal(
    canReportMovieIssue({ status4k: MediaStatus.PROCESSING }),
    false
  );
  assert.equal(
    canReportMovieIssue({ status4k: MediaStatus.PROCESSING }, true),
    true
  );
  assert.equal(
    canReportSeriesIssue({ status: MediaStatus.PARTIALLY_AVAILABLE }),
    true
  );
  assert.equal(
    canReportSeriesIssue({ status4k: MediaStatus.PROCESSING }, true),
    true
  );
  assert.equal(canReportSeriesIssue({ status: MediaStatus.UNKNOWN }), false);
});

test('series issue seasons follow the selected quality and include processing seasons', () => {
  const seasons = [
    {
      seasonNumber: 1,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
    },
    {
      seasonNumber: 2,
      status: MediaStatus.PROCESSING,
      status4k: MediaStatus.PROCESSING,
    },
    {
      seasonNumber: 3,
      status: MediaStatus.PARTIALLY_AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
    },
    {
      seasonNumber: 4,
      status: MediaStatus.UNKNOWN,
      status4k: MediaStatus.AVAILABLE,
    },
  ];

  assert.deepEqual(getReportableIssueSeasons(seasons, false), [1, 2, 3]);
  assert.deepEqual(getReportableIssueSeasons(seasons, true), [2, 4]);
});
