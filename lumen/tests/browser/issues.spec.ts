import { expect, test, type Page } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

async function authenticateNativeComparison(page: Page, baseURL: string) {
  if (process.env.LUMEN_TEST_NATIVE_SESSION !== 'true') return;
  const response = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(response.status()).toBe(200);
  const sessionId = response
    .headersArray()
    .find((header) => header.name.toLowerCase() === 'set-cookie')
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sessionId).toBeTruthy();
  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sessionId!,
      url: baseURL,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

test.beforeEach(async ({ page, baseURL }) => {
  await authenticateNativeComparison(page, baseURL!);
});

for (const permissions of [18, 2097152]) {
  test(`issue detail service links follow administrator permissions ${permissions}`, async ({
    page,
  }, info) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const path = testApiPath(route.request().url());
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 2, permissions } });
      if (path === '/issue/71')
        return route.fulfill({
          json: {
            id: 71,
            status: 1,
            issueType: 1,
            is4k: false,
            media: {
              mediaType: 'movie',
              tmdbId: 71,
              title: 'Service Link Fixture',
              serviceUrl: 'https://radarr.example.test/movie/71',
              serviceUrl4k: 'https://user:secret@radarr.example.test/movie/71',
            },
            createdBy: { id: 2, displayName: 'Viewer' },
            createdAt: '2026-11-25T00:00:00Z',
            comments: [
              {
                id: 72,
                message: 'Playback fails.',
                createdAt: '2026-11-25T00:00:00Z',
                user: { id: 2, displayName: 'Viewer' },
              },
            ],
          },
        });
      return route.fulfill({ json: {} });
    });

    await page.goto(testAppPath('/issues/71'));
    await expect(
      page.getByRole('heading', { name: 'Issue #71' })
    ).toBeVisible();
    if (permissions === 18) {
      if (['desktop', 'iphone'].includes(info.project.name))
        await page.screenshot({
          path: info.outputPath('administrator-issue-service-link.png'),
          fullPage: true,
        });
      await expect(
        page.getByRole('link', { name: 'Open in Radarr' })
      ).toHaveAttribute('href', 'https://radarr.example.test/movie/71');
      await expect(
        page.getByRole('link', { name: 'Open in Radarr 4K' })
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('link', { name: /Open in Radarr/ })
      ).toHaveCount(0);
    }
  });
}

