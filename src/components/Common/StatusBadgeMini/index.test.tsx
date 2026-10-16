import { SettingsContext } from '@app/context/SettingsContext';
import { OtherUserAvailabilityMode } from '@server/constants/availability';
import { MediaStatus } from '@server/constants/media';
import type { PublicSettingsResponse } from '@server/interfaces/api/settingsInterfaces';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import StatusBadgeMini from './index';

beforeEach(() => vi.stubGlobal('React', React));

const render = (mode: OtherUserAvailabilityMode) =>
  renderToStaticMarkup(
    <IntlProvider locale="en">
      <SettingsContext.Provider
        value={{
          currentSettings: {
            otherUsersAvailability: mode,
          } as PublicSettingsResponse,
        }}
      >
        <StatusBadgeMini
          status={MediaStatus.AVAILABLE}
          quality="HD"
          shrink
          viewerHasRequestedCopy={false}
        />
      </SettingsContext.Provider>
    </IntlProvider>
  );

it('marks shared availability with visible text, purple role, and an accessible label', () => {
  const html = render(OtherUserAvailabilityMode.DISTINGUISH);

  expect(html).toContain('Shared');
  expect(html).toContain('poster-control-shared-availability');
  expect(html).toContain('HD Available · Shared availability');
});

it('omits shared availability in hide mode', () => {
  expect(render(OtherUserAvailabilityMode.HIDE)).toBe('');
});
