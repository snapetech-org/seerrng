import {
  deleteLibraryMedia,
  deleteRequestStatus,
  RequestActionConfirmation,
} from '@app/components/Requests/destructiveActions';
import { IssueStatus } from '@server/constants/issue';
import { MediaStatus, MediaType } from '@server/constants/media';
import type Issue from '@server/entity/Issue';
import type Media from '@server/entity/Media';
import type { LibraryRemovalPlan } from '@server/interfaces/api/libraryRemoval';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import ManageMediaActions, {
  getManageLibraryTargets,
} from './ManageMediaActions';
import {
  addManageBlocklist,
  getManageIssueIds,
  removeManageBlocklist,
  updateManageIssues,
} from './manageAdvancedActions';

const state = vi.hoisted(() => ({
  permission: true,
  adminPermission: true,
  blocklistPermission: true,
  libraryPlan: {
    token: 'test-token',
    targets: [],
    verifiedServices: 0,
  } as LibraryRemovalPlan,
  remove: vi.fn(),
  post: vi.fn(),
}));
vi.mock('axios', () => ({
  default: {
    delete: state.remove,
    post: state.post,
    isAxiosError: () => false,
  },
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ query: {} }),
}));
vi.mock('@app/hooks/useUser', () => ({
  Permission: {
    ADMIN: 2,
    MANAGE_REQUESTS: 32,
    MANAGE_ISSUES: 64,
    VIEW_ISSUES: 128,
    MANAGE_BLOCKLIST: 256,
  },
  useUser: () => ({
    hasPermission: (permission: number) =>
      permission === 2
        ? state.adminPermission
        : state.permission && (permission !== 256 || state.blocklistPermission),
  }),
}));
vi.mock('swr', () => ({
  default: () => ({
    data: state.libraryPlan,
    mutate: vi.fn(),
  }),
  mutate: vi.fn(),
}));
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({
    children,
    content,
  }: {
    children: React.ReactNode;
    content: string;
  }) => <span title={content}>{children}</span>,
}));
vi.mock('@app/components/Common/Modal', () => ({
  default: ({
    children,
    title,
    okButtonType,
    cancelButtonType,
    okDisabled,
  }: {
    children: React.ReactNode;
    title: string;
    okButtonType: string;
    cancelButtonType: string;
    okDisabled: boolean;
  }) => (
    <section
      data-confirm={okButtonType}
      data-cancel={cancelButtonType}
      data-disabled={okDisabled}
    >
      <h1>{title}</h1>
      {children}
    </section>
  ),
}));
const media = (values: Partial<Media> = {}) =>
  ({ id: 42, requests: [], ...values }) as Media;
const render = (value: React.ReactNode) =>
  renderToStaticMarkup(<IntlProvider locale="en">{value}</IntlProvider>);
beforeEach(() => {
  vi.stubGlobal('React', React);
  state.permission = true;
  state.adminPermission = true;
  state.blocklistPermission = true;
  state.libraryPlan = { token: 'test-token', targets: [], verifiedServices: 0 };
  state.remove.mockReset();
  state.post.mockReset();
});

