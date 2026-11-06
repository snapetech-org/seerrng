import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { getRegionalFormatLocale } from './formatLocale';

describe('regional date formatting', () => {
  it('keeps the display language while applying a different format region', () => {
    const locale = getRegionalFormatLocale('en', 'DE');
    const intl = createIntl({ locale });
    const date = new Date('2026-07-03T12:34:00.000Z');
    const options = {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    } as const;

    const formatted = intl.formatDate(date, options);

    expect(locale).toBe('en-DE');
    expect(formatted).toBe(
      new Intl.DateTimeFormat(locale, options).format(date)
    );
    expect(formatted).not.toBe(
      new Intl.DateTimeFormat('en', options).format(date)
    );
  });
});
