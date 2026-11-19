import { expect, test, type Page } from '@playwright/test';

const active = {
  id: 17,
  kind: 'airing',
  status: 'pending',
  title: 'Fixture Airing',
  channelName: 'Fixture Channel',
  startsAt: '2026-11-18T20:00:00Z',
  completedCount: 0,
  failedCount: 0,
  requestedBy: { id: 1, displayName: 'Viewer' },
};

async function fixture(
  page: Page,
  permissions: number,
  configured = true,
  locale = 'en'
) {
  let status = active.status;
  const writes: string[] = [];
  const reads: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/live-tv/status')
      return route.fulfill({
        json: { configured, canRequest: true, guideReady: configured },
      });
    if (path === '/live-tv/sports/teams')
      return route.fulfill({
        json: {
          configured: true,
          enabled: true,
          teams: [{ dataset: 'nfl', team: 'Buffalo Bills', league: 'NFL' }],
        },
      });
    if (path === '/live-tv/sports/follows')
      return route.fulfill({ json: { results: [] } });
    if (path === '/live-tv/recordings') {
      reads.push(url.searchParams.get('scope') ?? '');
      const all = url.searchParams.get('filter') === 'all';
      return route.fulfill({
        json: {
          results: all || status !== 'cancelled' ? [{ ...active, status }] : [],
          pageInfo: { total: 1 },
        },
      });
    }
    if (
      path === '/live-tv/recordings/17/approve' ||
      path === '/live-tv/recordings/17'
    ) {
      writes.push(request.method() + ' ' + path);
      status = path.endsWith('/approve') ? 'scheduled' : 'cancelled';
      return route.fulfill({ json: { ...active, status } });
    }
    return route.fulfill({ json: {} });
  });
  return { writes, reads };
}

for (const {
  locale,
  label,
  teamsHeading,
  teamLabel,
  chooseTeam,
  direction,
} of [
  {
    locale: 'en',
    label: 'Recordings',
    teamsHeading: 'Followed Teams',
    teamLabel: 'Team',
    chooseTeam: 'Choose a team',
    direction: 'ltr',
  },
  {
    locale: 'fr',
    label: 'Enregistrements',
    teamsHeading: 'Équipes suivies',
    teamLabel: 'Équipe',
    chooseTeam: 'Choisir une équipe',
    direction: 'ltr',
  },
  {
    locale: 'ar',
    label: 'التسجيلات',
    teamsHeading: 'الفرق التي تتابعها',
    teamLabel: 'الفريق',
    chooseTeam: 'اختر الفريق',
    direction: 'rtl',
  },
]) {
  test(`the Recordings page uses the saved ${locale} locale`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop');
    await fixture(page, 2, true, locale);
    await page.goto('/recordings');
    await expect(page.getByText('Fixture Airing')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: label, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: teamsHeading, exact: true })
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: teamLabel })).toContainText(
      chooseTeam
    );
    await expect(
      page.getByText(
        locale === 'en'
          ? 'Pending Approval'
          : locale === 'fr'
            ? 'En attente d’approbation'
            : 'انتظار الموافقة',
        { exact: true }
      )
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
        name: label,
        exact: true,
      })
    ).toHaveAttribute('href', '/recordings');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({
      path: info.outputPath(`recordings-page-${locale}.png`),
      fullPage: true,
    });
  });
}

test('recording managers can review all users and approve an airing', async ({
  page,
}, info) => {
  const { writes, reads } = await fixture(page, 2);
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Recordings' }).click();
  await expect(page.getByText('Fixture Airing')).toBeVisible();
  await page.getByRole('combobox', { name: 'Scope' }).selectOption('all');
  await expect(page.getByText('Requested by Viewer')).toBeVisible();
  expect(reads).toContain('all');
  await page.screenshot({
    path: info.outputPath('recordings.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Approve', exact: true })
    .click();
  await expect(page.getByText('Scheduled', { exact: true })).toBeVisible();
  expect(writes).toEqual(['POST /live-tv/recordings/17/approve']);
});

test('a member can cancel their own request and see it in history', async ({
  page,
}) => {
  const { writes, reads } = await fixture(page, 32);
  await page.goto('/recordings');
  await expect(page.getByText('Fixture Airing')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Scope' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Approve', exact: true })
  ).toHaveCount(0);
  const cancel = page.getByRole('button', { name: 'Cancel Recording' });
  await cancel.click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Keep Recording' })
    .click();
  expect(writes).toEqual([]);
  await cancel.click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel Recording' })
    .click();
  await expect(page.getByText('No recordings match this view.')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Status Filter' })
    .selectOption('all');
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  expect(writes).toEqual(['DELETE /live-tv/recordings/17']);
  expect([...new Set(reads)]).toEqual(['mine']);
});

test('unconfigured recordings show a setup state without fetching the list', async ({
  page,
}) => {
  const { reads } = await fixture(page, 32, false);
  await page.goto('/recordings');
  await expect(
    page.getByText(
      'Live TV recording is not set up. An administrator can connect IPTV Tunerr in Settings → Services.'
    )
  ).toBeVisible();
  expect(reads).toEqual([]);
});
