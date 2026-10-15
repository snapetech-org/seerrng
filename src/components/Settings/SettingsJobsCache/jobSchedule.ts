const minuteScheduleOptions = [3, 5, 10, 15, 20, 30, 60];

export const getScheduleMinutes = (
  cronSchedule: string,
  fallback = 5
): number => {
  const cronFields = cronSchedule.trim().split(/\s+/);
  const minuteFieldIndex = cronFields.length === 5 ? 0 : 1;
  const intervalMatch = cronFields[minuteFieldIndex]?.match(/^\*\/(\d+)$/);

  if (!intervalMatch) {
    return fallback;
  }

  const interval = Number(intervalMatch[1]);

  return Number.isSafeInteger(interval) && interval > 0 ? interval : fallback;
};

export const getMinuteScheduleOptions = (selectedMinutes: number): number[] =>
  [...new Set([...minuteScheduleOptions, selectedMinutes])].sort(
    (first, second) => first - second
  );