for (const permissions of [4194304, 2097152, 32]) {
  test(`issue discussion follows account permissions ${permissions}`, async ({
    page,
  }) => {
    let reads = 0;
    let season3Reads = 0;
    let status = 1;
    const comments = [
      { id: 1, message: 'Playback freezes', createdAt: '2026-11-12T00:00:00Z' },
    ];
    const issue = () => ({
      id: 7,
      status,
      issueType: 1,
      media: {
        mediaType: 'tv',
        tmdbId: 123,
        identifiers: [],
        seasons: [
          { seasonNumber: 1 },
          { seasonNumber: 2 },
          { seasonNumber: 3 },
          { seasonNumber: 4 },
        ],
        posterPath: '/images/default-poster.png',
        title: 'Test Series',
      },
      createdBy: {
        id: 2,
        displayName: 'Viewer',
        avatar: '/images/default.png',
      },
      createdAt: '2026-11-12T00:00:00Z',
      comments,
      problemEpisodeSelections: [
        { seasonNumber: 2 },
        { seasonNumber: 3, episodeNumbers: [4, 5] },
      ],
    });
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const path = testApiPath(route.request().url());
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 2,
            permissions,
            avatar: '/images/default.png',
          },
        });
      if (path === '/tv/123')
        return route.fulfill({
          json: {
            mediaType: 'tv',
            tmdbId: 123,
            title: 'Test Series',
            posterPath: '/images/default-poster.png',
            firstAirDate: '2005-09-13',
            episodeRunTime: [42],
            seasons: [
              { seasonNumber: 1 },
              { seasonNumber: 2 },
              { seasonNumber: 3 },
              { seasonNumber: 4 },
            ],
          },
        });
      if (path === '/issue') {
        reads++;
        return route.fulfill({
          json: { results: [issue()], pageInfo: { page: 1, pages: 1 } },
        });
      }
      if (path === '/issue/7') return route.fulfill({ json: issue() });
      if (path === '/tv/123/season/2')
        return route.fulfill({
          json: {
            seasonNumber: 2,
            episodes: [{ episodeNumber: 1, name: 'Season two premiere' }],
          },
        });
      if (path === '/tv/123/season/3')
        if (permissions === 4194304 && season3Reads++ === 0)
          return route.fulfill({
            status: 503,
            json: { message: 'Temporarily unavailable' },
          });
      if (path === '/tv/123/season/3')
        return route.fulfill({
          json: {
            seasonNumber: 3,
            episodes: [
              { episodeNumber: 4, name: 'The fourth episode' },
              { episodeNumber: 5, name: 'The fifth episode' },
              { episodeNumber: 6, name: 'Not selected' },
            ],
          },
        });
      if (path === '/issue/7/comment') {
        expect(route.request().postDataJSON()).toEqual({
          message: 'Tested again',
        });
        comments.push({
          id: 2,
          message: 'Tested again',
          createdAt: '2026-11-12T00:00:00Z',
        });
        return route.fulfill({ status: 201, json: issue() });
      }
      if (path === '/issue/7/resolved') {
        status = 2;
        return route.fulfill({ json: issue() });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/issues'));
    if (permissions === 32) {
      await expect(
        page.getByText('You do not have permission to view issues.')
      ).toBeVisible();
      expect(reads).toBe(0);
      return;
    }
    const nativeComparison = process.env.LUMEN_TEST_NATIVE_SESSION === 'true';
    if (nativeComparison) {
      await expect(
        page.getByRole('link', { name: 'Test Series' })
      ).toBeVisible();
    } else {
      await expect(page.getByRole('link', { name: 'Video #7' })).toBeVisible();
      await expect(
        page.getByText('Season 2, Season 3 · Episodes 4, 5')
      ).toBeVisible();
      await expect(
        page.getByText('Created By:', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(permissions === 2097152 ? 'Viewer' : 'Not available', {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        page.getByText('Playback freezes', { exact: true })
      ).toBeVisible();
      await expect(page.getByText('42 min', { exact: true })).toBeVisible();
    }
    const captureDir = process.env.LUMEN_CAPTURE_DIR;
    if (
      captureDir &&
      permissions === 4194304 &&
      ['desktop', 'iphone'].includes(test.info().project.name)
    )
      await page.screenshot({
        path: `${captureDir}/issues-list-${test.info().project.name}.png`,
        fullPage: true,
      });
    if (nativeComparison) {
      await page.getByRole('button', { name: 'View Details' }).click();
    } else {
      await page.getByRole('link', { name: 'Video #7' }).click();
    }
    if (nativeComparison) {
      await expect(
        page.getByRole('heading', { name: 'Affected Episodes' })
      ).toBeVisible();
      await expect(
        page.getByRole('textbox', { name: 'Add Comment' })
      ).toBeVisible();
    } else {
      await expect(page.getByText('Season 2', { exact: true })).toBeVisible();
      await expect(page.getByText('Season two premiere')).toBeVisible();
      if (permissions === 4194304) {
        await expect(page.getByRole('alert')).toContainText(
          'Episode details could not be loaded.'
        );
        await page.getByRole('button', { name: 'Retry' }).click();
      }
      await expect(page.getByText('The fourth episode')).toBeVisible();
      await expect(page.getByText('The fifth episode')).toBeVisible();
      await expect(page.getByText('Not selected')).toHaveCount(0);
    }
    if (
      captureDir &&
      permissions === 4194304 &&
      ['desktop', 'iphone'].includes(test.info().project.name)
    )
      await page.screenshot({
        path: `${captureDir}/issue-detail-${test.info().project.name}.png`,
        fullPage: true,
      });
    if (nativeComparison) return;
    const resolve = page.getByRole('button', { name: 'Resolve Issue' });
    if (permissions === 2097152) {
      await expect(resolve).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'Comment' })).toHaveCount(
        0
      );
      return;
    }
    await page.getByRole('textbox', { name: 'Comment' }).fill('Tested again');
    const addComment = page.getByRole('button', { name: 'Add Comment' });
    await addComment.scrollIntoViewIfNeeded();
    if (['iphone', 'android'].includes(test.info().project.name)) {
      const tabs = page.locator('.tabbar');
      const buttonBox = await addComment.boundingBox();
      const tabsBox = await tabs.boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(tabsBox).not.toBeNull();
      expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(tabsBox!.y);
      if (captureDir && test.info().project.name === 'iphone')
        await page.screenshot({
          path: `${captureDir}/issue-comment-iphone.png`,
        });
    }
    await addComment.click();
    await expect(page.getByText('Tested again')).toBeVisible();
    await resolve.click();
    await expect(
      page.getByRole('button', { name: 'Reopen Issue' })
    ).toBeVisible();
  });
}