it('keeps HD and 4K targets separate and accepts configured server ID zero', () => {
  expect(
    getManageLibraryTargets(
      media({
        serviceId: 0,
        externalServiceId: 10,
        serviceId4k: 2,
        externalServiceId4k: 11,
      }),
      MediaType.MOVIE
    )
  ).toEqual([
    {
      key: 'primary',
      mediaId: 42,
      is4k: false,
      format: undefined,
      service: 'Radarr (HD)',
    },
    { key: '4k', mediaId: 42, is4k: true, service: 'Radarr (4K)' },
  ]);
  expect(
    getManageLibraryTargets(media({ serviceId: 3 }), MediaType.TV)
  ).toEqual([]);
});
it('keeps book formats separate and never invents a music 4K target', () => {
  const item = media({
    serviceId: 0,
    externalServiceId: 7,
    audiobookServiceId: 1,
    audiobookExternalServiceId: 8,
    serviceId4k: 2,
    externalServiceId4k: 9,
  });
  expect(
    getManageLibraryTargets(item, MediaType.BOOK).map(({ format }) => format)
  ).toEqual(['ebook', 'audiobook']);
  expect(
    getManageLibraryTargets(item, MediaType.MUSIC).map(({ service, is4k }) => ({
      service,
      is4k,
    }))
  ).toEqual([{ service: 'Lidarr', is4k: false }]);
});
it('shares safe request-status deletion without clearing the whole media record', async () => {
  state.remove.mockResolvedValue({ status: 204 });
  await deleteRequestStatus(17);
  expect(state.remove.mock.calls).toEqual([['/api/v1/request/17/status']]);
});
it('uses the exact selected library quality or book format without follow-up record deletion', async () => {
  state.remove.mockResolvedValue({ status: 204 });
  await deleteLibraryMedia({ mediaId: 42, is4k: true });
  await deleteLibraryMedia({ mediaId: 42, is4k: false, format: 'audiobook' });
  expect(state.remove.mock.calls).toEqual([
    ['/api/v1/media/42/file?is4k=true'],
    ['/api/v1/media/42/file?is4k=false&format=audiobook'],
  ]);
});
it('propagates removal failure instead of reporting successful deletion', async () => {
  state.remove.mockRejectedValue(new Error('Service unavailable'));
  await expect(
    deleteLibraryMedia({ mediaId: 42, is4k: false })
  ).rejects.toThrow('Service unavailable');
  expect(state.remove).toHaveBeenCalledTimes(1);
});
it('disables actions without targets and never mutates during render', () => {
  const html = render(
    <ManageMediaActions
      media={media()}
      mediaType={MediaType.MOVIE}
      title="Movie"
      onUpdate={vi.fn()}
    />
  );
  expect(html.match(/disabled=""/g)).toHaveLength(7);
  expect(html).toContain('title="No request is linked to this title."');
  expect(html).toContain('No linked library item is available to delete.');
  expect(html).toContain('permanently removes all quality versions');
  expect(html).toContain('title="This media is not currently blocklisted."');
  const unblockButton = html
    .match(/<button[^>]*>[\s\S]*?<\/button>/g)
    ?.find((button) => button.includes('Remove From Blocklist'));
  expect(unblockButton).toContain('app-button-danger');
  expect(unblockButton).toContain('disabled=""');
  expect(unblockButton).not.toMatch(/title="[^"]+"/);
  expect(html).not.toContain('Clear Data');
  expect(html).not.toContain('Mark as Available');
  expect(state.remove).not.toHaveBeenCalled();
});

it('offers stale availability recovery when a fresh scan finds no series copy', () => {
  state.libraryPlan = {
    token: 'fresh-plan',
    targets: [],
    verifiedServices: 1,
  } as LibraryRemovalPlan;

  const html = render(
    <ManageMediaActions
      media={media({ status: MediaStatus.AVAILABLE })}
      mediaType={MediaType.TV}
      title="Series"
      onUpdate={vi.fn()}
    />
  );

  expect(html).toContain('Clear Stale HD Availability');
  expect(html).toContain('Delete From Library');
  const removeButton = html
    .match(/<button[^>]*>[\s\S]*?<\/button>/g)
    ?.find((button) => button.includes('Delete From Library'));
  expect(removeButton).toContain('disabled=""');
  expect(state.remove).not.toHaveBeenCalled();
  expect(state.post).not.toHaveBeenCalled();
});

it.each([
  {
    name: 'no configured service was checked',
    verifiedServices: 0,
    targets: [],
  },
  {
    name: 'the fresh plan still contains an HD copy',
    verifiedServices: 1,
    targets: [
      {
        key: 'sonarr:1:9:HD',
        serviceType: 'sonarr' as const,
        serviceId: 1,
        externalId: 9,
        service: 'Sonarr',
        quality: 'HD',
        url: 'http://sonarr.test/series/anime',
      },
    ],
  },
])('hides stale recovery when $name', ({ verifiedServices, targets }) => {
  state.libraryPlan = {
    token: 'fresh-plan',
    verifiedServices,
    targets,
  };

  const html = render(
    <ManageMediaActions
      media={media({ status: MediaStatus.AVAILABLE })}
      mediaType={MediaType.TV}
      title="Series"
      onUpdate={vi.fn()}
    />
  );

  expect(html).not.toContain('Clear Stale HD Availability');
  expect(state.post).not.toHaveBeenCalled();
});

