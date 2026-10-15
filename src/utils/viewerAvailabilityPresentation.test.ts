import { describe, expect, it } from 'vitest';

import { OtherUserAvailabilityMode } from '@server/constants/availability';
import { MediaStatus } from '@server/constants/media';
import {
  getViewerAvailabilityPresentation,
  isViewerSeasonShared,
} from './viewerAvailabilityPresentation';

describe('getViewerAvailabilityPresentation', () => {
  it('preserves the existing shared display by default', () => {
    expect(
      getViewerAvailabilityPresentation(
        MediaStatus.AVAILABLE,
        OtherUserAvailabilityMode.SHOW,
        false
      )
    ).toEqual({ shared: false, hidden: false, hidePlayback: false });
  });

  it('preserves the default when a persisted setting is missing', () => {
    expect(
      getViewerAvailabilityPresentation(MediaStatus.AVAILABLE, undefined, false)
    ).toEqual({ shared: false, hidden: false, hidePlayback: false });
  });

  it('marks another viewer’s available copy in distinguish mode', () => {
    expect(
      getViewerAvailabilityPresentation(
        MediaStatus.PARTIALLY_AVAILABLE,
        OtherUserAvailabilityMode.DISTINGUISH,
        false
      )
    ).toEqual({ shared: true, hidden: false, hidePlayback: true });
  });

  it('hides only shared availability in hide mode', () => {
    expect(
      getViewerAvailabilityPresentation(
        MediaStatus.AVAILABLE,
        OtherUserAvailabilityMode.HIDE,
        false
      )
    ).toEqual({ shared: true, hidden: true, hidePlayback: true });

    expect(
      getViewerAvailabilityPresentation(
        MediaStatus.PROCESSING,
        OtherUserAvailabilityMode.HIDE,
        false
      )
    ).toEqual({ shared: false, hidden: false, hidePlayback: false });
  });

  it('keeps the viewer’s own approved copy in the normal state', () => {
    expect(
      getViewerAvailabilityPresentation(
        MediaStatus.AVAILABLE,
        OtherUserAvailabilityMode.HIDE,
        true
      )
    ).toEqual({ shared: false, hidden: false, hidePlayback: false });
  });

  it('does not mark an in-progress status as shared availability', () => {
    expect(
      getViewerAvailabilityPresentation(
        MediaStatus.AVAILABLE,
        OtherUserAvailabilityMode.DISTINGUISH,
        false,
        true
      )
    ).toEqual({ shared: false, hidden: false, hidePlayback: false });
  });
});

describe('isViewerSeasonShared', () => {
  it('keeps season and quality ownership independent', () => {
    const coverage = {
      standard: false,
      fourK: false,
      seasons: [
        { seasonNumber: 1, standard: true, fourK: false },
        { seasonNumber: 2, standard: false, fourK: true },
      ],
    };

    expect(
      isViewerSeasonShared(
        coverage,
        OtherUserAvailabilityMode.DISTINGUISH,
        1,
        'standard'
      )
    ).toBe(false);
    expect(
      isViewerSeasonShared(
        coverage,
        OtherUserAvailabilityMode.DISTINGUISH,
        1,
        'fourK'
      )
    ).toBe(true);
    expect(
      isViewerSeasonShared(
        coverage,
        OtherUserAvailabilityMode.DISTINGUISH,
        2,
        'fourK'
      )
    ).toBe(false);
  });

  it('uses whole-series ownership and treats an unrequested known season as shared', () => {
    expect(
      isViewerSeasonShared(
        { standard: true, fourK: false, seasons: [] },
        OtherUserAvailabilityMode.HIDE,
        12,
        'standard'
      )
    ).toBe(false);
    expect(
      isViewerSeasonShared(
        { standard: false, fourK: false, seasons: [] },
        OtherUserAvailabilityMode.HIDE,
        12,
        'standard'
      )
    ).toBe(true);
    expect(
      isViewerSeasonShared(
        undefined,
        OtherUserAvailabilityMode.HIDE,
        12,
        'standard'
      )
    ).toBe(false);
  });
});