test('issue list resolves affected media titles from visible rows', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/imageproxy/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="96"><rect width="64" height="96" fill="#30405c"/></svg>',
    })
  );
  await page.route('**/imageproxy/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 4194304 } });
    if (path === '/issue')
      return route.fulfill({
        json: {
          results: [
            {
              id: 7,
              status: 1,
              issueType: 1,
              media: { mediaType: 'movie', tmdbId: 20 },
              createdBy: { id: 2 },
              createdAt: '2026-11-12T00:00:00Z',
              comments: [],
            },
          ],
          pageInfo: { page: 1, pages: 1 },
        },
      });
    if (path === '/movie/20')
      return route.fulfill({
        json: {
          title: 'Example Film',
          releaseDate: '2023-04-17',
          posterPath: '/poster.jpg',
          runtime: 112,
        },
      });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(testAppPath('/issues'));
  const media = page.getByRole('link', { name: 'Example Film (2023)' });
  await expect(media).toHaveAttribute('href', testAppPath('/movie/20'));
  await expect(page.getByText('112 min')).toBeVisible();
  await expect(page.getByText('Movie · HD')).toBeVisible();
  await expect(
    page.locator('.issue-media-summary img').first()
  ).toHaveAttribute('src', '/imageproxy/tmdb/t/p/w342/poster.jpg');
  await expect(page.getByRole('link', { name: 'Video #7' })).toBeVisible();
  const posterBox = await page
    .locator('.issue-media-summary img')
    .first()
    .boundingBox();
  expect(posterBox?.height).toBe(96);
  if (['iphone', 'android'].includes(test.info().project.name)) {
    const discussionButton = page.getByRole('button', {
      name: 'View Discussion',
    });
    await discussionButton.scrollIntoViewIfNeeded();
    const buttonBox = await discussionButton.boundingBox();
    const tabbarBox = await page.locator('.tabbar').boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(tabbarBox).not.toBeNull();
    expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(tabbarBox!.y);
  }
  if (
    process.env.LUMEN_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(test.info().project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DIR}/issues-metadata-${test.info().project.name}.png`,
      fullPage: true,
    });
});

for (const { locale, label, reason } of [
  { locale: 'en', label: 'Reason', reason: 'Wrong edition or variant' },
  { locale: 'fr', label: 'Motif', reason: 'Mauvaise édition ou variante' },
  { locale: 'ar', label: 'السبب', reason: 'إصدار أو نسخة غير صحيحة' },
]) {
  test(`issue rows show media-specific reasons in ${locale}`, async ({
    page,
  }, testInfo) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const path = testApiPath(route.request().url());
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2097152 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/issue/29')
        return route.fulfill({
          json: {
            id: 29,
            status: 1,
            issueType: 4,
            issueSubtype: 'wrong_edition',
            media: {
              mediaType: 'book',
              identifiers: [{ provider: 'openlibrary', value: 'OL123W' }],
            },
            createdBy: { id: 1, displayName: 'Reporter' },
            createdAt: '2026-11-12T00:00:00Z',
            comments: [{ id: 1, message: 'Incorrect edition' }],
          },
        });
      if (path === '/issue')
        return route.fulfill({
          json: {
            results: [
              {
                id: 29,
                status: 1,
                issueType: 4,
                issueSubtype: 'wrong_edition',
                media: {
                  mediaType: 'book',
                  identifiers: [{ provider: 'openlibrary', value: 'OL123W' }],
                },
                createdBy: { id: 1, displayName: 'Reporter' },
                createdAt: '2026-11-12T00:00:00Z',
                comments: [{ id: 1, message: 'Incorrect edition' }],
              },
              {
                id: 30,
                status: 1,
                issueType: 1,
                issueSubtype: 'wrong_edition',
                media: { mediaType: 'movie', tmdbId: 20 },
                createdBy: { id: 1, displayName: 'Reporter' },
                createdAt: '2026-11-12T00:00:00Z',
                comments: [{ id: 1, message: 'Incorrect edition' }],
              },
            ],
            pageInfo: { page: 1, pages: 1 },
          },
        });
      if (path === '/book/OL123W')
        return route.fulfill({
          json: {
            title: 'Example Book',
            firstPublishYear: 2020,
            numberOfPages: 320,
          },
        });
      if (path === '/movie/20')
        return route.fulfill({
          json: {
            title: 'Example Film',
            releaseDate: '2020-01-01',
            runtime: 90,
          },
        });
      return route.fulfill({ json: {} });
    });

    await page.goto(testAppPath('/issues'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const bookCard = page
      .getByRole('listitem')
      .filter({ hasText: 'Example Book' });
    await expect(
      bookCard.getByText(`${label}:`, { exact: true })
    ).toBeVisible();
    await expect(bookCard.getByText(reason, { exact: true })).toBeVisible();
    const movieCard = page
      .getByRole('listitem')
      .filter({ hasText: 'Example Film' });
    await expect(movieCard.getByText(`${label}:`, { exact: true })).toHaveCount(
      0
    );

    if (
      locale === 'en' &&
      process.env.LUMEN_ISSUE_REASON_CAPTURE &&
      ['desktop', 'iphone'].includes(testInfo.project.name)
    ) {
      const { mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      await mkdir(process.env.LUMEN_ISSUE_REASON_CAPTURE, { recursive: true });
      await page.screenshot({
        path: join(
          process.env.LUMEN_ISSUE_REASON_CAPTURE,
          `issues-reason-${testInfo.project.name}.png`
        ),
        fullPage: true,
        animations: 'disabled',
      });
    }

    await page.goto(testAppPath('/issues/29'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('.toolbar').getByText(reason)).toBeVisible();
  });
}

test('issue list preserves legacy affected season and episode fields', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 2097152 } });
    if (path === '/issue')
      return route.fulfill({
        json: {
          results: [
            {
              id: 8,
              status: 1,
              issueType: 1,
              media: { mediaType: 'tv', tmdbId: 21 },
              createdBy: { id: 3, displayName: 'Reporter' },
              createdAt: '2026-11-12T00:00:00Z',
              problemSeason: 4,
              problemEpisodes: [2, 3],
              comments: [],
            },
          ],
          pageInfo: { page: 1, pages: 1 },
        },
      });
    if (path === '/tv/21')
      return route.fulfill({
        json: {
          mediaType: 'tv',
          title: 'Legacy Series',
          firstAirDate: '2012-01-01',
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto(testAppPath('/issues'));
  const card = page.getByRole('listitem').filter({ hasText: 'Legacy Series' });
  await expect(card.getByText('Season 4 · Episodes 2, 3')).toBeVisible();
});

test('issue discussions expand inline and preserve list context', async ({
  page,
}) => {
  const comments = [
    {
      id: 1,
      message: 'Playback freezes after the opening credits.',
      createdAt: '2026-11-12T00:00:00Z',
      user: { id: 2, displayName: 'Viewer' },
    },
  ];
  const issue = () => ({
    id: 12,
    status: 1,
    issueType: 1,
    media: { mediaType: 'movie', tmdbId: 20 },
    createdBy: { id: 2, displayName: 'Viewer' },
    createdAt: '2026-11-12T00:00:00Z',
    comments,
  });
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 4194304 } });
    if (path === '/issue' && request.method() === 'GET')
      return route.fulfill({
        json: { results: [issue()], pageInfo: { page: 1, pages: 1 } },
      });
    if (path === '/issue/12' && request.method() === 'GET')
      return route.fulfill({ json: issue() });
    if (path === '/issue/12/comment' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ message: 'Inline follow-up' });
      comments.push({
        id: 2,
        message: 'Inline follow-up',
        createdAt: '2026-11-12T00:01:00Z',
        user: { id: 2, displayName: 'Viewer' },
      });
      return route.fulfill({ status: 201, json: issue() });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(testAppPath('/issues'));

  const disclosure = page.locator('button[aria-controls="issue-inline-12"]');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/\/issues(?:\?|$)/);
  const discussion = page.getByRole('region', { name: 'Issue Details' });
  await expect(
    discussion.getByText('Playback freezes after the opening credits.')
  ).toBeVisible();
  if (
    process.env.LUMEN_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(test.info().project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DIR}/issues-inline-${test.info().project.name}.png`,
      fullPage: true,
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await discussion
    .getByRole('textbox', { name: 'Comment' })
    .fill('Inline follow-up');
  const addComment = discussion.getByRole('button', { name: 'Add Comment' });
  await addComment.scrollIntoViewIfNeeded();
  if (['iphone', 'android'].includes(test.info().project.name)) {
    const action = await addComment.boundingBox();
    const tabs = await page.locator('.tabbar').boundingBox();
    expect(action).not.toBeNull();
    expect(tabs).not.toBeNull();
    expect(action!.y + action!.height).toBeLessThanOrEqual(tabs!.y);
  }
  await addComment.click();
  await expect(discussion.getByText('Inline follow-up')).toBeVisible();

  await page.getByRole('button', { name: 'Hide Details' }).click();
  await expect(discussion).toBeHidden();
  await expect(page).toHaveURL(/\/issues(?:\?|$)/);
});

