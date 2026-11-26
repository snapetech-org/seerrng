import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('Patch discovery filters, follows the exact project and pages through results', async ({
  page,
}) => {
  const key = `dat-${'a'.repeat(64)}`;
  let followed = false;
  let invalidProject = true;
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
      case '/settings/public':
        return route.fulfill({
          json: {
            softwareEnabled: true,
            romarrEnabled: true,
            enabledMediaCategories: { game: true, modern: true },
          },
        });
      case '/patches/search':
        searches.push(Object.fromEntries(url.searchParams));
        if (searches.length === 1)
          return route.fulfill({ json: { available: true, results: [null] } });
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
      case '/patches/projects/patch-1':
        if (invalidProject) {
          invalidProject = false;
          return route.fulfill({ json: { id: 'patch-1' } });
        }
        return route.fulfill({
          json: {
            id: 'patch-1',
            name: 'Fixture Translation',
            kind: 'translation',
            status: 'complete',
            game: { catalogKey: key, title: 'Fixture Game' },
            versions: [{ id: 'v2', version: '2.0' }],
            latestVersionId: 'v2',
          },
        });
      case `/request/software/catalog/games/${key}`:
        expect(url.searchParams.get('category')).toBe('modern');
        return route.fulfill({
          json: {
            catalogProvider: 'dat',
            catalogId: key,
            title: 'Fixture Game',
            genres: [],
            platforms: [],
            emulationSystems: [
              { group: 'modern', slug: '3ds', name: 'Nintendo 3DS' },
              { group: 'modern', slug: 'switch', name: 'Switch' },
            ],
          },
        });
      default:
        return route.fulfill({ json: {} });
    }
  });
  await page.goto('/patches');
  const searchError = page
    .getByRole('alert')
    .filter({ hasText: 'Invalid patch catalogue response.' });
  await expect(searchError).toBeVisible();
  await searchError.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Fixture Translation')).toBeVisible();
  expect(searches[0]).toEqual({ language: 'en', completeOnly: 'true' });
  expect(searches[1]).toEqual(searches[0]);
  await expect(page.getByRole('link', { name: 'Open Game' })).toHaveAttribute(
    'href',
    appPath(`/game/retro/${key}?dat=1`)
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
  await page.goto(`/patches?catalogKey=${key}&platform=switch&category=modern`);
  await expect(page.getByRole('link', { name: 'Open Game' })).toHaveAttribute(
    'href',
    appPath(`/game/modern/${key}?dat=1&platform=switch`)
  );
  const choose = page.getByRole('link', { name: 'Choose a Version' });
  await expect(choose).toHaveAttribute(
    'href',
    appPath('/patches/patch-1?category=modern&platform=switch')
  );
  await choose.click();
  const invalid = page
    .getByRole('alert')
    .filter({ hasText: 'Invalid patch project response.' });
  await expect(invalid).toBeVisible();
  await invalid.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByLabel('Game Type')).toHaveValue('modern');
  await expect(page.getByLabel('System', { exact: true })).toHaveValue(
    'switch'
  );
  await page.reload();
  await expect(page.getByLabel('System', { exact: true })).toHaveValue(
    'switch'
  );
  await page.goto(
    '/patches/patch-1?category=modern&platform=unknown&version=missing'
  );
  await expect(
    page.getByText(/This patch version is no longer listed/)
  ).toBeVisible();
  await expect(
    page.getByText(/The selected console is incompatible/)
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Request Patch' })
  ).toBeDisabled();
  await page.getByLabel('Patch Version').selectOption('v2');
  await page.getByLabel('System', { exact: true }).selectOption('switch');
  await page.getByRole('link', { name: 'Open Game' }).click();
  await expect(page.getByRole('combobox', { name: 'Console' })).toHaveValue(
    'switch'
  );
  await page.goto(`/game/modern/${key}?dat=1&platform=unsupported`);
  await expect(page.getByRole('combobox', { name: 'Console' })).toHaveValue('');
  await expect(
    page
      .getByRole('button', { name: 'Request', exact: true })
      .filter({ visible: true })
  ).toBeDisabled();
});