it.each([
  MediaType.MUSIC,
  MediaType.BOOK,
  MediaType.COMIC,
  MediaType.MAGAZINE,
  MediaType.SPORTS,
])('does not offer stale availability recovery for %s', (mediaType) => {
  state.libraryPlan = {
    token: 'fresh-plan',
    targets: [],
    verifiedServices: 1,
  };

  const html = render(
    <ManageMediaActions
      media={media({ status: MediaStatus.AVAILABLE })}
      mediaType={mediaType}
      title="Media"
      onUpdate={vi.fn()}
    />
  );

  expect(html).not.toContain('Clear Stale HD Availability');
  expect(html).not.toContain('Clear Stale 4K Availability');
  expect(state.post).not.toHaveBeenCalled();
});

it('groups actions in the requested order and names the configured service next to its removal button', () => {
  state.libraryPlan.targets = [
    {
      key: 'primary',
      service: 'Radarr-HD',
      serviceType: 'radarr',
      serviceId: 0,
      externalId: 9,
      quality: 'HD',
      url: 'http://nas:7878/movie/test',
    },
  ];
  const html = render(
    <ManageMediaActions
      media={media({
        serviceId: 0,
        externalServiceId: 9,
        serviceUrl: 'http://nas:7878/movie/test',
        tmdbId: 123,
        status: MediaStatus.BLOCKLISTED,
      })}
      mediaType={MediaType.MOVIE}
      title="Movie"
      onUpdate={vi.fn()}
    />
  );
  expect(html).toContain('Open title in Radarr-HD');
  expect(html).toContain(
    'Open this media’s page in Radarr-HD in a new browser tab or window.'
  );
  expect(html).toContain('Delete Request');
  expect(html).toMatch(
    /Service<\/h4>[\s\S]*Open title in Radarr-HD[\s\S]*Delete From Library[\s\S]*Blocklist<\/h4>[\s\S]*Request<\/h4>[\s\S]*Issues<\/h4>/
  );
  const unblockButton = html
    .match(/<button[^>]*>[\s\S]*?<\/button>/g)
    ?.find((button) => button.includes('Remove From Blocklist'));
  expect(unblockButton).toContain('app-button-danger');
  expect(unblockButton).not.toContain('disabled=""');
  expect(unblockButton).not.toMatch(/title="[^"]+"/);
  expect(state.remove).not.toHaveBeenCalled();
});

