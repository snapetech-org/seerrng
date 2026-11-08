import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const cases = [
  {
    route: 'main',
    endpoint: 'main',
    field: 'applicationTitle',
    value: 'QA saved title',
  },
  { route: 'users', endpoint: 'main', field: 'movieQuotaLimit', value: '17' },
  {
    route: 'network',
    endpoint: 'network',
    field: 'apiRequestTimeout',
    value: '123',
  },
  {
    route: 'categories',
    endpoint: 'main',
    field: 'ageGate.defaultRestricted',
    value: undefined,
  },
  {
    route: 'metadata',
    endpoint: 'metadatas/music',
    field: 'caa-max-concurrent-requests',
    value: '3',
  },
  ...[
    'email',
    'discord',
    'telegram',
    'gotify',
    'ntfy',
    'pushover',
    'slack',
    'webpush',
  ].map((agent) => ({
    route: `notifications/${agent}`,
    endpoint: `notifications/${agent}`,
    field: 'embedPoster',
    value: undefined,
  })),
  {
    route: 'notifications/apprise',
    endpoint: 'notifications/apprise',
    field: 'url',
    value: 'http://127.0.0.1:55199',
  },
  {
    route: 'notifications/pushbullet',
    endpoint: 'notifications/pushbullet',
    field: 'channelTag',
    value: 'isolated-qa',
  },
  {
    route: 'notifications/webhook',
    endpoint: 'notifications/webhook',
    field: 'supportVariables',
    value: undefined,
  },
];
for (const theme of ['seerrOrig', 'seerrNGJ']) {
  for (const width of [390, 1440])
    for (const scenario of cases) {
      test(`settings failure, retry, repeat save and reload ${theme} ${width} ${scenario.route}`, async ({
        page,
      }, info) => {
        await page.setViewportSize({
          width,
          height: 900,
        });
        expect(
          (
            await page.request.post('/api/v1/auth/local', {
              data: { email: 'admin@seerr.dev', password: 'test1234' },
            })
          ).status()
        ).toBe(200);
        expect(
          (
            await page.request.post('/api/v1/user/1/settings/interface-theme', {
              data: { theme },
            })
          ).status()
        ).toBe(200);
        const endpoint = `/api/v1/settings/${scenario.endpoint}`;
        let writes = 0;
        await page.route(`**${endpoint}`, async (route) => {
          if (!['POST', 'PUT'].includes(route.request().method()))
            return route.continue();
          writes++;
          if (writes === 1)
            return route.fulfill({
              status: 503,
              json: { message: 'Isolated save failure' },
            });
          return route.continue();
        });
        await page.goto(`/settings/${scenario.route}`);
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        const field = page.locator(`[id="${scenario.field}"]`);
        await expect(field).toBeVisible();
        const toggle = (await field.getAttribute('aria-pressed')) !== null;
        const checkbox = (await field.getAttribute('type')) === 'checkbox';
        const select = await field.evaluate((el) => el.tagName === 'SELECT');
        const original = toggle
          ? (await field.getAttribute('aria-pressed'))!
          : checkbox
            ? String(await field.isChecked())
            : await field.inputValue();
        const replacement =
          toggle || checkbox
            ? String(original !== 'true')
            : scenario.value === original
              ? '4'
              : scenario.value!;
        const edit = async (value: string) => {
          if (toggle) {
            if ((await field.getAttribute('aria-pressed')) !== value)
              await field.click();
          } else if (checkbox) await field.setChecked(value === 'true');
          else if (select) await field.selectOption(value);
          else await field.fill(value);
        };
        const assertValue = async (value: string) =>
          toggle
            ? expect(field).toHaveAttribute('aria-pressed', value)
            : checkbox
              ? expect(field).toBeChecked({ checked: value === 'true' })
              : expect(field).toHaveValue(value);
        await edit(replacement);
        const save = page.getByTestId('settings-save-button');
        await expect(save).toBeEnabled();
        await save.click();
        await expect.poll(() => writes).toBe(1);
        await assertValue(replacement);
        await expect(save).toBeEnabled();
        await page.screenshot({
          path: info.outputPath('failed-save-draft.png'),
          fullPage: true,
        });
        const retry = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === endpoint &&
            ['POST', 'PUT'].includes(r.request().method())
        );
        await save.click();
        expect((await retry).status()).toBe(200);
        await expect(save).toBeDisabled();
        await page.reload();
        await assertValue(replacement);
        await edit(original);
        await expect(save).toBeEnabled();
        const restore = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === endpoint &&
            ['POST', 'PUT'].includes(r.request().method())
        );
        await save.click();
        expect((await restore).status()).toBe(200);
        await expect(save).toBeDisabled();
        await page.reload();
        await assertValue(original);
        await page.screenshot({
          path: info.outputPath('saved-restored.png'),
          fullPage: true,
        });
        expect(writes).toBe(3);
        await page.unrouteAll({ behavior: 'wait' });
      });
    }
}