test('reporting uses the internal media row and opens the confirmed report', async ({
  page,
}) => {
  const posts: unknown[] = [];
  const issue = {
    id: 8,
    status: 1,
    issueType: 1,
    createdBy: { id: 2 },
    createdAt: '2026-11-12T00:00:00Z',
    comments: [
      { id: 1, message: 'Video stutters', createdAt: '2026-11-12T00:00:00Z' },
    ],
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 4194304 } });
    if (path === '/movie/20')
      return route.fulfill({
        json: {
          id: 20,
          title: 'Example Movie',
          genres: [],
          releases: { results: [] },
          credits: { crew: [], cast: [] },
          mediaInfo: { id: 654, status: 5 },
        },
      });
    if (path === '/issue' && route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ json: issue });
    }
    if (path === '/issue/8') return route.fulfill({ json: issue });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(testAppPath('/movie/20'));
  await page.getByRole('button', { name: 'Report an Issue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report an Issue' });
  await expect(
    dialog.getByRole('combobox', { name: 'Report for' })
  ).toHaveCount(0);
  const submit = dialog.getByRole('button', { name: 'Submit Report' });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Issue Type' }).selectOption('1');
  await dialog
    .getByRole('textbox', { name: 'Issue Description' })
    .fill('  Video stutters  ');
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Issue #8' })).toBeVisible();
  await expect(page.getByText('Video stutters')).toBeVisible();
  expect(posts).toEqual([
    { mediaId: 654, issueType: 1, message: 'Video stutters', is4k: false },
  ]);
});

