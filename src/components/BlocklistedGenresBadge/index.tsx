import { compactBlocklistSourceBadgeClass } from '@app/components/BlocklistedTagsBadge';
import Badge from '@app/components/Common/Badge';
import Tooltip from '@app/components/Common/Tooltip';
import defineMessages from '@app/utils/defineMessages';
import { FilmIcon } from '@heroicons/react/24/solid';
import type { TmdbGenre } from '@server/api/themoviedb/interfaces';
import type { BlocklistItem } from '@server/interfaces/api/blocklistInterfaces';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.BlocklistedGenresBadge', {
  blocklistGenre: 'Blocklist Genre',
  loading: 'Loading genres…',
  invalidGenreIds: 'No valid genre IDs are stored.',
  invalidGenreId: 'Invalid genre ID: {id}',
  unavailable: 'Genre names are unavailable.',
  sourceTooltip:
    'Automatically blocked because this title matched a configured genre rule. Matching genres: {genres}.',
});

interface BlocklistedGenresBadgeProps {
  data: BlocklistItem;
}

const BlocklistedGenresBadge = ({ data }: BlocklistedGenresBadgeProps) => {
  const intl = useIntl();
  const canResolveGenres =
    data.mediaType === 'movie' || data.mediaType === 'tv';
  const genreUrl = canResolveGenres ? `/api/v1/genres/${data.mediaType}` : null;
  const { data: genres, error } = useSWR<TmdbGenre[]>(
    data.blocklistedGenres ? genreUrl : null
  );
  const genreNames = useMemo(() => {
    if (!data.blocklistedGenres) {
      return '';
    }

    const genreIds = [
      ...new Set(
        data.blocklistedGenres
          .split(',')
          .filter((genreId) => /^\d+$/.test(genreId))
      ),
    ];

    if (genreIds.length === 0) {
      return intl.formatMessage(messages.invalidGenreIds);
    }
    if (!canResolveGenres) {
      return genreIds
        .map((id) => intl.formatMessage(messages.invalidGenreId, { id }))
        .join(', ');
    }
    if (!genres) {
      return error
        ? intl.formatMessage(messages.unavailable)
        : intl.formatMessage(messages.loading);
    }

    const namesById = new Map(genres.map((genre) => [genre.id, genre.name]));
    return genreIds
      .map(
        (id) =>
          namesById.get(Number(id)) ||
          intl.formatMessage(messages.invalidGenreId, { id })
      )
      .join(', ');
  }, [canResolveGenres, data.blocklistedGenres, error, genres, intl]);

  return (
    <Tooltip
      content={intl.formatMessage(messages.sourceTooltip, {
        genres: genreNames || intl.formatMessage(messages.loading),
      })}
      tooltipConfig={{ followCursor: false }}
    >
      <Badge
        badgeType="dark"
        shape="standard"
        className={compactBlocklistSourceBadgeClass}
      >
        <FilmIcon aria-hidden="true" />
        <span>{intl.formatMessage(messages.blocklistGenre)}</span>
      </Badge>
    </Tooltip>
  );
};

export default BlocklistedGenresBadge;
