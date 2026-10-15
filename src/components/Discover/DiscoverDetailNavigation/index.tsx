import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import globalMessages from '@app/i18n/globalMessages';
import {
  DISCOVER_NAVIGATION_QUERY_PARAM,
  getDiscoverNavigationPath,
  getDiscoverNavigationState,
  type DiscoverNavigationMediaType,
  type DiscoverNavigationState,
} from '@app/utils/discoverNavigation';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

interface DiscoverDetailNavigationProps {
  id: number;
  mediaType: DiscoverNavigationMediaType;
}

const DiscoverDetailNavigation = ({
  id,
  mediaType,
}: DiscoverDetailNavigationProps) => {
  const router = useRouter();
  const intl = useIntl();
  const [navigationState, setNavigationState] =
    useState<DiscoverNavigationState>();
  const contextId = router.query[DISCOVER_NAVIGATION_QUERY_PARAM];
  const routeId = router.query[mediaType === 'movie' ? 'movieId' : 'tvId'];

  useEffect(() => {
    if (
      !router.isReady ||
      typeof contextId !== 'string' ||
      typeof routeId !== 'string' ||
      Number(routeId) !== id
    ) {
      setNavigationState(undefined);
      return;
    }

    setNavigationState(
      getDiscoverNavigationState(contextId, { id, mediaType })
    );
  }, [contextId, id, mediaType, routeId, router.isReady]);

  const previousItem = navigationState?.previous;
  const nextItem = navigationState?.next;

  if (!previousItem && !nextItem) {
    return null;
  }

  const navigateToItem = (
    item: NonNullable<typeof previousItem | typeof nextItem>
  ) => {
    if (typeof contextId !== 'string') {
      return;
    }

    const path = getDiscoverNavigationPath(item, contextId);
    void router.push(path, path);
  };

  return (
    <>
      {previousItem && (
        <Tooltip content={intl.formatMessage(globalMessages.previous)}>
          <Button
            buttonType="ghost"
            buttonSize="sm"
            iconOnly
            aria-label={intl.formatMessage(globalMessages.previous)}
            data-testid="discover-previous"
            onClick={() => navigateToItem(previousItem)}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
        </Tooltip>
      )}
      {nextItem && (
        <Tooltip content={intl.formatMessage(globalMessages.next)}>
          <Button
            buttonType="ghost"
            buttonSize="sm"
            iconOnly
            aria-label={intl.formatMessage(globalMessages.next)}
            data-testid="discover-next"
            onClick={() => navigateToItem(nextItem)}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </Tooltip>
      )}
    </>
  );
};

export default DiscoverDetailNavigation;