const issue = (id: number, status: IssueStatus) => ({ id, status }) as Issue;
it('closes only open issues and deletes both open and resolved issues without duplicates', async () => {
  const issues = [
    issue(7, IssueStatus.OPEN),
    issue(8, IssueStatus.RESOLVED),
    issue(7, IssueStatus.OPEN),
  ];
  expect(getManageIssueIds(issues, 'closeIssues')).toEqual([7]);
  expect(getManageIssueIds(issues, 'deleteIssues')).toEqual([7, 8]);
  await updateManageIssues(
    getManageIssueIds(issues, 'closeIssues'),
    'closeIssues'
  );
  expect(state.post.mock.calls).toEqual([['/api/v1/issue/7/resolved']]);
  expect(state.remove).not.toHaveBeenCalled();
  await updateManageIssues(
    getManageIssueIds(issues, 'deleteIssues'),
    'deleteIssues'
  );
  expect(state.remove.mock.calls).toEqual([
    ['/api/v1/issue/7'],
    ['/api/v1/issue/8'],
  ]);
});
it('stops a partial batch on failure and rejects invalid IDs before doing any work', async () => {
  state.remove
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('Denied'));
  await expect(updateManageIssues([7, 8, 9], 'deleteIssues')).rejects.toThrow(
    'Denied'
  );
  expect(state.remove).toHaveBeenCalledTimes(2);
  state.remove.mockClear();
  await expect(updateManageIssues([7, -1], 'deleteIssues')).rejects.toThrow(
    'Invalid issue ID'
  );
  expect(state.remove).not.toHaveBeenCalled();
});
it('removes only the selected Seerr blocklist entry, retaining its media type', async () => {
  await removeManageBlocklist(123, MediaType.MOVIE);
  expect(state.remove.mock.calls).toEqual([
    ['/api/v1/blocklist/123?mediaType=movie'],
  ]);
});
it.each([MediaType.MOVIE, MediaType.TV])(
  'blocklists the exact %s title',
  async (mediaType) => {
    await addManageBlocklist(123, mediaType, 'Test title');
    expect(state.post.mock.calls).toEqual([
      ['/api/v1/blocklist', { tmdbId: 123, mediaType, title: 'Test title' }],
    ]);
    expect(state.remove).not.toHaveBeenCalled();
  }
);
it.each([
  [MediaType.BOOK, '/works/ol123w', 'OL123W'],
  [
    MediaType.MUSIC,
    ' AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE ',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  ],
])(
  'normalizes the canonical %s identifier without sending a TMDB ID',
  async (mediaType, id, normalized) => {
    await addManageBlocklist(id, mediaType as MediaType, 'Test title');
    expect(state.post.mock.calls).toEqual([
      [
        '/api/v1/blocklist',
        { externalId: normalized, mediaType, title: 'Test title' },
      ],
    ]);
  }
);
it('rejects missing identifiers and propagates blocklist failures', async () => {
  expect(() => addManageBlocklist(0, MediaType.MOVIE, 'Missing')).toThrow();
  expect(() => addManageBlocklist('', MediaType.BOOK, 'Missing')).toThrow();
  expect(state.post).not.toHaveBeenCalled();
  state.post.mockRejectedValue(new Error('Denied'));
  await expect(addManageBlocklist(123, MediaType.TV, 'Series')).rejects.toThrow(
    'Denied'
  );
});
it.each([MediaType.MOVIE, MediaType.TV, MediaType.BOOK, MediaType.MUSIC])(
  'places the red block action before unblock for %s and respects status and permissions',
  (mediaType) => {
    const buttons = (status: MediaStatus) => {
      const html = render(
        <ManageMediaActions
          media={media({ tmdbId: 123, status })}
          mediaType={mediaType}
          externalId="OL123W"
          title="Title"
          onUpdate={vi.fn()}
        />
      );
      expect(html.indexOf('>Blocklist Title</')).toBeLessThan(
        html.indexOf('>Remove From Blocklist</')
      );
      expect(state.post).not.toHaveBeenCalled();
      return html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
    };
    const find = (items: string[], label: string) =>
      items.find((button) => button.includes(`>${label}</`));
    const available = buttons(MediaStatus.AVAILABLE);
    expect(find(available, 'Blocklist Title')).toContain('app-button-danger');
    expect(find(available, 'Blocklist Title')).not.toContain('disabled=""');
    expect(find(available, 'Remove From Blocklist')).toContain('disabled=""');
    const blocked = buttons(MediaStatus.BLOCKLISTED);
    expect(find(blocked, 'Blocklist Title')).toContain('disabled=""');
    expect(find(blocked, 'Remove From Blocklist')).not.toContain('disabled=""');
    state.blocklistPermission = false;
    expect(find(buttons(MediaStatus.AVAILABLE), 'Blocklist Title')).toContain(
      'disabled=""'
    );
    expect(
      find(buttons(MediaStatus.BLOCKLISTED), 'Remove From Blocklist')
    ).toContain('disabled=""');
  }
);
it('hides destructive actions without request-management permission', () => {
  state.permission = false;
  expect(
    render(
      <ManageMediaActions
        media={media()}
        mediaType={MediaType.MUSIC}
        title="Album"
        onUpdate={vi.fn()}
      />
    )
  ).toBe('');
});
it('hides connected-library links and deletion from request managers who are not admins', () => {
  state.permission = true;
  state.adminPermission = false;
  state.libraryPlan.targets = [
    {
      key: 'primary',
      service: 'Radarr-HD',
      serviceType: 'radarr',
      serviceId: 1,
      externalId: 9,
      quality: 'HD',
      url: 'http://nas:7878/movie/test',
    },
  ];

  const html = render(
    <ManageMediaActions
      media={media()}
      mediaType={MediaType.MOVIE}
      title="Movie"
      onUpdate={vi.fn()}
    />
  );
  expect(html).not.toContain('Delete From Library');
  expect(html).not.toContain('Open title in Radarr-HD');
});
it('shares permanent-delete wording and green cancel/red confirmation', () => {
  const html = render(
    <RequestActionConfirmation
      action="remove"
      title="Movie"
      service="Radarr (4K)"
      busy={false}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  expect(html).toContain('data-confirm="danger"');
  expect(html).toContain('data-cancel="success"');
  expect(html).toContain('<h1>Permanently Delete Movie from Radarr (4K)?</h1>');
  expect(html).toContain(
    'permanently delete its media files and remove its library entry'
  );
});
