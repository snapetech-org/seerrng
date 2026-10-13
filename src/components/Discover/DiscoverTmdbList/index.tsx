import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import useDiscoverScrollRestoration from '@app/hooks/useDiscoverScrollRestoration';
import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import defineMessages from '@app/utils/defineMessages';
import { isTmdbPublicListId } from '@server/constants/discover';
import type { MovieResult, TvResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverTmdbList', {
  list: 'TMDB List',
  loadErrorTitle: 'TMDB List Could Not Be Loaded',
  loadErrorDescription:
    'The list may be private, unavailable, or temporarily unreachable.',
  invalidListTitle: 'TMDB List ID Is Invalid',
  invalidListDescription: 'Enter a valid positive TMDB list ID.',
  retryDescription: 'Retry loading this TMDB list.',
});

const DiscoverTmdbList = () => {
  const router = useRouter();
  const intl = useIntl();
  const listId =
    typeof router.query.listId === 'string' ? router.query.listId : '';
  const validListId = isTmdbPublicListId(listId);
  const discover = useDiscover<
    MovieResult | TvResult,
    { list: { name: string; description: string } }
  >(`/api/v1/discover/list/${listId}`, undefined, {
    enabled: router.isReady && validListId,
    showErrorToast: false,
    hideErrorWithResults: false,
  });
  const title =
    discover.firstResultData?.list?.name || intl.formatMessage(messages.list);

  useSearchActivityReporter(
    discover.isLoadingInitialData ||
      discover.isLoadingMore ||
      discover.isValidating,
    'tmdb-list-discovery'
  );
  useDiscoverScrollRestoration({
    mediaType: 'movieOrTv',
    itemCount: discover.titles.length,
    shuffleSeed: discover.shuffleSeed,
    isLoading: discover.isLoadingInitialData || discover.isLoadingMore,
    isReachingEnd: discover.isReachingEnd,
    fetchMore: discover.fetchMore,
  });

  const invalidListId = router.isReady && !validListId;

  return (
    <>
      <PageTitle title={title} />
      <div>
        <Header>{title}</Header>
      </div>
      {invalidListId ? (
        <PageErrorMessage
          title={intl.formatMessage(messages.invalidListTitle)}
          description={intl.formatMessage(messages.invalidListDescription)}
        />
      ) : discover.error ? (
        <PageErrorMessage
          title={intl.formatMessage(messages.loadErrorTitle)}
          description={intl.formatMessage(messages.loadErrorDescription)}
          retry={{
            onClick: () => discover.mutate?.(),
            tooltip: intl.formatMessage(messages.retryDescription),
            busy: discover.isValidating,
          }}
        />
      ) : (
        <ListView
          items={discover.titles}
          isEmpty={discover.isEmpty}
          isLoading={
            !router.isReady ||
            discover.isLoadingInitialData ||
            (discover.isLoadingMore && discover.titles.length > 0)
          }
          isReachingEnd={discover.isReachingEnd}
          onScrollBottom={discover.fetchMore}
        />
      )}
    </>
  );
};

export default DiscoverTmdbList;
