import CollectionRatings from '@app/components/CollectionDetails/CollectionRatings';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import { getCollectionMemberRatings } from '@app/utils/collectionRatings';
import defineMessages from '@app/utils/defineMessages';
import { getEffectiveVideoRatings } from '@app/utils/videoRatings';
import type { RatingResponse } from '@server/api/ratings';
import { useIntl } from 'react-intl';

interface VideoRatingsProps {
  mediaType: 'movie' | 'tv';
  id: number;
  voteAverage?: number;
  voteCount?: number;
  ratings?: RatingResponse;
  loading?: boolean;
}

const messages = defineMessages('components.VideoRatings', {
  imdbVotes: 'IMDb user score – votes: {formattedCount}',
});

export const videoRatingSources = [
  'critics',
  'audience',
  'imdb',
  'metacritic',
  'trakt',
  'tmdb',
] as const;

// Keep the same provider slots even when a service has no score for this title.
export const getVideoRatingItems = ({
  mediaType,
  id,
  voteAverage = 0,
  voteCount = 0,
  ratings,
}: VideoRatingsProps) => {
  const effective = getEffectiveVideoRatings(ratings);
  const items = getCollectionMemberRatings(
    { id, voteAverage, voteCount },
    ratings
  );
  return videoRatingSources.map((source) => {
    const item = items.find((rating) => rating.source === source)!;
    switch (source) {
      case 'critics':
        return { ...item, value: effective.rtCriticsScore };
      case 'audience':
        return { ...item, value: effective.rtAudienceScore };
      case 'imdb':
        return { ...item, value: effective.imdbScore, href: effective.imdbUrl };
      case 'tmdb':
        return {
          ...item,
          href: `https://www.themoviedb.org/${mediaType}/${id}`,
        };
      default:
        return item;
    }
  });
};

const VideoRatings = (props: VideoRatingsProps) => {
  const intl = useIntl();
  const upstream = useUpstreamTheme();
  const effective = getEffectiveVideoRatings(props.ratings);
  return (
    <CollectionRatings
      ratings={getVideoRatingItems(props).filter(
        (item) => !upstream || item.value !== undefined
      )}
      loading={props.loading}
      unknownValue="--"
      loadingValue="--"
      reserveValueSpace
      tooltips={{
        imdb: effective.imdbVotes
          ? intl.formatMessage(messages.imdbVotes, {
              formattedCount: intl.formatNumber(effective.imdbVotes, {
                notation: 'compact',
                compactDisplay: 'short',
                maximumFractionDigits: 1,
              }),
            })
          : undefined,
      }}
    />
  );
};

export default VideoRatings;
