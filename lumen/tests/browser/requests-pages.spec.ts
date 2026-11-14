import { expect, test, type Page } from '@playwright/test';

// SeerrNG verifies at most 32 title variants per answer and reports the rest as not available,
// so request lists are fetched in pages small enough that every title keeps its real status.
async function fixture(
  page: Page,
  count = 40,
  options = { permissions: 2, requesterId: 1 }
) {
  const takes: number[] = [];
  let activeOwnerPages = 0;
  let maxConcurrentOwnerPages = 0;
  const all = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    type: 'movie',
    status: 2,
    is4k: false,
    createdAt: new Date(Date.UTC(2026, 10, 8, 12) - i * 60_000).toISOString(),
    requestedBy: { id: options.requesterId, displayName: 'Movie requester' },
    media: { mediaType: 'movie', tmdbId: 1000 + i, status: 5 },
  }));
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', async (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return r.fulfill({
        json: {
          id: 1,
          displayName: 'viewer',
          permissions: options.permissions,
        },
      });
    if (path === '/settings/public')
      return r.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/request' || path === '/request/status') {
      const take = Number(url.searchParams.get('take') || 20);
      const skip = Number(url.searchParams.get('skip') || 0);
      takes.push(take);
      const filter = url.searchParams.get('filter');
      const requestedBy = url.searchParams.get('requestedBy');
      const list =
        filter === 'pending' || filter === 'processing'
          ? []
          : all.filter(
              (row) =>
                (!requestedBy || String(row.requestedBy.id) === requestedBy) &&
                (options.permissions !== 32 || row.requestedBy.id === 1)
            );
      const ownerPage =
        filter === 'all' && url.searchParams.get('requestedBy') === '1';
      if (ownerPage) {
        activeOwnerPages++;
        maxConcurrentOwnerPages = Math.max(
          maxConcurrentOwnerPages,
          activeOwnerPages
        );
      }
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        return await r.fulfill({
          json: {
            pageInfo: {
              pages: Math.ceil(list.length / take),
              results: list.length,
            },
            results: list.slice(skip, skip + take),
          },
        });
      } finally {
        if (ownerPage) activeOwnerPages--;
      }
    }
    if (path.startsWith('/movie/'))
      return r.fulfill({
        json: { id: Number(path.slice(7)), title: `Title ${path.slice(7)}` },
      });
    return r.fulfill({ json: {} });
  });
  return { takes, maxConcurrentOwnerPages: () => maxConcurrentOwnerPages };
}

for (const everyone of [false, true]) {
  test(`${everyone ? 'Everyone' : 'My requests'} asks for small pages so availability stays verified`, async ({
    page,
  }) => {
    const { takes } = await fixture(page);
    await page.goto(everyone ? '/requests?tab=everyone' : '/requests?tab=all');
    await expect(page.locator('.rq').first()).toBeVisible();
    await expect
      .poll(() => page.locator('.rq').count())
      .toBeGreaterThanOrEqual(everyone ? 20 : 40);
    expect(takes.length).toBeGreaterThan(1);
    expect(Math.max(...takes)).toBeLessThanOrEqual(15);
  });
}

test('My requests loads every page so the counts are the real totals', async ({
  page,
}) => {
  const { maxConcurrentOwnerPages } = await fixture(page, 100);
  await page.goto('/requests?tab=all');
  await expect(page.getByRole('button', { name: /^All\s*100$/ })).toBeVisible();
  await expect(page.locator('.rq')).toHaveCount(100);
  await expect(page.locator('.rq').first().getByRole('link')).toHaveText(
    'Title 1000'
  );
  await expect(page.locator('.rq').last().getByRole('link')).toHaveText(
    'Title 1099'
  );
  expect(maxConcurrentOwnerPages()).toBeGreaterThan(1);
  expect(maxConcurrentOwnerPages()).toBeLessThanOrEqual(4);
});

test('the Requests link shows another user’s approved movie to a read-only viewer', async ({
  page,
}) => {
  await fixture(page, 1, { permissions: 16384, requesterId: 2 });
  await page.goto('/requests');
  const everyone = page.getByRole('button', { name: /^Everyone/ });
  const row = page.locator('.rq').filter({ hasText: 'Title 1000' });
  await expect(everyone).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toContainText('Movie requester');
  await expect(
    row.getByRole('button', {
      name: /Approve|Decline|Remove|Retry|Change|Cancel/,
    })
  ).toHaveCount(0);

  await page.getByRole('button', { name: /^Active/ }).click();
  await expect(page).toHaveURL(/tab=active$/);
  await expect(row).toHaveCount(0);
  await everyone.click();
  await expect(row).toBeVisible();
});

test('a personal viewer stays on their own requests', async ({ page }) => {
  await fixture(page, 1, { permissions: 32, requesterId: 2 });
  await page.goto('/requests?tab=everyone');
  await expect(page.getByRole('button', { name: /^Active/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByRole('button', { name: /^Everyone/ })).toHaveCount(0);
  await expect(page.getByText('No active requests')).toBeVisible();
  await expect(page.getByText('Title 1000')).toHaveCount(0);
});