test('issue managers can report for a selected user', async ({
  page,
}, info) => {
  let submitted: unknown;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 1048576 } });
    if (path === '/movie/20')
      return route.fulfill({
        json: {
          id: 20,
          title: 'Example Movie',
          genres: [],
          releases: { results: [] },
          credits: { crew: [], cast: [] },
          mediaInfo: { id: 654, status: 5 },
        },
      });
    if (path === '/issue/reporters') {
      expect(url.searchParams.get('q')).toBe('demo');
      return route.fulfill({
        json: { results: [{ id: 3, displayName: 'Demo Reader' }] },
      });
    }
    if (path === '/issue' && request.method() === 'POST') {
      submitted = request.postDataJSON();
      return route.fulfill({
        json: {
          id: 9,
          status: 1,
          issueType: 1,
          createdBy: { id: 3, displayName: 'Demo Reader' },
          createdAt: '2026-11-12T00:00:00Z',
          comments: [{ id: 1, message: 'Playback fails', user: { id: 3 } }],
        },
      });
    }
    if (path === '/issue/9')
      return route.fulfill({
        json: {
          id: 9,
          status: 1,
          issueType: 1,
          createdBy: { id: 3, displayName: 'Demo Reader' },
          createdAt: '2026-11-12T00:00:00Z',
          comments: [{ id: 1, message: 'Playback fails', user: { id: 3 } }],
        },
      });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(testAppPath('/movie/20'));
  await page.getByRole('button', { name: 'Report an Issue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report an Issue' });
  await dialog.getByRole('searchbox').fill('demo');
  await dialog.getByRole('combobox', { name: 'Report for' }).selectOption('3');
  await page.screenshot({
    path: info.outputPath('issue-on-behalf-sheet.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('combobox', { name: 'Issue Type' }).selectOption('1');
  await dialog
    .getByRole('textbox', { name: 'Issue Description' })
    .fill('Playback fails');
  await dialog.getByRole('button', { name: 'Submit Report' }).click();
  await expect(page.getByRole('heading', { name: 'Issue #9' })).toBeVisible();
  expect(submitted).toEqual({
    mediaId: 654,
    issueType: 1,
    message: 'Playback fails',
    is4k: false,
    userId: 3,
  });
});

test('a reporter can edit their description and confirm removal of their own reply', async ({
  page,
}) => {
  const comments = [
    { id: 1, message: 'Original description', user: { id: 2 } },
    { id: 2, message: 'My reply', user: { id: 2 } },
    { id: 3, message: 'Someone else’s reply', user: { id: 3 } },
  ];
  const writes: string[] = [];
  let rejectDeleteOnce = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 4194304 } });
    if (path === '/issue/7')
      return route.fulfill({
        json: {
          id: 7,
          status: 1,
          issueType: 1,
          createdBy: { id: 2 },
          comments,
        },
      });
    if (path === '/issueComment/1' && request.method() === 'PUT') {
      writes.push('edit');
      expect(request.postDataJSON()).toEqual({
        message: 'Corrected description',
      });
      comments[0].message = 'Corrected description';
      return route.fulfill({ json: comments[0] });
    }
    if (path === '/issueComment/2' && request.method() === 'DELETE') {
      writes.push('delete');
      if (rejectDeleteOnce) {
        rejectDeleteOnce = false;
        return route.fulfill({ status: 503, json: {} });
      }
      comments.splice(1, 1);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(testAppPath('/issues/7'));
  await expect(page.getByRole('button', { name: 'Delete Issue' })).toHaveCount(
    0
  );
  const othersReply = page
    .getByRole('listitem')
    .filter({ hasText: 'Someone else’s reply' });
  await expect(othersReply.getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Description' }).click();
  await page
    .getByRole('textbox', { name: 'Edit Issue Description' })
    .fill('Corrected description');
  await page.getByRole('button', { name: 'Save Edit' }).click();
  await expect(page.getByText('Corrected description')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Comment' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(writes).toEqual(['edit']);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete Comment' })
    .click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('alert')).toBeVisible();
  await expect(page.getByText('My reply', { exact: true })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Delete Comment' }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByText('My reply', { exact: true })).toHaveCount(0);
  expect(writes).toEqual(['edit', 'delete', 'delete']);
});

