import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDurationMinutes,
  formatDurationParts,
  formatLocalizedList,
  formatUnit,
} from './numberHelpers';

describe('locale-aware number and duration formatters', () => {
  it('formats durations with locale-aware CLDR unit names', () => {
    expect(formatDurationMinutes(2, 'en')).toBe('2 minutes');
    expect(formatDurationMinutes(22, 'ar')).toContain('دقيقة');
    expect(formatUnit(1, 'hour', 'en', 0)).toBe('1 hour');
  });

  it('joins playtime units using the locale list pattern', () => {
    expect(formatDurationParts(1, 2, 'en')).toBe('1 hour and 2 minutes');
    expect(formatDurationParts(0, 2, 'en')).toBe('2 minutes');
    expect(formatDurationParts(0, 0, 'en')).toBe('0 minutes');
  });

  it('formats natural-language lists with the locale list pattern', () => {
    expect(formatLocalizedList(['Ada', 'Grace'], 'en')).toBe('Ada and Grace');
    expect(formatLocalizedList([], 'en')).toBe('');
  });

  it('keeps byte units short while localizing the numeric representation', () => {
    expect(formatBytes(1048576, 1, 'en')).toBe('1 MB');
    expect(formatBytes(1536, 1, 'de-DE')).toContain('1,5');
  });
});
