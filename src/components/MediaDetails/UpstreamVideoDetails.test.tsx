import { SettingsContext } from '@app/context/SettingsContext';
import { OtherUserAvailabilityMode } from '@server/constants/availability';
import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { PublicSettingsResponse } from '@server/interfaces/api/settingsInterfaces';
import type { MovieDetails } from '@server/models/Movie';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import UpstreamVideoDetails from './UpstreamVideoDetails';
vi.mock('@app/assets/services/letterboxd.svg', () => ({
  default: () => <svg />,
}));
vi.mock('@app/assets/services/tmdb.svg', () => ({ default: () => <svg /> }));
vi.mock('@app/components/Common/CachedImage', () => ({
  default: () => <img alt="" />,
}));
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
beforeEach(() => vi.stubGlobal('React', React));
const render = (mode = OtherUserAvailabilityMode.SHOW) =>
  renderToStaticMarkup(
    <IntlProvider locale="en">
      <SettingsContext.Provider
        value={{
          currentSettings: {
            otherUsersAvailability: mode,
            movie4kEnabled: true,
          } as PublicSettingsResponse,
        }}
      >
        <UpstreamVideoDetails
          data={
            {
              id: 550,
              title: 'Fixture title',
              status: 'Released',
              releaseDate: '1999-10-15',
              runtime: 139,
              overview: 'Visible synopsis',
              originalLanguage: 'en',
              externalIds: {},
              genres: [{ id: 18, name: 'Drama' }],
              productionCompanies: [],
              credits: { cast: [], crew: [] },
              mediaInfo: {
                status: MediaStatus.AVAILABLE,
                status4k: MediaStatus.AVAILABLE,
                viewerRequestCoverage: { standard: false, fourK: false },
              } as Media,
            } as unknown as MovieDetails
          }
          mediaType="movie"
          actions={<button>Authorized request</button>}
          ratings={<span>Provider ratings</span>}
        >
          <button>Additional feature</button>
        </UpstreamVideoDetails>
      </SettingsContext.Provider>
    </IntlProvider>
  );
it('renders open upstream sections and retains both authorized action slots', () => {
  const html = render();
  expect(html).toContain('data-native-composition="upstream"');
  expect(html).toContain('Visible synopsis');
  expect(html).toContain('upstream-media-facts');
  expect(html).toContain('Authorized request');
  expect(html).toContain('Additional feature');
  expect(html).not.toContain('detail-summary-card');
  expect(html.indexOf('upstream-media-header')).toBeLessThan(
    html.indexOf('Visible synopsis')
  );
});
it('does not reveal either shared availability indicator when viewer policy hides it', () => {
  const html = render(OtherUserAvailabilityMode.HIDE);
  expect(html).not.toContain('HD');
  expect(html).not.toContain('4K');
  expect(html).toContain('Authorized request');
});
