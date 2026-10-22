import CachedImage from '@app/components/Common/CachedImage';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import {
  getUserServiceAvailability,
  isConfiguredMediaCategoryEnabled,
} from '@app/utils/serviceAvailability';
import axios from 'axios';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

type Category = 'retro' | 'modern' | 'game';
type PreviewGame = {
  igdbId: number;
  title: string;
  coverUrl: string;
  releaseDate: string;
  availability?:
    'available' | 'tracked' | 'downloading' | 'missing' | 'unknown';
};
type PreviewItem = PreviewGame & { category: Category };

const messages = defineMessages('components.Search.SoftwarePreview', {
  title: 'Software',
  seeAll: 'See all software results',
  available: 'In library',
});

const SoftwareSearchPreview = ({ query }: { query: string }) => {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const { user, hasPermission } = useUser();
  const serviceAvailability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const categories = (['retro', 'modern', 'game'] as const).filter(
    (category) =>
      currentSettings.softwareEnabled &&
      (category === 'game' || currentSettings.romarrEnabled) &&
      isConfiguredMediaCategoryEnabled(category, serviceAvailability)
  );
  const categoryKey = categories.join(',');
  const { data } = useSWR<PreviewItem[]>(
    query && categories.length
      ? ['software-search-preview', query, categoryKey]
      : null,
    async () => {
      const responses = await Promise.allSettled(
        categories.map(async (category) => {
          const params = new URLSearchParams({
            category,
            q: query,
            limit: '4',
          });
          const response = await axios.get<{ results: PreviewGame[] }>(
            `/api/v1/request/software/catalog/search?${params.toString()}`
          );
          return response.data.results.map((game) => ({ ...game, category }));
        })
      );
      const successful = responses.flatMap((response) =>
        response.status === 'fulfilled' ? response.value : []
      );
      if (responses.every((response) => response.status === 'rejected')) {
        throw new Error('Software catalog search failed.');
      }
      const seen = new Set<number>();
      return successful.filter((game) => {
        if (seen.has(game.igdbId)) return false;
        seen.add(game.igdbId);
        return true;
      });
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  if (!data?.length) return null;

  return (
    <section className="mt-6" aria-label={intl.formatMessage(messages.title)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">
          {intl.formatMessage(messages.title)}
        </h2>
        <Link
          href={{ pathname: '/search', query: { query, type: 'software' } }}
          className="text-sm text-indigo-300 hover:text-indigo-200"
        >
          {intl.formatMessage(messages.seeAll)}
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {data.slice(0, 6).map((game) => (
          <li key={`${game.category}-${game.igdbId}`}>
            <Link
              href={{
                pathname: '/software',
                query: { category: game.category, game: game.igdbId },
              }}
              className="block h-full overflow-hidden rounded-lg border border-gray-700 bg-gray-800 hover:border-indigo-400"
            >
              <div className="relative aspect-[2/3] bg-gray-900">
                <CachedImage
                  type="tmdb"
                  src={game.coverUrl || '/images/seerr_poster_not_found.png'}
                  alt=""
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-2 text-sm">
                <p className="line-clamp-2 font-medium text-white">
                  {game.title}
                </p>
                {game.availability === 'available' && (
                  <p className="mt-1 text-xs text-indigo-200">
                    {intl.formatMessage(messages.available)}
                  </p>
                )}
                {game.releaseDate && (
                  <p className="mt-1 text-xs text-gray-400">
                    {game.releaseDate}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default SoftwareSearchPreview;
