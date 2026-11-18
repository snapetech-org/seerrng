import { expect, test } from '@playwright/test';

test('Bookshelf moves require the current preview and track the queued command', async ({
  page,
}, info) => {
  const requests: { path: string; body: unknown }[] = [];
  let statusReads = 0;
  let configurationReads = 0;
  let previews = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/settings/readarr')
      return route.fulfill({
        json: [{ id: 11, name: 'Bookshelf', serviceType: 'audiobook' }],
      });
    if (path.endsWith('/configuration')) {
      configurationReads++;
      return route.fulfill({
        json: {
          authors: [
            {
              id: 3,
              name: 'Example Author',
              path: '/old',
              currentFormatPath: '/old',
              bookFileCount: 1,
            },
          ],
          rootFolders: [
            { id: 1, path: '/new', accessible: true },
            { id: 2, path: '/other', accessible: true },
            { id: 3, path: '/offline', accessible: false },
          ],
          truncated: false,
        },
      });
    }
    if (path.endsWith('/commands/91')) {
      statusReads++;
      return route.fulfill({
        json: {
          command: {
            id: 91,
            status: statusReads === 1 ? 'running' : 'completed',
          },
        },
      });
    }
    if (request.method() !== 'POST') return route.fulfill({ json: {} });
    requests.push({
      path: path.split('/').at(-1)!,
      body: request.postDataJSON(),
    });
    if (path.endsWith('/preview')) {
      previews++;
      return route.fulfill({
        json: {
          previewToken: 'preview-' + previews,
          authorCount: 1,
          mediaFileCount: 1,
          sidecarFileCount: 0,
          missingFileCount: 0,
          requiredCopyBytes: 1024,
          availableSpace: 4096,
          canMove: previews > 1,
          warnings: [],
          conflicts: previews === 1 ? ['Destination exists.'] : [],
          authors: [
            {
              authorId: 3,
              authorName: 'Example Author',
              sourcePath: '/old/book',
              destinationPath: '/other/book',
              mediaFileCount: 1,
              sidecarFileCount: 0,
              missingFileCount: 0,
              files: [
                {
                  fileType: 'media',
                  status: 'ready',
                  sourcePath: '/old/book',
                  destinationPath: '/other/book',
                },
              ],
            },
          ],
        },
      });
    }
    return route.fulfill({ json: { command: { id: 91, status: 'queued' } } });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Library Migration' }).click();
  await expect(page.getByLabel('Media Format')).toHaveValue('audiobook');
  const destination = page.getByLabel('Destination Root Folder');
  await destination.selectOption('/new');
  await expect(destination.locator('option')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Select Example Author' }).check();
  await page.getByRole('button', { name: 'Preview Move' }).click();
  await expect(page.getByText('Conflict: Destination exists.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Move' })).toHaveCount(0);
  await destination.selectOption('/other');
  await expect(page.getByRole('heading', { name: 'Move Preview' })).toHaveCount(
    0
  );
  await page.getByRole('button', { name: 'Preview Move' }).click();
  const start = page.getByRole('button', { name: 'Start Move' });
  await expect(start).toBeDisabled();
  await page.getByText('Review Authors and Files', { exact: true }).click();
  await page.getByText('Example Author', { exact: true }).last().click();
  await expect(
    page.getByText('ready (media): /old/book → /other/book')
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /I reviewed this preview/ }).check();
  if (process.env.LUMEN_CAPTURE_MIGRATION) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('preview.png'),
      fullPage: true,
    });
  }
  await start.click();
  await expect(page.getByText('Move 91: completed.')).toBeVisible();
  await expect.poll(() => configurationReads).toBe(2);
  expect(requests).toEqual([
    {
      path: 'preview',
      body: {
        authorIds: [3],
        format: 'audiobook',
        destinationRootPath: '/new',
      },
    },
    {
      path: 'preview',
      body: {
        authorIds: [3],
        format: 'audiobook',
        destinationRootPath: '/other',
      },
    },
    {
      path: 'start',
      body: {
        authorIds: [3],
        format: 'audiobook',
        destinationRootPath: '/other',
        previewToken: 'preview-2',
      },
    },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_MIGRATION) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('migration.png'),
      fullPage: true,
    });
  }
});
