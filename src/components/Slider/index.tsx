import Button from '@app/components/Common/Button';
import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import TitleCard from '@app/components/TitleCard';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  getDiscoverHistoryEntryKey,
  readDiscoverSliderScrollPosition,
  saveDiscoverSliderScrollPosition,
} from '@app/utils/discoverScrollRestoration';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
} from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Slider', {
  emptyTitle: 'No Results',
});

export const DiscoverSliderScrollRestorationContext = createContext(false);

interface SliderProps {
  heading: React.ReactNode;
  notice?: React.ReactNode;
  isActive?: boolean;
  sliderKey: string;
  items?: JSX.Element[];
  isLoading: boolean;
  isEmpty?: boolean;
  emptyMessage?: React.ReactNode;
  placeholder?: React.ReactNode;
  compact?: boolean;
  disableItemContentVisibility?: boolean;
}

enum Direction {
  RIGHT,
  LEFT,
}

const Slider = ({
  heading,
  notice,
  isActive = true,
  sliderKey,
  items,
  isLoading,
  isEmpty = false,
  emptyMessage,
  placeholder = <TitleCard.Placeholder />,
  compact = false,
  disableItemContentVisibility = false,
}: SliderProps) => {
  const intl = useIntl();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const scrollSaveTimeoutRef = useRef<number | undefined>(undefined);
  const historyEntryKeyRef = useRef<string | undefined>(undefined);
  const activeSliderKeyRef = useRef(sliderKey);
  const hasRestoredHorizontalScrollRef = useRef(false);
  const latestScrollPositionRef = useRef(0);
  const restoreHorizontalScroll = useContext(
    DiscoverSliderScrollRestorationContext
  );
  const [scrollPos, setScrollPos] = useState({ isStart: true, isEnd: false });
  const scrollPosRef = useRef(scrollPos);

  const setScrollPosition = useCallback(
    (nextScrollPos: { isStart: boolean; isEnd: boolean }) => {
      if (
        scrollPosRef.current.isStart === nextScrollPos.isStart &&
        scrollPosRef.current.isEnd === nextScrollPos.isEnd
      ) {
        return;
      }

      scrollPosRef.current = nextScrollPos;
      setScrollPos(nextScrollPos);
    },
    []
  );

  const handleScroll = useCallback(() => {
    const margin = 5;
    const scrollWidth = containerRef.current?.scrollWidth ?? 0;
    const clientWidth =
      containerRef.current?.getBoundingClientRect().width ?? 0;
    const scrollPosition = containerRef.current?.scrollLeft ?? 0;

    if (!items || items?.length === 0) {
      setScrollPosition({ isStart: true, isEnd: true });
    } else if (clientWidth >= scrollWidth) {
      setScrollPosition({ isStart: true, isEnd: true });
    } else if (
      scrollPosition >=
      (containerRef.current?.scrollWidth ?? 0) - clientWidth - margin
    ) {
      setScrollPosition({ isStart: false, isEnd: true });
    } else if (scrollPosition > margin) {
      setScrollPosition({ isStart: false, isEnd: false });
    } else {
      setScrollPosition({ isStart: true, isEnd: false });
    }
  }, [items, setScrollPosition]);

  const debouncedScroll = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(handleScroll, 50);
  }, [handleScroll]);

  useEffect(() => {
    const handleResize = () => {
      debouncedScroll();
    };

    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.clearTimeout(debounceRef.current);
    };
  }, [debouncedScroll]);

  useEffect(() => {
    handleScroll();
  }, [items, handleScroll]);

  useLayoutEffect(() => {
    if (!restoreHorizontalScroll) {
      return;
    }

    const container = containerRef.current;
    historyEntryKeyRef.current = getDiscoverHistoryEntryKey();

    return () => {
      window.clearTimeout(scrollSaveTimeoutRef.current);
      if (!hasRestoredHorizontalScrollRef.current) {
        return;
      }

      saveDiscoverSliderScrollPosition(
        historyEntryKeyRef.current,
        activeSliderKeyRef.current,
        container?.scrollLeft ?? latestScrollPositionRef.current
      );
    };
  }, [restoreHorizontalScroll]);

  useLayoutEffect(() => {
    if (activeSliderKeyRef.current !== sliderKey) {
      window.clearTimeout(scrollSaveTimeoutRef.current);
      if (hasRestoredHorizontalScrollRef.current) {
        saveDiscoverSliderScrollPosition(
          historyEntryKeyRef.current,
          activeSliderKeyRef.current,
          containerRef.current?.scrollLeft ?? latestScrollPositionRef.current
        );
      }

      activeSliderKeyRef.current = sliderKey;
      hasRestoredHorizontalScrollRef.current = false;
    }

    const container = containerRef.current;
    if (
      !restoreHorizontalScroll ||
      !isActive ||
      isLoading ||
      hasRestoredHorizontalScrollRef.current ||
      !container
    ) {
      return;
    }

    const historyEntryKey =
      historyEntryKeyRef.current ?? getDiscoverHistoryEntryKey();
    historyEntryKeyRef.current = historyEntryKey;

    const savedPosition = readDiscoverSliderScrollPosition(
      historyEntryKey,
      sliderKey
    );
    if (savedPosition !== undefined) {
      container.scrollLeft = savedPosition;
    }

    latestScrollPositionRef.current = container.scrollLeft;
    hasRestoredHorizontalScrollRef.current = true;
    handleScroll();
  }, [
    handleScroll,
    isActive,
    isLoading,
    items,
    restoreHorizontalScroll,
    sliderKey,
  ]);

  const onScroll = () => {
    const scrollPosition = containerRef.current?.scrollLeft ?? 0;
    latestScrollPositionRef.current = scrollPosition;

    if (restoreHorizontalScroll && hasRestoredHorizontalScrollRef.current) {
      window.clearTimeout(scrollSaveTimeoutRef.current);
      const historyEntryKey = historyEntryKeyRef.current;
      const activeSliderKey = activeSliderKeyRef.current;
      scrollSaveTimeoutRef.current = window.setTimeout(() => {
        saveDiscoverSliderScrollPosition(
          historyEntryKey,
          activeSliderKey,
          latestScrollPositionRef.current
        );
      }, 100);
    }

    debouncedScroll();
  };

  const slide = (direction: Direction) => {
    const clientWidth =
      containerRef.current?.getBoundingClientRect().width ?? 0;
    const cardWidth =
      containerRef.current?.firstElementChild?.getBoundingClientRect().width ??
      0;
    const scrollPosition = containerRef.current?.scrollLeft ?? 0;
    const scrollWidth = containerRef.current?.scrollWidth ?? 0;

    if (!containerRef.current || !clientWidth || !cardWidth) {
      return;
    }

    const visibleItems = Math.floor(clientWidth / cardWidth);
    const scrollOffset = scrollPosition % cardWidth;

    if (direction === Direction.LEFT) {
      const newX = Math.max(
        scrollPosition - scrollOffset - visibleItems * cardWidth,
        0
      );
      containerRef.current.scrollTo({ left: newX, behavior: 'smooth' });

      if (newX === 0) {
        setScrollPosition({ isStart: true, isEnd: false });
      } else {
        setScrollPosition({ isStart: false, isEnd: false });
      }
    } else if (direction === Direction.RIGHT) {
      const newX = Math.min(
        scrollPosition - scrollOffset + visibleItems * cardWidth,
        scrollWidth - clientWidth
      );
      containerRef.current.scrollTo({ left: newX, behavior: 'smooth' });

      if (newX >= scrollWidth - clientWidth) {
        setScrollPosition({ isStart: false, isEnd: true });
      } else {
        setScrollPosition({ isStart: false, isEnd: false });
      }
    }
  };

  return (
    <div
      className="slider-layout"
      data-slider-size={compact ? 'compact' : undefined}
      data-testid="media-slider"
    >
      <div className="slider-header">
        {heading}
        {isActive && (
          <div className="slider-navigation">
            <Button
              buttonType="success"
              buttonSize="standard"
              onClick={() => slide(Direction.LEFT)}
              disabled={scrollPos.isStart}
              disabledReason={intl.formatMessage(
                globalMessages.noPreviousItems
              )}
              type="button"
              aria-label={intl.formatMessage(globalMessages.previous)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              buttonType="success"
              buttonSize="standard"
              onClick={() => slide(Direction.RIGHT)}
              disabled={scrollPos.isEnd}
              disabledReason={intl.formatMessage(globalMessages.noNextItems)}
              type="button"
              aria-label={intl.formatMessage(globalMessages.next)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        )}
      </div>
      {notice}
      {isActive && (
        <div
          className={`slider-track ${compact ? 'slider-track-compact' : ''}`}
          ref={containerRef}
          onScroll={onScroll}
        >
          {items?.map((item, index) => (
            <div
              key={`${sliderKey}-${index}`}
              className={`slider-item ${compact ? 'slider-item-compact' : ''}`}
              data-render-visibility={
                disableItemContentVisibility ? 'full' : undefined
              }
            >
              {item}
            </div>
          ))}
          {isLoading &&
            [...Array(10)].map((_item, i) => (
              <div
                key={`placeholder-${i}`}
                className={`slider-item ${compact ? 'slider-item-compact' : ''}`}
                data-render-visibility={
                  disableItemContentVisibility ? 'full' : undefined
                }
              >
                {placeholder}
              </div>
            ))}
          {isEmpty && (
            <PageErrorMessage
              severity="empty"
              title={intl.formatMessage(messages.emptyTitle)}
              description={emptyMessage}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Slider;
