import { expect, test } from '@playwright/test';

test('household users can open Following and manage their own updates', async ({
  page,
  baseURL,
}) => {
  let seen = false;
  let notify = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/follow/events/seen') {
      expect(route.request().postDataJSON()).toEqual({ ids: [1] });
      seen = true;
      return route.fulfill({ status: 204 });
    }
    if (path === '/follow/2' && route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ notify: false });
      notify = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/follow/events/count')
      return route.fulfill({ json: { unseen: seen ? 0 : 1 } });
    if (path === '/follow/events')
      return route.fulfill({
        json: {
          total: 3,
          results: [
            {
              id: 1,
              title: 'A New Film',
              seen,
              follow: { subjectLabel: 'Example Director' },
              target: { mediaType: 'movie', id: '10' },
            },
            {
              id: 3,
              title: 'New Story Expansion',
              reasonKey: 'newExpansion',
              reasonValues: { game: 'Fixture Game' },
              seen: true,
              follow: { subjectLabel: 'Fixture Game', kind: 'expansion' },
              target: { mediaType: 'game', id: '42' },
            },
            {
              id: 4,
              title: 'Translation Patch 2',
              seen: true,
              follow: {
                subjectLabel: 'Translation Patch',
                kind: 'patch-project',
              },
              reasonKey: 'newPatchVersion',
              reasonValues: {
                project: 'Translation Patch',
                version: '2',
                game: 'Fixture Game',
              },
              target: {
                mediaType: 'patch',
                id: 'translation',
                variantKey: 'v2',
              },
            },
          ],
        },
      });
    if (path === '/follow')
      return route.fulfill({
        json: {
          results: [
            {
              id: 2,
              kind: 'tmdb-person',
              subjectLabel: 'Example Director',
              notify,
              autoRequest: false,
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('./me');
  await page.getByRole('link', { name: 'Open Following', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Following', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'A New Film' })).toHaveAttribute(
    'href',
    new URL('./movie/10', baseURL).pathname
  );
  await expect(
    page.getByRole('link', { name: 'New Story Expansion' })
  ).toHaveAttribute('href', new URL('./game/game/42', baseURL).pathname);
  await expect(
    page.getByText('New content for Fixture Game: New Story Expansion.')
  ).toBeVisible();
  await expect(
    page.getByText('Translation Patch 2 is available for Fixture Game.')
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Translation Patch 2', exact: true })
  ).toHaveAttribute(
    'href',
    new URL('./patches/translation', baseURL).pathname + '?version=v2'
  );
  await page.getByRole('button', { name: 'Mark Seen: A New Film' }).click();
  await expect(
    page.getByRole('button', { name: 'Mark Seen: A New Film' })
  ).toHaveCount(0);
  const notification = page.getByRole('checkbox', { name: 'Notify Me' });
  await expect(notification).toBeChecked();
  await notification.click();
  await expect(notification).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Request Automatically' })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('direct navigation without request access does not fetch follows', async ({
  page,
}) => {
  let requested = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    requested ||= path.startsWith('/follow');
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Viewer', permissions: 4 }
          : {},
    });
  });
  await page.goto('./following');
  await expect(
    page.getByText('Request access is required to use Following.')
  ).toBeVisible();
  expect(requested).toBe(false);
});

test('following a person uses the exact identity and waits for server confirmation', async ({
  page,
}) => {
  const person = { id: 77, name: 'Example Director' };
  let followed = false;
  let fail = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    const record = { id: 2, kind: 'tmdb-person', subjectKey: 'tmdb:person:77' };
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({
        kind: 'tmdb-person',
        subjectKey: 'tmdb:person:77',
        subjectLabel: person.name,
        conditions: { ref: { tmdbId: 77 } },
      });
      if (fail)
        return route.fulfill({ status: 500, json: { message: 'Try again' } });
      followed = true;
      return route.fulfill({ status: 201, json: record });
    }
    if (path === '/follow/2' && request.method() === 'DELETE') {
      followed = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Reader', permissions: 32 }
          : path === '/person/77'
            ? person
            : path === '/follow'
              ? { results: followed ? [record] : [] }
              : {},
    });
  });
  await page.goto('./person/77');
  const follow = page.getByRole('button', { name: 'Follow', exact: true });
  await follow.click();
  await expect(page.getByRole('status')).toContainText('Try again');
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  fail = false;
  await follow.click();
  const following = page.getByRole('button', {
    name: 'Following',
    exact: true,
  });
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await following.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
});
