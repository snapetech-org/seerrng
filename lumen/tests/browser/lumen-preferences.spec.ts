import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

async function fixture(page: Page) {
  const profile: Record<string, unknown> = {
    locale: 'en',
    lumenPreferences: {
      theme: 'light',
      rows: { hero: false },
      narratorChoice: false,
      hoverRequest: false,
    },
  };
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({
      json: {
        defaults: { hoverRequest: true },
        locked: ['hoverRequest'],
      },
    })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 4, displayName: 'Viewer', permissions: 32 },
      });
    if (path === '/user/4/settings/main') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push(body.lumenPreferences);
        profile.lumenPreferences = body.lumenPreferences;
      }
      return route.fulfill({ json: profile });
    }
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 1,
          softwareEnabled: true,
          enabledMediaCategories: { movie: true, tv: true, book: true },
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/lumen/configuration', (route) =>
    route.fulfill({
      json: {
        defaults: { hoverRequest: true },
        locked: ['hoverRequest'],
      },
    })
  );
  return { profile, writes };
}

test('server preferences override browser copies, retain admin locks, and survive reload', async ({
  page,
}) => {
  const { profile, writes } = await fixture(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'lumen-prefs:4',
      JSON.stringify({
        theme: 'dark',
        rows: { hero: true },
        narratorChoice: true,
        hoverRequest: false,
      })
    );
  });
  await page.goto(appPath('/me'));
  await expect(page.getByRole('heading', { name: 'You' })).toBeVisible();
  const theme = page.getByRole('group', { name: 'Theme' });
  await expect(theme.getByRole('button', { name: 'Light' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(
    page.getByRole('switch', { name: /Popular right now/ })
  ).toHaveAttribute('aria-checked', 'false');
  const locked = page.getByRole('switch', { name: /Quick request on posters/ });
  await expect(locked).toHaveAttribute('aria-checked', 'true');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await locked.click({ force: true });
  expect(writes).toEqual([]);

  const narrator = page.getByRole('switch', {
    name: /Choose audiobook narrators/,
  });
  await expect(narrator).toHaveAttribute('aria-checked', 'false');
  await narrator.click();
  await expect(narrator).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => writes.length).toBe(1);
  await expect
    .poll(() => profile.lumenPreferences)
    .toMatchObject({
      theme: 'light',
      rows: { hero: false },
      narratorChoice: true,
    });

  await page.reload();
  await expect(
    page.getByRole('switch', { name: /Choose audiobook narrators/ })
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('switch', { name: /Quick request on posters/ })
  ).toHaveAttribute('aria-checked', 'true');
  expect(writes).toHaveLength(1);
});

test('failed preference writes remain visible and can be retried', async ({
  page,
}) => {
  const { profile, writes } = await fixture(page);
  let failWrite = true;
  await page.route('**/api/v1/user/4/settings/main', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    writes.push(body.lumenPreferences);
    if (failWrite) {
      failWrite = false;
      return route.fulfill({
        status: 503,
        json: { message: 'Preference store is temporarily unavailable.' },
      });
    }
    profile.lumenPreferences = body.lumenPreferences;
    return route.fulfill({ json: profile });
  });
  await page.goto(appPath('/me'));
  const narrator = page.getByRole('switch', {
    name: /Choose audiobook narrators/,
  });
  await expect(narrator).toHaveAttribute('aria-checked', 'false');
  await narrator.click();
  await expect(page.getByRole('alert')).toContainText(
    'Lumen preferences could not be synced to your account.'
  );
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() => profile.lumenPreferences)
    .toMatchObject({
      narratorChoice: true,
    });
  expect(writes).toHaveLength(2);
});

test('reset clears the account copy and its legacy browser copy', async ({
  page,
}) => {
  const { profile, writes } = await fixture(page);
  await page.goto(appPath('/me'));
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(
    page.getByRole('heading', { name: 'Reset to defaults?' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect.poll(() => profile.lumenPreferences).toBeNull();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lumen-prefs:4')))
    .toBeNull();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Dark', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
});
