import { expect, test, type Page } from '@playwright/test';
import { testAppPath } from './testAppPath';

type Quota = {
  adult?: {
    limit: number;
    remaining: number;
    days: number;
    restricted: boolean;
  };
};

async function openAdultDetail(
  page: Page,
  options: {
    quota: () => Quota | null;
    post: (body: unknown) => { status?: number; id?: number };
    onPost?: (body: unknown) => void;
  }
) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Viewer', permissions: 140737488355328 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { adultEnabled: true, enabledMediaCategories: { adult: true } },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale: 'en', enabledMediaCategories: { adult: true } },
      });
    if (path === '/user/1/quota') {
      const response = options.quota();
      return response
        ? route.fulfill({ json: response })
        : route.fulfill({
            status: 503,
            json: { message: 'Quota temporarily unavailable' },
          });
    }
    if (path === '/service/whisparr')
      return route.fulfill({
        json: [{ id: 1, name: 'Default Whisparr', isDefault: true }],
      });
    if (path === '/adult/search')
      return route.fulfill({ json: { results: [] } });
    if (path === '/adult/42')
      return route.fulfill({
        json: {
          id: '42',
          mediaType: 'adult',
          title: 'Fixture Scene',
          serviceId: 1,
          performers: [],
        },
      });
    if (path === '/request' && request.method() === 'POST') {
      const body = request.postDataJSON();
      options.onPost?.(body);
      return route.fulfill({ json: options.post(body) });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto(testAppPath('/adult/42'));
  await expect(
    page.getByRole('heading', { name: 'Fixture Scene' })
  ).toBeVisible();
}

test('adult quota blocks the detail request until rechecked', async ({
  page,
}, info) => {
  let quotaReads = 0;
  const posts: unknown[] = [];
  await openAdultDetail(page, {
    quota: () => {
      quotaReads++;
      return {
        adult: {
          limit: 1,
          remaining: quotaReads > 1 ? 1 : 0,
          days: 14,
          restricted: quotaReads === 1,
        },
      };
    },
    post: () => ({ id: 90 }),
    onPost: (body) => posts.push(body),
  });
  await expect(page.getByText('Adult request quota reached.')).toBeVisible();
  const action = page.getByRole('button', { name: 'Request', exact: true });
  await expect(action).toBeDisabled();
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath('adult-quota-blocked.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Recheck quota' }).click();
  await expect(action).toBeEnabled();
  await action.click();
  const sheet = page.getByRole('alertdialog', { name: 'Request Adult Scene' });
  await expect(
    sheet.getByText('1 of 1 Adult requests remaining.')
  ).toBeVisible();
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath('adult-quota-sheet.png'),
      fullPage: true,
    });
  await sheet.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Adult request submitted.' })
  ).toBeVisible();
  expect(posts).toEqual([{ mediaType: 'adult', mediaId: '42' }]);
});

test('adult quota load failure blocks requests and can be retried', async ({
  page,
}) => {
  let quotaReads = 0;
  const posts: unknown[] = [];
  await openAdultDetail(page, {
    quota: () =>
      ++quotaReads === 1
        ? null
        : { adult: { limit: 2, remaining: 2, days: 7, restricted: false } },
    post: () => ({ id: 91 }),
    onPost: (body) => posts.push(body),
  });
  await expect(
    page.getByText('Could not load Adult request quota.')
  ).toBeVisible();
  const action = page.getByRole('button', { name: 'Request', exact: true });
  await expect(action).toBeDisabled();
  await page.getByRole('button', { name: 'Recheck quota' }).click();
  await expect(action).toBeEnabled();
  expect(posts).toEqual([]);
});

test('failed adult handoff stays in the confirmation and can be retried', async ({
  page,
}) => {
  let submissions = 0;
  await openAdultDetail(page, {
    quota: () => ({
      adult: { limit: 2, remaining: 2, days: 7, restricted: false },
    }),
    post: () => (++submissions === 1 ? { status: 4 } : { status: 2, id: 92 }),
  });
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  const sheet = page.getByRole('alertdialog', { name: 'Request Adult Scene' });
  const confirm = sheet.getByRole('button', { name: 'Request', exact: true });
  await confirm.click();
  await expect(sheet.getByRole('alert')).toHaveText(
    'The Adult request failed while processing.'
  );
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Adult request submitted.' })
  ).toBeVisible();
  await expect(sheet).toHaveCount(0);
});
