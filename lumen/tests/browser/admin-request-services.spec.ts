import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function mockAdmin(page: Page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith('/auth/me')
        ? { id: 1, displayName: 'Administrator', permissions: 2 }
        : path.endsWith('/user/1/settings/main')
          ? { locale: 'en', lumenPreferences: {} }
          : path.endsWith('/settings/public')
            ? { applicationTitle: 'SeerrNG', mediaServerType: 1 }
            : {},
    });
  });
}

test('Soulseek tests draft credentials then confirms a saved connection', async ({
  page,
}) => {
  const endpoint = '/api/v1/settings/slskdn';
  const secret = 'fixture-read-write-key';
  const initial = {
    enabled: false,
    hostname: '',
    port: 5030,
    useSsl: false,
    baseUrl: '',
    searchFilter: '',
    apiKey: '',
    apiKeyConfigured: false,
  };
  let saved = initial;
  let postBody: Record<string, unknown> | undefined;
  let putBody: Record<string, unknown> | undefined;
  await mockAdmin(page);
  await page.route('**/api/v1/settings/slskdn**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === endpoint && request.method() === 'GET')
      return route.fulfill({ json: saved });
    const body = request.postDataJSON() as Record<string, unknown>;
    if (path === `${endpoint}/test`) {
      postBody = body;
      return route.fulfill({
        json: {
          success: true,
          version: '0.20.0',
          features: { wishlist: true, libraryHealth: false, songId: false },
        },
      });
    }
    if (path === endpoint && request.method() === 'PUT') {
      putBody = body;
      saved = {
        ...saved,
        ...body,
        apiKey: '••••••••',
        apiKeyConfigured: true,
      } as typeof initial;
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });

  await page.goto(appPath('/admin/soulseek'));
  await page.getByLabel('Enable Soulseek Requests').check();
  await page.getByLabel('Hostname or IP Address').fill('slskd');
  await page.getByLabel('API Key', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Connected to slskdN 0.20.0.')).toBeVisible();
  expect(putBody).toBeUndefined();
  expect(postBody).toMatchObject({
    enabled: true,
    hostname: 'slskd',
    apiKey: secret,
  });

  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Soulseek settings saved.')).toBeVisible();
  expect(putBody).toMatchObject({
    enabled: true,
    hostname: 'slskd',
    apiKey: secret,
  });
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('API Key', { exact: true })).toHaveAttribute(
    'placeholder',
    'Saved key'
  );
  expect(JSON.stringify(saved)).not.toContain(secret);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('ReadMeABook approval retries readback without repeating the provider action', async ({
  page,
}) => {
  const queuePath = '/api/v1/readmeabook/admin/requests';
  const settings = {
    enabled: true,
    hostname: 'readmeabook',
    port: 8080,
    useSsl: false,
    baseUrl: '',
    apiKey: '••••••••',
    apiKeyConfigured: true,
  };
  const approval = {
    id: 42,
    title: 'The Sample Audiobook',
    author: 'A. Writer',
    status: 'awaiting_approval',
    user: { username: 'reader' },
  };
  let approvalApplied = false;
  let staleReadbackUsed = false;
  let approvalPosts = 0;
  let queueReads = 0;
  await mockAdmin(page);
  await page.route('**/api/v1/settings/readmeabook**', (route) =>
    route.fulfill({ json: settings })
  );
  await page.route('**/api/v1/readmeabook/admin/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === queuePath && request.method() === 'GET') {
      queueReads++;
      if (!approvalApplied || !staleReadbackUsed) {
        if (approvalApplied) staleReadbackUsed = true;
        return route.fulfill({ json: [approval] });
      }
      return route.fulfill({ json: [] });
    }
    if (path === `${queuePath}/42/approve` && request.method() === 'POST') {
      approvalPosts++;
      approvalApplied = true;
      return route.fulfill({ json: { ...approval, status: 'pending' } });
    }
    if (path.endsWith('/dashboard')) return route.fulfill({ json: {} });
    return route.fulfill({ status: 404, json: { message: 'Not found' } });
  });

  await page.goto(appPath('/admin/readmeabook'));
  await expect(
    page.getByText('The Sample Audiobook', { exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Approve The Sample Audiobook' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not confirm this audiobook request update.'
  );
  await page
    .getByRole('button', { name: 'Check status for The Sample Audiobook' })
    .click();
  await expect(
    page.getByText('The Sample Audiobook', { exact: true })
  ).toHaveCount(0);
  expect(approvalPosts).toBe(1);
  expect(queueReads).toBe(4);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
