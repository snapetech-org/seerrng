import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getMinuteScheduleOptions, getScheduleMinutes } from './jobSchedule';

describe('job schedule editor', () => {
  it('reads the minute cadence from a six-field cron schedule', () => {
    const scheduleMinutes = getScheduleMinutes('0 */3 * * * *');

    assert.equal(scheduleMinutes, 3);
    assert.ok(
      getMinuteScheduleOptions(scheduleMinutes).includes(scheduleMinutes)
    );
  });

  it('reads the minute cadence from a five-field cron schedule', () => {
    assert.equal(getScheduleMinutes('*/7 * * * *'), 7);
  });

  it('uses the default when the cron minute field is not a simple interval', () => {
    assert.equal(getScheduleMinutes('0 15 * * * *'), 5);
  });

  it('keeps the current cadence available beside the standard choices', () => {
    assert.deepEqual(
      getMinuteScheduleOptions(7),
      [3, 5, 7, 10, 15, 20, 30, 60]
    );
  });
});
