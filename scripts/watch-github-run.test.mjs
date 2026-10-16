import assert from 'node:assert/strict';
import test from 'node:test';

import { watchGitHubRun } from './watch-github-run.mjs';

const transientError = (status) =>
  new Error(`failed to get jobs: HTTP ${status}`);

test('retries a transient job-list error while the child run is active', async () => {
  const calls = [];
  const delays = [];
  const messages = [];
  let watchAttempts = 0;

  await watchGitHubRun('snapetech-org/seerrng', 123, {
    runGitHub: async (args) => {
      calls.push(args);
      if (args[0] === 'run') {
        watchAttempts += 1;
        if (watchAttempts === 1) {
          throw transientError(502);
        }
        return '';
      }

      return JSON.stringify({ status: 'in_progress' });
    },
    sleep: async (duration) => delays.push(duration),
    onRetry: (message) => messages.push(message),
  });

  assert.equal(watchAttempts, 2);
  assert.deepEqual(delays, [15_000]);
  assert.match(messages[0], /active run 123/u);
  assert.deepEqual(calls[0], [
    'run',
    'watch',
    '123',
    '--repo',
    'snapetech-org/seerrng',
    '--interval',
    '15',
    '--exit-status',
  ]);
});

test('retries when both watch and run-status calls hit transient server errors', async () => {
  const delays = [];
  let watchAttempts = 0;
  let statusAttempts = 0;

  await watchGitHubRun('snapetech-org/seerrng', 456, {
    runGitHub: async (args) => {
      if (args[0] === 'run') {
        watchAttempts += 1;
        if (watchAttempts === 1) {
          throw transientError(502);
        }
        return '';
      }

      statusAttempts += 1;
      if (statusAttempts === 1) {
        throw transientError(503);
      }
      return JSON.stringify({ status: 'in_progress' });
    },
    sleep: async (duration) => delays.push(duration),
  });

  assert.equal(watchAttempts, 2);
  assert.equal(statusAttempts, 1);
  assert.deepEqual(delays, [15_000]);
});

test('preserves a failed child conclusion instead of retrying it as an API error', async () => {
  await assert.rejects(
    watchGitHubRun('snapetech-org/seerrng', 789, {
      runGitHub: async (args) => {
        if (args[0] === 'run') {
          throw transientError(502);
        }

        return JSON.stringify({ status: 'completed', conclusion: 'failure' });
      },
      sleep: async () => assert.fail('completed failures must not be retried'),
    }),
    /run 789 completed with failure/u
  );
});

test('rejects child failures returned by gh run watch', async () => {
  await assert.rejects(
    watchGitHubRun('snapetech-org/seerrng', 321, {
      runGitHub: async (args) => {
        if (args[0] === 'run') {
          throw new Error('workflow failed');
        }

        return JSON.stringify({ status: 'completed', conclusion: 'failure' });
      },
    }),
    /run 321 completed with failure/u
  );
});
