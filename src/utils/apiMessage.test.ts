import { apiMessagePatterns, apiMessages } from '@app/i18n/apiMessages';
import { createIntl, createIntlCache } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { formatApiMessage, matchApiMessage } from './apiMessage';

describe('API message catalog and formatting', () => {
  it('preserves authored English text and every captured value through ICU formatting', () => {
    const intl = createIntl(
      {
        locale: 'en',
        onError: (error) => {
          throw error;
        },
      },
      createIntlCache()
    );
    for (const [key, parts] of apiMessagePatterns) {
      const values = Object.fromEntries(
        parts
          .slice(1)
          .map((_, index) => [
            `value${index}`,
            `⟦data-${index}: {x} <b> & كتاب⟧`,
          ])
      );
      const expected = parts
        .map((part, index) => part + (values[`value${index}`] ?? ''))
        .join('');
      expect(
        intl.formatMessage(apiMessages[key], values),
        apiMessages[key].id
      ).toBe(expected);
    }
  });

  it('localizes a known phrase without changing its raw response/control-flow value', () => {
    const raw = 'A browser session is required.';
    const match = matchApiMessage(raw)!;
    const intl = createIntl(
      {
        locale: 'de',
        messages: {
          [apiMessages[match.key].id]: 'Eine Browsersitzung ist erforderlich.',
        },
      },
      createIntlCache()
    );
    const response = { message: raw, code: 'UNAUTHORIZED' };
    expect(formatApiMessage(intl, response.message)).toBe(
      'Eine Browsersitzung ist erforderlich.'
    );
    expect(response).toEqual({ message: raw, code: 'UNAUTHORIZED' });
    expect(
      formatApiMessage(intl, 'My provider wrote this exact sentence')
    ).toBe('My provider wrote this exact sentence');
  });
});
