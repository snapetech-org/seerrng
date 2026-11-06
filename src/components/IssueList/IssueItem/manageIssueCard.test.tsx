import { IssueStatus } from '@server/constants/issue';
import { MediaType } from '@server/constants/media';
import type Issue from '@server/entity/Issue';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import IssueItem from './index';

vi.mock('swr', () => ({
  mutate: vi.fn(),
  default: (key: string | null) =>
    key
      ? {
          data: {
            title: 'Coyote test movie',
            releaseDate: '2026-08-28',
            runtime: 100,
            posterPath: '/poster.jpg',
            backdropPath: '/backdrop.jpg',
            credits: { crew: [] },
            productionCompanies: [],
          },
        }
      : {},
}));
vi.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: () => {}, inView: true }),
}));
vi.mock('@app/hooks/useUser', () => ({
  Permission: { MANAGE_ISSUES: 1, VIEW_ISSUES: 2 },
  useUser: () => ({ hasPermission: () => true }),
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock('@app/components/Common/CachedImage', () => ({
  default: ({ src }: { src: string }) => <img src={src} alt="" />,
}));
vi.mock('@app/components/Common/MediaTypeBadge', () => ({
  default: () => <span>Movie</span>,
  getMediaTypeBadgeType: () => 'movie',
}));
const render = (embedded: boolean, status = IssueStatus.OPEN) =>
  renderToStaticMarkup(
    <IntlProvider locale="en">
      <IssueItem
        embedded={embedded}
        issue={
          {
            id: 7,
            status,
            issueType: 1,
            is4k: false,
            createdAt: '2026-09-20T12:00:00Z',
            createdBy: { id: 1, displayName: 'Test User' },
            media: { mediaType: MediaType.MOVIE, tmdbId: 123 },
            comments: [{ message: 'Issue fixture' }],
          } as unknown as Issue
        }
      />
    </IntlProvider>
  );
beforeEach(() => {
  vi.stubGlobal('React', React);
});

it('uses only inline View Details with a separate red Open badge', () => {
  const html = render(true, IssueStatus.OPEN);
  expect(html).not.toContain('href="/issues/7"');
  expect(html).not.toContain('View Issue');
  expect(html).toContain('compact-detail-status-badge-danger');
  expect(html).toMatch(
    /<span\b[^>]*\bclass="[^"]*app-control-standard-radius[^"]*compact-detail-status-badge/
  );
  expect(html).not.toMatch(
    /<span\b[^>]*\bclass="[^"]*rounded-full[^"]*compact-detail-status-badge/
  );
  expect(html).toContain('Status');
  expect(html).toContain('Open');
  expect(html).toContain('View Details');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('issue-discussion-content');
});

it('places creator details in the middle and type, status and action on the right', () => {
  const html = render(true);
  expect(html).not.toContain('href="/issues/7"');
  expect(html).toContain('View Details');
  expect(html).toContain('Status');
  expect(html).toContain('issue-summary-details-action');
  const [leftAndMiddle, right] = html.split('issue-summary-status-column');
  expect(leftAndMiddle).toContain('Created By');
  expect(leftAndMiddle).toContain('Created Date');
  expect(leftAndMiddle).not.toContain('Director');
  expect(leftAndMiddle).not.toContain('Studio');
  expect(right.indexOf('Type')).toBeLessThan(right.indexOf('Status'));
  expect(right.indexOf('Status')).toBeLessThan(right.indexOf('View Details'));
  expect(right).not.toContain('Created By');
});
it('uses the shared translucent inset without a second artwork layer when embedded', () => {
  const html = render(true);
  expect(html).toContain('refreshed-inset-surface issue-summary-card');
  expect(html).not.toContain('refreshed-artwork-scrim');
  expect(html).not.toContain('backdrop.jpg');
  expect(html).not.toContain('detail-summary-card');
});
it('preserves standalone artwork and inline details for closed issues too', () => {
  const html = render(false, IssueStatus.RESOLVED);
  expect(html).toContain(
    'refreshed-card-surface issue-summary-card issue-summary-card-standalone'
  );
  expect(html).toContain('refreshed-artwork-scrim');
  expect(html).not.toContain('refreshed-inset-surface');
  expect(html).not.toContain('detail-summary-card');
  expect(html).not.toContain('href="/issues/7"');
  expect(html).toContain('compact-detail-status-badge-success');
  expect(html).toMatch(
    /<span\b[^>]*\bclass="[^"]*app-control-standard-radius[^"]*compact-detail-status-badge/
  );
  expect(html).not.toMatch(
    /<span\b[^>]*\bclass="[^"]*rounded-full[^"]*compact-detail-status-badge/
  );
  expect(html).toContain('Closed');
});