test('issue deletion stays confirmed after a recoverable failure', async ({
  page,
}) => {
  let deleteAttempts = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 4194304 } });
    if (path === '/issue/7' && request.method() === 'DELETE') {
      deleteAttempts++;
      if (deleteAttempts === 1) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ status: 204 });
    }
    if (path === '/issue/7')
      return route.fulfill({
        json: {
          id: 7,
          status: 1,
          issueType: 1,
          createdBy: { id: 2 },
          comments: [
            { id: 1, message: 'Original description', user: { id: 2 } },
          ],
        },
      });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(testAppPath('/issues/7'));
  await page.getByRole('button', { name: 'Delete Issue' }).click();
  const confirmation = page.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: 'Delete Issue' }).click();
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('alert')).toBeVisible();
  await confirmation.getByRole('button', { name: 'Delete Issue' }).click();
  await expect(page).toHaveURL(/\/issues$/);
  expect(deleteAttempts).toBe(2);
});

test('an uncertain issue deletion closes after the fresh read confirms absence', async ({
  page,
}) => {
  let deleted = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 4194304 } });
    if (path === '/issue/7' && request.method() === 'DELETE') {
      deleted = true;
      return route.fulfill({ status: 503, json: {} });
    }
    if (path === '/issue/7')
      return deleted
        ? route.fulfill({ status: 404, json: { message: 'Not found' } })
        : route.fulfill({
            json: {
              id: 7,
              status: 1,
              issueType: 1,
              createdBy: { id: 2 },
              comments: [
                { id: 1, message: 'Original description', user: { id: 2 } },
              ],
            },
          });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(testAppPath('/issues/7'));
  await page.getByRole('button', { name: 'Delete Issue' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete Issue' })
    .click();
  await expect(page).toHaveURL(/\/issues$/);
});

