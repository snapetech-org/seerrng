import { expect, test } from '@playwright/test';

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

    await page.goto('/me');
    const entry = page.getByRole('link', { name: 'Open Download Inbox' });
    if (permissions === 32) {
      await expect(
        page.getByRole('heading', { name: 'You', exact: true })
      ).toBeVisible();
      await expect(entry).toHaveCount(0);
      await page.goto('/downloads');
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
