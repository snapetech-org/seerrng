import { expect, test } from '@playwright/test';

test('Patch discovery filters, follows the exact project and pages through results', async ({
  page,
}) => {
  const key = `dat-${'a'.repeat(64)}`;
  let followed = false;
  const searches: Record<string, string>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    switch (url.pathname.slice('/api/v1'.length)) {
      case '/auth/me':
        return route.fulfill({
          json: { id: 1, displayName: 'Player', permissions: 32 },
        });
      case '/patches/search':
        searches.push(Object.fromEntries(url.searchParams));
        return route.fulfill({
          json: {
            available: true,
            nextCursor: url.searchParams.has('cursor')
              ? null
              : 'fixture-cursor',
            results: url.searchParams.has('cursor')
              ? []
              : [
                  {
                    id: 'patch-1',
                    name: 'Fixture Translation',
                    kind: 'translation',
                    language: 'en',
                    status: 'complete',
                    game: { catalogKey: key, title: 'Fixture Game' },
                    versions: [{ id: 'v2', version: '2.0' }],
                    latestVersionId: 'v2',
                  },
                ],
          },
        });
      case '/follow':
        if (request.method() === 'POST') {
          const subject = request.postDataJSON();
          expect(subject).toMatchObject({
            kind: 'patch-project',
            subjectKey: 'patch:patch-1',
            conditions: { ref: { projectId: 'patch-1' } },
          });
          followed = true;
          return route.fulfill({ status: 201, json: { id: 1, ...subject } });
        }
        return route.fulfill({ json: { results: [] } });
      default:
        return route.fulfill({ json: {} });
    }
  });
  await page.goto('/patches');
  await expect(page.getByText('Fixture Translation')).toBeVisible();
  expect(searches[0]).toEqual({ language: 'en', completeOnly: 'true' });
  await expect(page.getByRole('link', { name: 'Open Game' })).toHaveAttribute(
    'href',
    `/game/retro/${key}?dat=1`
  );
  const follow = page.getByRole('button', { name: 'Follow', exact: true });
  await follow.click();
  await expect(page.getByRole('button', { name: 'Following' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(followed).toBe(true);
  await page.getByLabel('Search Titles').fill('Fixture');
  await page.getByLabel('Kind', { exact: true }).selectOption('translation');
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await expect
    .poll(() => searches.at(-1))
    .toMatchObject({ q: 'Fixture', kind: 'translation' });
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByText('No projects matched.')).toBeVisible();
  expect(searches.at(-1)?.cursor).toBe('fixture-cursor');
  await page.getByRole('button', { name: 'First Page' }).click();
  await expect(page.getByText('Fixture Translation')).toBeVisible();
});
