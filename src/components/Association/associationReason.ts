import type { AssociationEdge } from '@app/hooks/useAssociations';
import defineMessages from '@app/utils/defineMessages';
import type { IntlShape } from 'react-intl';

const messages = defineMessages('components.Association.Reason', {
  sharesGenre: 'Shares {genre}',
  similarToneAudience: 'Similar tone and audience',
  oftenRecommended: 'Often recommended with this',
  nearbyListenerOverlap: 'Nearby listener overlap',
  similarArtist: 'Similar artist',
  alsoByAuthor: 'Also by {authorName}',
  sameAuthor: 'Same author',
  personScoredThis: '{personName} scored this',
  personWorkedOnSound: '{personName} worked on the sound',
  personAppearsInThis: '{personName} appears in this',
  personWorkedOnThis: '{personName} worked on this',
  personConnectedToThis: '{personName} is connected to this',
  personAlsoMakesMusic: '{personName} also makes music',
});

export const formatAssociationReason = (
  intl: Pick<IntlShape, 'formatMessage'>,
  edge: Partial<Pick<AssociationEdge, 'reason' | 'reasonKey' | 'reasonValues'>>
): string =>
  edge.reasonKey
    ? intl.formatMessage(messages[edge.reasonKey], edge.reasonValues)
    : (edge.reason ?? '');