test('a Following update opens its exact patch version and submits only with a compatible base', async ({
  page,
}) => {
  const key = `dat-${'b'.repeat(64)}`;
  let submissions = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    switch (url.pathname.slice('/api/v1'.length)) {
      case '/auth/me':
        return route.fulfill({
          json: { id: 1, displayName: 'Player', permissions: 32 },
        });
      case '/settings/public':
        return route.fulfill({
          json: {
            softwareEnabled: true,
            romarrEnabled: true,
            enabledMediaCategories: { game: true, modern: true, retro: true },
          },
        });
      case '/follow/events':
        return route.fulfill({
          json: {
            total: 1,
            results: [
              {
                id: 1,
                title: 'Patch v1',
                seen: true,
                follow: { subjectLabel: 'Patch Fixture' },
                target: {
                  mediaType: 'patch',
                  id: 'patch:fixture',
                  variantKey: 'v1',
                },
              },
            ],
          },
        });
      case '/follow':
        return route.fulfill({ json: { results: [] } });
      case '/patches/projects/patch%3Afixture':
        return route.fulfill({
          json: {
            id: 'patch:fixture',
            name: 'Patch Fixture',
            game: {
              catalogKey: key,
              title: 'Fixture Game',
              platformSlug: 'snes',
            },
            latestVersionId: 'v2',
            versions: [
              { id: 'v1', version: '1.0', base: { available: false } },
              { id: 'v2', version: '2.0', base: { available: true } },
            ],
          },
        });
      case `/request/software/catalog/games/${key}`:
        return route.fulfill({
          json: {
            game: {
              catalogProvider: 'dat',
              catalogId: key,
              emulationSystems: [
                { group: 'retro', slug: 'snes', name: 'SNES' },
                { group: 'retro', slug: 'other', name: 'Other System' },
              ],
            },
          },
        });
      case '/request/software':
        expect(req.method()).toBe('POST');
        expect(req.postDataJSON()).toEqual({
          category: 'retro',
          catalogProvider: 'dat',
          catalogKey: key,
          platformSlug: 'snes',
          selection: {
            kind: 'patch',
            projectId: 'patch:fixture',
            versionId: 'v2',
            keepOriginal: true,
          },
        });
        submissions++;
        return route.fulfill({
          status: 201,
          json: { request: { id: 71, status: 'pending' } },
        });
      case '/request/software/status/71':
        return route.fulfill({
          json: {
            status: 'pending',
            request: {
              id: 71,
              title: 'Fixture Game',
              category: 'retro',
              status: 'pending',
              selection: {
                kind: 'patch',
                projectId: 'patch:fixture',
                versionId: 'v2',
                keepOriginal: true,
              },
            },
            assets: [],
            history: [],
          },
        });
      default:
        return route.fulfill({ json: {} });
    }
  });
  await page.goto('/following');
  const link = page.getByRole('link', { name: 'Patch v1' });
  await expect(link).toHaveAttribute(
    'href',
    appPath('/patches/patch%3Afixture?version=v1')
  );
  await link.click();
  await expect(page.getByLabel('Patch Version')).toHaveValue('v1');
  const submit = page.getByRole('button', { name: 'Request Patch' });
  await expect(submit).toBeDisabled();
  await expect(
    page.getByText('The required base revision is unavailable.')
  ).toBeVisible();
  expect(submissions).toBe(0);
  await page.getByLabel('Patch Version').selectOption('');
  await page.reload();
  await expect(page.getByLabel('Patch Version')).toHaveValue('');
  await expect(submit).toBeDisabled();
  await page.getByLabel('Patch Version').selectOption('v2');
  await page.reload();
  await expect(page.getByLabel('Patch Version')).toHaveValue('v2');
  await expect(page.getByLabel('System', { exact: true })).toHaveValue('snes');
  await submit.click();
  await expect(page.getByText('Waiting for approval')).toBeVisible();
  await expect(submit).toBeDisabled();
  expect(submissions).toBe(1);
  await page
    .getByRole('link', { name: 'Request History', exact: true })
    .click();
  const history = page.getByRole('dialog', {
    name: 'History',
  });
  await expect(
    history.getByText('Keep original', { exact: true })
  ).toBeVisible();
  const requestedVersion = history.getByRole('link', {
    name: 'Open Requested Patch Version',
  });
  await expect(requestedVersion).toHaveAttribute(
    'href',
    appPath('/patches/patch%3Afixture?version=v2')
  );
  await requestedVersion.click();
  await expect(page.getByLabel('Patch Version')).toHaveValue('v2');
});
