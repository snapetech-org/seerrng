import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function captureSettings(page: Page, info: TestInfo, locale: string) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/tv-request-settings-${locale}-${info.project.name}.png`,
    fullPage: true,
  });
}

test('TV request settings localize the policy and keep viewer controls read-only', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Viewer', permissions: 0, userType: 2 },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({ json: { locale: 'fr' } });
    if (path === '/user/2/settings/tv-season-watch-gate')
      return route.fulfill({ json: { status: 'off', globallyEnabled: false } });
    if (path === '/user/2/settings/episode-queue')
      return route.fulfill({ json: { defaultEpisodeCount: 2 } });
    return route.fulfill({ json: {} });
  });

  await page.goto('/me/account/tv-requests');
  await expect(
    page.getByRole('heading', { name: 'Paramètres des demandes TV' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Exigence de visionnage de la saison précédente',
    })
  ).toBeVisible();
  await expect(page.getByText('Approbation requise')).toBeVisible();
  await expect(
    page.getByRole('button', { name: "Demander l'approbation" })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'File d’attente des épisodes' })
  ).toBeVisible();
  await expect(page.getByText('2 épisodes à venir')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save default' })).toHaveCount(
    0
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await captureSettings(page, info, 'fr');
});

test('Arabic TV request settings use RTL and native Arabic plural forms', async ({
  page,
}, info) => {
  let locale = 'en';
  let episodeCount = 2;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Viewer', permissions: 0, userType: 2 },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/user/2/settings/tv-season-watch-gate')
      return route.fulfill({ json: { status: 'off', globallyEnabled: false } });
    if (path === '/user/2/settings/episode-queue')
      return route.fulfill({ json: { defaultEpisodeCount: episodeCount } });
    return route.fulfill({ json: {} });
  });

  await page.goto('/me/account/tv-requests');
  await expect(page.getByText('2 episodes ahead')).toBeVisible();
  await captureSettings(page, info, 'ar-en-baseline');

  locale = 'ar';
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'إعدادات طلبات التلفاز', exact: true })
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('يتطلب موافقة', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'طلب الموافقة' })
  ).toBeVisible();
  await expect(
    page.getByText('الحلقتان القادمتان', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'حفظ الافتراضي' })).toHaveCount(
    0
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await captureSettings(page, info, 'ar-candidate');

  episodeCount = 3;
  await page.reload();
  await expect(page.getByText('3 حلقات قادمة', { exact: true })).toBeVisible();
  episodeCount = 1;
  await page.reload();
  await expect(page.getByText('حلقة قادمة: 1', { exact: true })).toBeVisible();
});

test('user managers can review access and save the account Episode Queue default', async ({
  page,
}, info) => {
  let episodeCount = 2;
  let rejectNextSave = true;
  const posts: { path: string; body: unknown }[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Manager', permissions: 8, userType: 2 },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/user/2/settings/tv-season-watch-gate')
      return route.fulfill({ json: { status: 'off', globallyEnabled: false } });
    if (path === '/user/2/settings/episode-queue') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        posts.push({ path, body });
        if (rejectNextSave) {
          rejectNextSave = false;
          return route.fulfill({ status: 503, json: {} });
        }
        episodeCount = body.defaultEpisodeCount;
      }
      return route.fulfill({ json: { defaultEpisodeCount: episodeCount } });
    }
    if (path === '/user/tv-season-watch-gate-requests')
      return route.fulfill({
        json: [{ id: 9, displayName: 'Member', requestedAt: null }],
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/me/account/tv-requests');
  await expect(
    page.getByRole('heading', { name: 'Previous-season watch requests' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  const episodes = page.getByRole('combobox', {
    name: 'Episodes to keep requested',
  });
  await captureSettings(page, info, 'en-manager');
  await episodes.selectOption('4');
  await page.getByRole('button', { name: 'Save default' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save default' })
    .click();
  await expect(
    page.getByText(
      'Could not update this user’s Episode Queue default. Try again.'
    )
  ).toBeVisible();
  await expect(episodes).toHaveValue('4');
  await page.getByRole('button', { name: 'Save default' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save default' })
    .click();
  await expect(page.getByText('Episode Queue default saved.')).toBeVisible();
  await expect(episodes).toHaveValue('4');
  expect(posts).toEqual([
    {
      path: '/user/2/settings/episode-queue',
      body: { defaultEpisodeCount: 4 },
    },
    {
      path: '/user/2/settings/episode-queue',
      body: { defaultEpisodeCount: 4 },
    },
  ]);
});

test('TV request account controls follow the viewer permission matrix', async ({
  page,
}) => {
  const roles = [
    {
      name: 'Viewer',
      permissions: 0,
      review: false,
      manageQueue: false,
      bypass: false,
    },
    {
      name: 'User manager',
      permissions: 8,
      review: true,
      manageQueue: true,
      bypass: false,
    },
    {
      name: 'Request manager',
      permissions: 16,
      review: false,
      manageQueue: false,
      bypass: true,
    },
    {
      name: 'Administrator',
      permissions: 2,
      review: true,
      manageQueue: true,
      bypass: true,
    },
  ];
  const reviewRequests: string[] = [];
  let currentRole = roles[0];

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          displayName: currentRole.name,
          permissions: currentRole.permissions,
          userType: 2,
        },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/user/2/settings/tv-season-watch-gate')
      return route.fulfill({ json: { status: 'off', globallyEnabled: false } });
    if (path === '/user/2/settings/episode-queue')
      return route.fulfill({ json: { defaultEpisodeCount: 2 } });
    if (path === '/user/tv-season-watch-gate-requests') {
      reviewRequests.push(currentRole.name);
      return route.fulfill({
        json: [{ id: 9, displayName: 'Member', requestedAt: null }],
      });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/me/account/tv-requests');
  for (const role of roles) {
    currentRole = role;
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'TV Request Settings' })
    ).toBeVisible();

    const approvalButton = page.getByRole('button', {
      name: 'Request Approval',
    });
    const bypassStatus = page.getByText('You can override this rule');
    if (role.bypass) {
      await expect(bypassStatus).toBeVisible();
      await expect(approvalButton).toHaveCount(0);
    } else {
      await expect(approvalButton).toBeVisible();
      await expect(bypassStatus).toHaveCount(0);
    }

    const reviewHeading = page.getByRole('heading', {
      name: 'Previous-season watch requests',
    });
    if (role.review) {
      await expect(reviewHeading).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    } else {
      await expect(reviewHeading).toHaveCount(0);
    }

    const queueSelect = page.getByRole('combobox', {
      name: 'Episodes to keep requested',
    });
    if (role.manageQueue) {
      await expect(queueSelect).toBeVisible();
      await expect(queueSelect).toHaveValue('2');
      await expect(
        page.getByRole('button', { name: 'Save default' })
      ).toBeVisible();
    } else {
      await expect(page.getByText('2 episodes ahead')).toBeVisible();
      await expect(queueSelect).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Save default' })
      ).toHaveCount(0);
    }
  }

  expect(reviewRequests).toEqual(['User manager', 'Administrator']);
});
