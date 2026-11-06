import { apiMessagePatterns, apiMessages } from '@app/i18n/apiMessages';
import type { IntlShape } from 'react-intl';
import { createApiMessageMatcher } from './apiMessageMatcher';

export const matchApiMessage = createApiMessageMatcher(apiMessagePatterns);

/** Localize display copy without changing the response or any captured value. */
export const formatApiMessage = (
  intl: Pick<IntlShape, 'formatMessage'>,
  message: string
): string => {
  const match = matchApiMessage(message);
  return match
    ? intl.formatMessage(apiMessages[match.key], match.values)
    : message;
};