test('issue details link to exact non-video catalog titles', async ({
  page,
}) => {
  const titles = [
    {
      mediaType: 'book',
      provider: 'bookshelf',
      value: 'bookshelf:2:aGM6NA',
      label: 'Book',
    },
    {
      mediaType: 'music',
      provider: 'musicbrainz',
      value: 'album-42',
      label: 'Album',
    },
    { mediaType: 'comic', provider: 'comicvine', value: '456', label: 'Comic' },
    {
      mediaType: 'magazine',
      provider: 'lazylibrarian',
      value: 'Science Vol. 2',
      label: 'Magazine',
    },
  ];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 2097152 } });
    const id = /^\/issue\/(\d+)$/.exec(path)?.[1];
    const title = id && titles[Number(id) - 1];
    if (!title) return route.fulfill({ json: {} });
    return route.fulfill({
      json: {
        id: Number(id),
        status: 1,
        issueType: 1,
        createdAt: '2026-11-12T00:00:00Z',
        createdBy: { id: 2 },
        media: {
          mediaType: title.mediaType,
          identifiers: [{ provider: title.provider, value: title.value }],
        },
      },
    });
  });
  for (const [index, title] of titles.entries()) {
    await page.goto(testAppPath(`/issues/${index + 1}`));
    await expect(
      page.getByRole('link', { name: `Open ${title.label}` })
    ).toHaveAttribute(
      'href',
      testAppPath(`/${title.mediaType}/${encodeURIComponent(title.value)}`)
    );
  }
});

