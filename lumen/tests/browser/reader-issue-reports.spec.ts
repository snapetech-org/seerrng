import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const cases = [
  { path: '/book/OL123W', format: 'book', reasonCount: 5 },
  { path: '/comic/al-1', format: 'comic', reasonCount: 5 },
  { path: '/magazine/Fixture%20Magazine', format: 'magazine', reasonCount: 5 },
  { path: '/music/album-42', format: 'music', reasonCount: 0 },
] as const;

test('reader and music detail reports expose category-specific issue controls', async ({
  page,
}) => {
  const posts: Record<string, unknown>[] = [];
  const apiPath = (url: string) =>
    new URL(url).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    if (path === '/issue' && request.method() === 'POST') {
      posts.push(request.postDataJSON());
      return route.fulfill({ json: { id: 900 + posts.length } });
    }
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reporter', permissions: 5242880 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          booksEnabled: true,
          comicsEnabled: true,
          magazinesEnabled: true,
          musicEnabled: true,
          enabledMediaCategories: {
            book: true,
            comic: true,
            magazine: true,
            music: true,
          },
        },
      });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    if (path === '/book/OL123W')
      return route.fulfill({
        json: {
          id: 'OL123W',
          title: 'Fixture Book',
          author: 'Fixture Author',
          mediaInfo: { id: 72, status: 5 },
        },
      });
    if (path === '/comic/work/al-1')
      return route.fulfill({
        json: {
          id: 'al-1',
          mediaType: 'comic',
          kind: 'manga',
          title: 'Fixture Comic',
          editions: [
            {
              id: '11',
              publisher: 'Fixture Press',
              languageName: 'English',
              recommended: true,
              mediaInfo: { id: 73, status: 5 },
            },
          ],
          editionsResolved: true,
          recommendedId: '11',
        },
      });
    if (path === '/comic/11')
      return route.fulfill({
        json: {
          id: '11',
          title: 'Fixture Comic',
          mediaInfo: { id: 73, status: 5 },
        },
      });
    if (path === '/magazine/Fixture%20Magazine')
      return route.fulfill({
        json: {
          id: 'fixture-magazine',
          title: 'Fixture Magazine',
          publisher: 'Fixture Press',
          requestable: false,
          mediaInfo: { id: 74, status: 5 },
        },
      });
    if (path === '/music/album-42')
      return route.fulfill({
        json: {
          id: 'album-42',
          title: 'Fixture Album',
          artist: { id: 'artist-42', name: 'Fixture Artist' },
          mediaInfo: { id: 75, status: 5 },
          tracks: [],
        },
      });
    if (path.startsWith('/service/') || path.startsWith('/genres/'))
      return route.fulfill({ json: [] });
    if (path.endsWith('/similar') || path.endsWith('/artist-similar'))
      return route.fulfill({ json: { results: [] } });
    if (path.startsWith('/discover/genreslider/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  for (const item of cases) {
    await page.goto(appPath(item.path));
    const report = page.getByRole('button', { name: 'Report an Issue' });
    await expect(report, item.path).toBeEnabled();
    await report.click();
    const dialog = page.getByRole('dialog', { name: 'Report an Issue' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('textbox', { name: 'Issue Description' })
    ).toBeVisible();
    const type = dialog.getByRole('combobox', { name: 'Issue Type' });
    if (item.format === 'music') {
      await expect(type.locator('option')).toHaveText(['Other', 'Audio']);
    } else {
      await expect(type.locator('option')).toHaveCount(1);
      await expect(type).toHaveValue('4');
    }
    const reason = dialog.getByRole('combobox', { name: 'Reason' });
    if (item.reasonCount) {
      await expect(reason.locator('option')).toHaveCount(item.reasonCount);
      await reason.selectOption('damaged_file');
    } else {
      await expect(reason).toHaveCount(0);
    }
    await dialog
      .getByRole('textbox', { name: 'Issue Description' })
      .fill(`Damaged ${item.format}`);
    await dialog.getByRole('button', { name: 'Submit Report' }).click();
    expect(posts.at(-1)).toMatchObject({
      mediaId: { book: 72, comic: 73, magazine: 74, music: 75 }[item.format],
      issueType: 4,
      message: `Damaged ${item.format}`,
      is4k: false,
      ...(item.reasonCount ? { issueSubtype: 'damaged_file' } : {}),
    });
  }
});
