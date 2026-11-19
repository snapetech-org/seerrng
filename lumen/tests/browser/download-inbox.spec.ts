import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

for (const permissions of [32, 8796093022208]) {
  test(`download visibility follows the current account permission ${permissions}`, async ({
    page,
  }) => {
    const queries: URLSearchParams[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice('/api/v1'.length);
      if (path === '/downloads/interventions') {
        queries.push(url.searchParams);
        const history = url.searchParams.get('scope') === 'history';
        return route.fulfill({
          json: {
            total: 30,
            partialSources: ['Radarr'],
            truncated: false,
            results: [
              {
                id: 1,
                title: history ? 'Old Download' : 'Current Download',
                serviceName: 'Movies',
                serviceType: 'radarr',
                state: history ? 'resolved' : 'active',
                resolution: history ? 'manual-rejection' : null,
                warnings: ['Needs a library match'],
                actions: history
                  ? [
                      {
                        at: '2026-11-12T12:00:00Z',
                        actorId: 9,
                        action: 'reject',
                        state: 'manual-rejection',
                        options: { blocklist: true, removeFromClient: false },
                      },
                    ]
                  : [],
              },
            ],
          },
        });
      }
      return route.fulfill({
        json:
          path === '/auth/me'
            ? { id: 1, displayName: 'Reader', permissions }
            : {},
      });
    });

    await page.goto(appPath('/me'));
    const entry = page.getByRole('link', { name: 'Open Download Inbox' });
    if (permissions === 32) {
      await expect(
        page.getByRole('heading', { name: 'You', exact: true })
      ).toBeVisible();
      await expect(entry).toHaveCount(0);
      await page.goto(appPath('/downloads'));
      await expect(
        page.getByText('Manage Downloads permission is required.')
      ).toBeVisible();
      expect(queries).toHaveLength(0);
      return;
    }

    await entry.click();
    await expect(
      page.getByText('Current Download', { exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect.poll(() => queries.at(-1)?.get('page')).toBe('2');
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByText('Old Download', { exact: true })).toBeVisible();
    expect(queries.at(-1)?.get('scope')).toBe('history');
    expect(queries.at(-1)?.get('page')).toBe('1');
    await page.getByText('Action History', { exact: true }).click();
    await expect(
      page.getByText('Client files kept', { exact: false })
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test('manual import sends the chosen target and only eligible files, while rejection keeps source files by default', async ({
  page,
}) => {
  const posts: { path: string; body: unknown }[] = [];
  const fingerprint = 'a'.repeat(64);
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    const base = '/downloads/interventions';
    if (request.method() === 'POST' && path.startsWith(base)) {
      posts.push({ path, body: request.postDataJSON() });
      return route.fulfill({
        json: {
          id: 7,
          state: path.endsWith('/import') ? 'importing' : 'resolved',
        },
      });
    }
    if (path === base)
      return route.fulfill({
        json: {
          total: 1,
          partialSources: [],
          truncated: false,
          results: [
            {
              id: 7,
              title: 'Example Release',
              serviceName: 'Movies',
              serviceType: 'radarr',
              state: 'active',
              warnings: [],
              manualImportCapable: true,
            },
          ],
        },
      });
    if (path === `${base}/7/targets`)
      return route.fulfill({ json: [{ id: 3, title: 'Matched Movie' }] });
    if (path === `${base}/7/preview`) {
      const matched = url.searchParams.get('targetId') === '3';
      return route.fulfill({
        json: {
          target: matched ? { id: 3, title: 'Matched Movie' } : null,
          fingerprint,
          candidates: [
            {
              id: 14,
              name: 'Movie.mkv',
              size: 102400,
              eligible: matched,
              rejections: [],
            },
            {
              id: 15,
              name: 'Sample.mkv',
              size: 1024,
              eligible: false,
              rejections: ['Sample file'],
            },
          ],
        },
      });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Operator', permissions: 8796093022208 }
          : {},
    });
  });
  await page.goto(appPath('/downloads'));
  await page.getByRole('button', { name: 'Preview Files' }).click();
  const sheet = page.getByRole('dialog', { name: 'Preview Download Files' });
  await expect(
    sheet.getByRole('button', { name: 'Import Selected Files' })
  ).toBeDisabled();
  await sheet.getByRole('button', { name: 'Search Library' }).click();
  await sheet
    .getByRole('button', { name: 'Choose Match: Matched Movie' })
    .click();
  await expect(sheet.getByText('Selected match: Matched Movie')).toBeVisible();
  await expect(
    sheet.getByRole('checkbox', { name: 'Select Sample.mkv' })
  ).toBeDisabled();
  await sheet.getByRole('checkbox', { name: 'Select Movie.mkv' }).check();
  await sheet.getByRole('button', { name: 'Import Selected Files' }).click();
  await expect(sheet).toHaveCount(0);
  expect(posts).toEqual([
    {
      path: '/downloads/interventions/7/import',
      body: {
        candidateIds: [14],
        importMode: 'copy',
        fingerprint,
        targetId: 3,
      },
    },
  ]);
  await page.getByRole('button', { name: 'Reject Download' }).click();
  const reject = page.getByRole('dialog', { name: 'Reject Download' });
  await expect(
    reject.getByRole('checkbox', {
      name: 'Remove the Download and Files From Its Client',
    })
  ).not.toBeChecked();
  await reject.getByRole('button', { name: 'Confirm Rejection' }).click();
  await expect(reject).toHaveCount(0);
  expect(posts.at(-1)).toEqual({
    path: '/downloads/interventions/7/reject',
    body: { blocklist: true, removeFromClient: false },
  });
});
