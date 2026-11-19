import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function installBrowserPush(
  page: Page,
  permission: 'granted' | 'denied'
) {
  await page.addInitScript(
    ({ permission }) => {
      const registrations: {
        scope: string;
        active: { scriptURL: string; state: string };
        pushManager: {
          getSubscription: () => Promise<unknown>;
          subscribe: () => Promise<unknown>;
        };
      }[] = [];
      const subscription = {
        endpoint: 'https://push.example/subscription/one',
        toJSON: () => ({
          endpoint: 'https://push.example/subscription/one',
          keys: { auth: 'auth-key', p256dh: 'public-key' },
        }),
        unsubscribe: async () => true,
      };
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: { requestPermission: async () => permission },
      });
      Object.defineProperty(window, 'PushManager', {
        configurable: true,
        value: function PushManager() {},
      });
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistrations: async () => registrations,
          register: async (script: string, options: { scope: string }) => {
            let registration = registrations.find(
              (item) =>
                item.scope === new URL(options.scope, location.href).href
            );
            if (!registration) {
              registration = {
                scope: new URL(options.scope, location.href).href,
                active: {
                  scriptURL: new URL(script, location.href).href,
                  state: 'activated',
                },
                pushManager: {
                  getSubscription: async () =>
                    registration?.active.scriptURL.endsWith(
                      '/push-worker/notifications.js'
                    )
                      ? subscription
                      : null,
                  subscribe: async () => subscription,
                },
              };
              registrations.push(registration);
            }
            return registration;
          },
        },
      });
    },
    { permission }
  );
}

for (const permission of ['granted', 'denied'] as const) {
  test(`browser push registration handles ${permission} permission`, async ({
    page,
  }) => {
    const writes: unknown[] = [];
    let devices: {
      endpoint: string;
      userAgent: string;
      createdAt: string;
    }[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(
        /^\/lumen(?=\/)/,
        ''
      );
      if (path === '/api/v1/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Reader', permissions: 32 },
        });
      if (path === '/api/v1/settings/public')
        return route.fulfill({
          json: {
            enablePushRegistration: true,
            vapidPublic: 'fixture-vapid-key',
          },
        });
      if (path === '/api/v1/user/1/settings/notifications')
        return route.fulfill({
          json: {
            webPushEnabled: true,
            notificationTypes: { webpush: 0 },
          },
        });
      if (path === '/api/v1/user/1/pushSubscriptions')
        return route.fulfill({ json: devices });
      if (
        path === '/api/v1/user/registerPushSubscription' &&
        request.method() === 'POST'
      ) {
        const body = request.postDataJSON();
        writes.push(body);
        devices = [
          {
            endpoint: body.endpoint,
            userAgent: body.userAgent,
            createdAt: '2026-11-19T00:00:00.000Z',
          },
        ];
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: {} });
    });
    await installBrowserPush(page, permission);

    await page.goto(appPath('/me/account/notifications'));
    await expect(
      page.getByRole('heading', { name: 'Registered Browser Devices' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Register This Browser' }).click();

    if (permission === 'denied') {
      await expect(page.getByRole('alert')).toHaveText(
        'Allow notifications in your browser to register this device.'
      );
      expect(writes).toHaveLength(0);
      expect(devices).toHaveLength(0);
      return;
    }

    await expect(page.locator('p[role="status"]')).toHaveText(
      'This browser is registered.'
    );
    await expect(
      page.getByRole('button', { name: 'Disable This Browser' })
    ).toBeVisible();
    expect(writes).toEqual([
      {
        endpoint: 'https://push.example/subscription/one',
        auth: 'auth-key',
        p256dh: 'public-key',
        userAgent: expect.any(String),
      },
    ]);
    expect(devices).toHaveLength(1);
    expect(
      await page.evaluate(() =>
        navigator.serviceWorker.getRegistrations().then((items) =>
          items.map(({ scope, active }) => ({
            scope: new URL(scope).pathname,
            script: new URL(active?.scriptURL ?? '').pathname,
          }))
        )
      )
    ).toContainEqual({
      scope: `${mount}/push-worker/1/`,
      script: `${mount}/push-worker/notifications.js`,
    });
  });
}