test('issue filters read from bookmarks and reset pagination when changed', async ({
  page,
}) => {
  const queries: URLSearchParams[] = [];
  const issue = {
    id: 7,
    status: 1,
    issueType: 1,
    createdBy: { id: 2 },
    createdAt: '2026-11-12T00:00:00Z',
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 2, permissions: 2097152 } });
    if (url.pathname.endsWith('/issue')) {
      queries.push(url.searchParams);
      return route.fulfill({
        json: { results: [issue], pageInfo: { page: 1, pages: 3 } },
      });
    }
    if (url.pathname.endsWith('/issue/7'))
      return route.fulfill({ json: issue });
    return route.fulfill({ json: {} });
  });
  await page.goto(
    testAppPath('/issues?mediaType=book&issueType=audio&timeFrame=7d&page=2')
  );
  await expect(page.getByText('Task Filters', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  if (
    process.env.LUMEN_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(test.info().project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DIR}/issues-filter-groups-${test.info().project.name}.png`,
      fullPage: true,
    });
  await page.getByText('Media Filters', { exact: true }).click();
  await expect(page.getByLabel('Media Type')).toHaveValue('book');
  await expect.poll(() => queries.at(-1)?.get('skip')).toBe('10');
  expect(queries.at(-1)?.get('issueType')).toBe('audio');
  expect(queries.at(-1)?.get('timeFrame')).toBe('7d');
  await page.getByRole('link', { name: 'Video #7' }).click();
  await expect(page.getByRole('heading', { name: 'Issue #7' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Issues' }).click();
  await expect(page).toHaveURL(
    /\/issues\?mediaType=book&issueType=audio&timeFrame=7d&page=2$/
  );
  await page.getByText('Task Filters', { exact: true }).click();
  await page.getByLabel('Issue Type').selectOption('subtitle');
  await expect.poll(() => queries.at(-1)?.get('issueType')).toBe('subtitle');
  expect(queries.at(-1)?.get('skip')).toBe('0');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await page.getByText('Filters', { exact: true }).click();
  await page.getByLabel('Search Issues').fill('missing & audio');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect
    .poll(() => queries.at(-1)?.get('search'))
    .toBe('missing & audio');
  await expect(page.getByLabel('Media Type')).toHaveValue('book');
  await page.getByLabel('Release Year').fill('2020');
  await page.getByLabel('Genre', { exact: true }).fill('science fiction');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.get('releaseYear')).toBe('2020');
  expect(queries.at(-1)?.get('genre')).toBe('science fiction');
  await page.getByText('Sort By', { exact: true }).click();
  await page.getByLabel('Sort Issues').selectOption('modified');
  await expect.poll(() => queries.at(-1)?.get('sort')).toBe('modified');
  await page.getByText('Media Filters', { exact: true }).click();
  await page.getByLabel('Media Type').selectOption('all');
  await expect(page.getByLabel('Release Year')).toHaveCount(0);
  await expect.poll(() => queries.at(-1)?.get('releaseYear')).toBeNull();
});

test('issue filter disclosures save and restore per-user media-scoped pins', async ({
  page,
}) => {
  let savedPins: Record<string, boolean> = {};
  let saves = 0;
  let attempts = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          permissions: 2097152,
          settings: { detailDisclosurePins: { tv: savedPins } },
        },
      });
    if (path === '/user/2/settings/detail-disclosures/tv') {
      attempts++;
      if (attempts === 1)
        return route.fulfill({ status: 500, json: { message: 'save failed' } });
      const change = route.request().postDataJSON() as Record<string, boolean>;
      savedPins = { ...savedPins, ...change };
      saves++;
      return route.fulfill({ json: savedPins });
    }
    if (path === '/issue')
      return route.fulfill({
        json: { results: [], pageInfo: { page: 1, pages: 1 } },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto(testAppPath('/issues?mediaType=tv'));
  const mediaFilters = page
    .locator('details')
    .filter({ has: page.getByText('Media Filters', { exact: true }) });
  await expect(mediaFilters).not.toHaveAttribute('open', '');
  await page.getByText('Media Filters', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Keep Media Filters Open', exact: true })
    .click();
  await expect.poll(() => attempts).toBe(1);
  await expect(
    page.getByText(
      'Could not save this filter display preference. Try again.',
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Keep Media Filters Open', exact: true })
  ).toHaveAttribute('aria-pressed', 'false');
  await page
    .getByRole('button', { name: 'Keep Media Filters Open', exact: true })
    .click();
  await expect.poll(() => saves).toBe(1);
  await expect(mediaFilters).toHaveAttribute('open', '');
  await expect(
    page.getByRole('button', { name: 'Keep Media Filters Open', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  if (
    process.env.LUMEN_CAPTURE_PINNED &&
    ['desktop', 'iphone'].includes(test.info().project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_PINNED}/issues-pinned-${test.info().project.name}.png`,
      fullPage: true,
    });
  await page.reload();
  await expect(mediaFilters).toHaveAttribute('open', '');
  expect(savedPins).toEqual({ mediaFilters: true });
});

test('deleting the final issue on a page preserves filters and returns to the last available page', async ({
  page,
}) => {
  let deleted = false;
  const issue = {
    id: 7,
    status: 1,
    issueType: 1,
    createdBy: { id: 2 },
    createdAt: '2026-11-12T00:00:00Z',
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 2, permissions: 1048576 } });
    if (url.pathname.endsWith('/issue/7')) {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: issue });
    }
    if (url.pathname.endsWith('/issue')) {
      const first = url.searchParams.get('skip') === '0';
      return route.fulfill({
        json: {
          results: first ? [{ ...issue, id: 6 }] : deleted ? [] : [issue],
          pageInfo: { page: first ? 1 : 2, pages: deleted ? 1 : 2 },
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(testAppPath('/issues?mediaType=movie&page=2'));
  await page.getByRole('link', { name: 'Video #7' }).click();
  await page.getByRole('button', { name: 'Delete Issue' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete Issue' })
    .click();
  await expect(page).toHaveURL(/\/issues\?mediaType=movie$/);
  await expect(page.getByRole('link', { name: 'Video #6' })).toBeVisible();
});
