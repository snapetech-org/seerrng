import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) =>
  `${mount}${path.startsWith('./') ? path.slice(1) : path}`;

test('password and Episode Queue bookmarks scroll to the selected section after loading', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const responses: Record<string, object> = {
      '/api/v1/auth/me': {
        id: 2,
        displayName: 'Viewer',
        permissions: 32,
        userType: 3,
      },
      '/api/v1/user/2/settings/main': { username: 'Viewer' },
      '/api/v1/user/2/settings/password': { hasPassword: true },
      '/api/v1/user/2/settings/tv-season-watch-gate': {
        status: 'off',
        globallyEnabled: false,
      },
      '/api/v1/user/2/settings/episode-queue': { defaultEpisodeCount: 2 },
    };
    return route.fulfill({ json: responses[pathname] ?? {} });
  });
  await page.addInitScript(() => {
    const scroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      this.setAttribute('data-bookmark-target', 'true');
      scroll.call(this, options);
    };
  });
  for (const [path, id] of [
    ['./me/account#password', 'password'],
    ['./me/account/tv-requests#episode-queue', 'episode-queue'],
    ['./me/account#advanced-theme', 'advanced-theme'],
  ]) {
    await page.goto(appPath(path));
    await expect(page.locator(`section#${id}`)).toHaveAttribute(
      'data-bookmark-target',
      'true'
    );
  }
  await page.goto(appPath('./me/account'));
  await expect(page.getByText('Jellyfin User', { exact: true })).toBeVisible();
  await expect(
    page.locator('dd').getByText('User', { exact: true })
  ).toBeVisible();
});

test('account settings preserve failed profile edits and save only changes and password fields', async ({
  page,
}) => {
  const profile = {
    username: 'Viewer',
    email: 'viewer@example.test',
    preferredLanguages: { all: 'en', movie: 'fr', tv: null, book: 'zz' },
  };
  const writes: unknown[] = [];
  let reject = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          displayName: profile.username,
          permissions: 32,
          userType: 2,
        },
      });
    if (path === '/languages')
      return route.fulfill({
        json: [
          { iso_639_1: 'en', english_name: 'English' },
          { iso_639_1: 'fr', english_name: 'French' },
        ],
      });
    if (path === '/user/2/settings/main') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push(body);
        if (reject) {
          reject = false;
          return route.fulfill({ status: 503, json: {} });
        }
        Object.assign(profile, body);
      }
      return route.fulfill({ json: profile });
    }
    if (path === '/user/2/settings/password') {
      if (request.method() === 'POST') {
        writes.push(request.postDataJSON());
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: { hasPassword: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('./me'));
  await page.getByRole('link', { name: 'Open Account Settings' }).click();
  const displayName = page.getByLabel('Display Name');
  await expect(displayName).toHaveValue('Viewer');
  await displayName.fill('Updated Viewer');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(
    page.getByText('Could not save the profile.', { exact: false })
  ).toBeVisible();
  await expect(displayName).toHaveValue('Updated Viewer');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Settings saved successfully!')).toBeVisible();
  expect(writes).toEqual([
    { username: 'Updated Viewer' },
    { username: 'Updated Viewer' },
  ]);
  const movieLanguage = page.getByLabel('Movie Language Override');
  const seriesLanguage = page.getByLabel('Series Language Override');
  await expect(movieLanguage).toHaveValue('fr');
  await expect(seriesLanguage).toHaveValue('');
  await expect(page.getByLabel('Book Language Override')).toHaveValue('zz');
  await movieLanguage.selectOption('inherit');
  await seriesLanguage.selectOption('fr');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(
    page.getByRole('button', { name: 'Save Changes' })
  ).toBeDisabled();
  expect(writes.at(-1)).toEqual({
    preferredLanguages: { all: 'en', tv: 'fr', book: 'zz' },
  });
  const savePassword = page.getByRole('button', { name: 'Save Password' });
  await page.getByLabel('Current Password').fill('synthetic-current');
  await page.getByLabel('New Password').fill('synthetic-new');
  await expect(savePassword).toBeDisabled();
  await page.getByLabel('Confirm Password').fill('synthetic-new');
  await savePassword.click();
  await expect(
    page.getByText('Password saved successfully!', { exact: false })
  ).toBeVisible();
  expect(writes.at(-1)).toEqual({
    currentPassword: 'synthetic-current',
    newPassword: 'synthetic-new',
  });
  await expect(page.getByLabel('New Password')).toHaveValue('');
});

test('display language persists and localizes the shell and account settings', async ({
  page,
}, testInfo) => {
  const profile = { username: 'Viewer', locale: null as string | null };
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          displayName: profile.username,
          permissions: 32,
          userType: 2,
        },
      });
    if (path === '/user/2/settings/main') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push(body);
        Object.assign(profile, body);
      }
      return route.fulfill({ json: profile });
    }
    if (path === '/languages') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('./me/account'));
  const language = page.getByRole('combobox', { name: 'Display Language' });
  await expect(language).toHaveValue('');
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  ) {
    await page.goto(appPath('./me'));
    await expect(page.getByRole('heading', { name: 'You' })).toBeVisible();
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/baseline-${testInfo.project.name}-english-you.png`,
      fullPage: false,
    });
    await page.goto(appPath('./me/account'));
  }
  await language.selectOption('fr');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(
    page.getByText('Les paramètres ont été enregistrés !')
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Découvrir' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Demandes' }).first()
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Paramètres utilisateur' })
  ).toBeVisible();
  await expect(page.getByLabel('Nom affiché')).toHaveValue('Viewer');
  await page.goto(appPath('./me'));
  await expect(page.getByRole('heading', { name: 'Vous' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Bibliothèque' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apparence' })).toBeVisible();
  await expect(
    page.getByRole('switch', { name: /Demande rapide depuis les affiches/ })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ouvrir Ma médiathèque' })
  ).toBeVisible();
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/candidate-${testInfo.project.name}-french-you.png`,
      fullPage: false,
    });
  await page.goto(appPath('./me/account'));
  await expect(page.getByLabel('Langue des métadonnées')).toBeVisible();
  await expect(page.getByText('Type de compte')).toBeVisible();
  await expect(page.getByText('Utilisateur local')).toBeVisible();
  await expect(page.getByText('Rôle', { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('Langue préférée pour tous les médias')
  ).toBeVisible();
  await expect(page.getByLabel('Préférence de langue des films')).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Abonnements aux services de streaming',
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Titres des cartes' })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Thème avancé' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Paramètres des demandes TV' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Retour à votre espace' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Préférences de thème avancées' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Modifier toutes les préférences' })
  ).toBeVisible();
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/candidate-${testInfo.project.name}-french-account.png`,
      fullPage: false,
    });
  await expect(
    page.getByRole('combobox', { name: "Langue d'affichage" })
  ).toHaveValue('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect(writes).toEqual([{ locale: 'fr' }]);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Découvrir' })).toBeVisible();
  await expect(page.getByLabel('Nom affiché')).toHaveValue('Viewer');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('combobox', { name: "Langue d'affichage" })
  ).toHaveValue('fr');

  await page
    .getByRole('combobox', { name: "Langue d'affichage" })
    .selectOption('ar');
  await page
    .getByRole('button', { name: 'Enregistrer les modifications' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('link', { name: 'اكتشف' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'الطلبات' }).first()
  ).toBeVisible();
  await expect(page.getByLabel('إسم العرض')).toHaveValue('Viewer');
  await page.goto(appPath('./me'));
  await expect(page.getByRole('heading', { name: 'أنت' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'المكتبة' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'المظهر', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('switch', { name: /طلب سريع من الملصقات/ })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'فتح مكتبتي الإعلامية' })
  ).toBeVisible();
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/candidate-${testInfo.project.name}-arabic-you.png`,
      fullPage: false,
    });
  await page.goto(appPath('./me/account'));
  await expect(page.getByText('مستخدم محلي')).toBeVisible();
  await expect(page.getByText('الدور', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'إعدادات طلبات التلفاز' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'العودة إلى صفحتك' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'تجاوزات المظهر المتقدمة' })
  ).toBeVisible();
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/candidate-${testInfo.project.name}-arabic-account.png`,
      fullPage: false,
    });
  await expect(
    page.getByLabel('اللغة المفضلة لجميع وسائط الإعلام')
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test('watchlist preferences honor account type and category permissions and persist false', async ({
  page,
}) => {
  const profile = { username: 'Viewer', watchlistSyncMusic: true };
  const writes: unknown[] = [];
  let rejectSave = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          id: 2,
          displayName: profile.username,
          permissions: 8606711808,
          userType: 2,
        },
      });
    if (path.endsWith('/user/2/settings/main')) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push(body);
        if (rejectSave)
          return route.fulfill({
            status: 503,
            json: { message: 'Profile service unavailable.' },
          });
        Object.assign(profile, body);
      }
      return route.fulfill({ json: profile });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('./me/account'));
  const music = page.getByRole('checkbox', { name: 'Auto-Request Music' });
  await expect(music).toBeChecked();
  await expect(page.getByLabel('Auto-Request Movies')).toHaveCount(0);
  await expect(page.getByLabel('Auto-Request Books')).toHaveCount(0);
  await music.uncheck();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(
    page.getByText(
      'Could not save the profile. Check the values and try again.'
    )
  ).toBeVisible();
  await expect(music).not.toBeChecked();
  rejectSave = false;
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Settings saved successfully!')).toBeVisible();
  expect(writes).toEqual([
    { watchlistSyncMusic: false },
    { watchlistSyncMusic: false },
  ]);
  await page.reload();
  await expect(music).toBeVisible();
  await expect(music).not.toBeChecked();
});

for (const scenario of [
  {
    name: 'member without watchlist permissions',
    permissions: 32,
    userType: 2,
    visible: [],
    emailDisabled: false,
  },
  {
    name: 'Plex member with movie sync permission',
    permissions: 16777216,
    userType: 1,
    visible: ['Auto-Request Movies'],
    emailDisabled: true,
  },
  {
    name: 'local member with music sync permission',
    permissions: 8589934592,
    userType: 2,
    visible: ['Auto-Request Music'],
    emailDisabled: false,
  },
  {
    name: 'local member with global auto-request permission',
    permissions: 8388608,
    userType: 2,
    visible: [
      'Auto-Request Music',
      'Auto-Request Books',
      'Auto-Request Comics',
      'Auto-Request Magazines',
    ],
    emailDisabled: false,
  },
  {
    name: 'local administrator',
    permissions: 2,
    userType: 2,
    visible: [
      'Auto-Request Music',
      'Auto-Request Books',
      'Auto-Request Comics',
      'Auto-Request Magazines',
    ],
    emailDisabled: false,
  },
  {
    name: 'Plex administrator',
    permissions: 2,
    userType: 1,
    visible: [
      'Auto-Request Movies',
      'Auto-Request Series',
      'Auto-Request Music',
      'Auto-Request Books',
      'Auto-Request Comics',
      'Auto-Request Magazines',
    ],
    emailDisabled: true,
  },
]) {
  test(`account preference controls match the ${scenario.name} role`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 2,
            displayName: 'Viewer',
            permissions: scenario.permissions,
            userType: scenario.userType,
          },
        });
      if (path === '/user/2/settings/main')
        return route.fulfill({ json: { username: 'Viewer' } });
      if (path === '/languages') return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });

    await page.goto(appPath('./me/account'));
    for (const label of [
      'Auto-Request Movies',
      'Auto-Request Series',
      'Auto-Request Music',
      'Auto-Request Books',
      'Auto-Request Comics',
      'Auto-Request Magazines',
    ]) {
      const control = page.getByRole('checkbox', { name: label });
      await expect(control).toHaveCount(
        scenario.visible.includes(label) ? 1 : 0
      );
    }
    if (scenario.emailDisabled)
      await expect(page.getByLabel('Email')).toBeDisabled();
    else await expect(page.getByLabel('Email')).toBeEnabled();
  });
}

test('account theme colors preserve stored overrides for other controls', async ({
  page,
}) => {
  const classicOnly = { '--theme-page-spotlight-strength': 0.5 };
  const overrides: Record<string, string | number> = { ...classicOnly };
  let fail = true;
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          permissions: 32,
          settings: { advancedThemeOverrides: overrides },
        },
      });
    if (path === '/user/2/settings/advanced-theme') {
      if (fail) {
        fail = false;
        return route.fulfill({
          status: 503,
          json: { message: 'Theme save unavailable.' },
        });
      }
      for (const [key, value] of Object.entries(
        request.postDataJSON().changes
      )) {
        if (typeof value === 'string' || typeof value === 'number')
          overrides[key] = value;
        else delete overrides[key];
      }
      if (overrides['--theme-page-bg'] === '#123')
        overrides['--theme-page-bg'] = '#112233';
      return route.fulfill({ json: { advancedThemeOverrides: overrides } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('./me/account'));
  const background = page.getByLabel('Page Background');
  const save = page.getByRole('button', { name: 'Save Theme Colors' });
  await background.fill('invalid');
  await expect(save).toBeDisabled();
  await background.fill('#123');
  await save.click();
  await expect(page.getByText('Theme save unavailable.')).toBeVisible();
  await expect(background).toHaveValue('#123');
  expect(overrides).toEqual(classicOnly);
  await save.click();
  await expect(page.getByText('Theme colors saved.')).toBeVisible();
  expect(overrides).toEqual({ ...classicOnly, '--theme-page-bg': '#112233' });
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--bg')
          .trim()
      )
    )
    .toBe('#112233');
  await page.reload();
  await expect(background).toHaveValue('#112233');
  if (await page.locator('.side').isVisible()) {
    const header = page.locator('.topbar');
    await expect(header).toHaveCSS(
      'background-color',
      'rgba(24, 27, 34, 0.72)'
    );
    const headerHeight = (await header.boundingBox())?.height;
    const scrolledColor = page.getByLabel('Scrolled Search Header');
    await scrolledColor.fill('#26354a');
    await save.click();
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(header).toHaveCSS('background-color', 'rgb(38, 53, 74)');
    await expect(header).toHaveCSS('backdrop-filter', 'none');
    expect((await header.boundingBox())?.height).toBe(headerHeight);
    await scrolledColor.fill('');
    await save.click();
    await expect(header).toHaveCSS('background-color', 'rgb(20, 23, 29)');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).toHaveCSS(
      'background-color',
      'rgba(24, 27, 34, 0.72)'
    );
    const sidebar = page.locator('.side');
    const width = (await sidebar.boundingBox())?.width;
    await expect(sidebar).toHaveCSS('background-image', 'none');
    await expect(sidebar).toHaveCSS('background-color', 'rgb(20, 23, 29)');
    await expect(sidebar).toHaveCSS('border-right-color', 'rgb(42, 48, 59)');
    await page.getByLabel('Sidebar Background Start').fill('#233446');
    await page.getByLabel('Sidebar Background End').fill('#0d1927');
    await page.getByLabel('Sidebar Border').fill('#506680');
    await page.getByLabel('Sidebar Hover Background').fill('#29354d');
    await save.click();
    await expect(sidebar).toHaveCSS(
      'background-image',
      'linear-gradient(rgb(35, 52, 70), rgb(13, 25, 39))'
    );
    await expect(sidebar).toHaveCSS('border-right-color', 'rgb(80, 102, 128)');
    expect((await sidebar.boundingBox())?.width).toBe(width);
    const navLink = sidebar.locator('a:not([aria-current])').first();
    await navLink.hover();
    await expect(navLink).toHaveCSS('background-color', 'rgb(41, 53, 77)');
    await page.getByLabel('Sidebar Background End').fill('');
    await save.click();
    await expect(sidebar).toHaveCSS(
      'background-image',
      'linear-gradient(rgb(35, 52, 70), rgb(20, 23, 29))'
    );
    for (const label of [
      'Sidebar Background Start',
      'Sidebar Background End',
      'Sidebar Border',
      'Sidebar Hover Background',
    ]) {
      await page.getByLabel(label).fill('');
    }
    await save.click();
    await expect(sidebar).toHaveCSS('border-right-color', 'rgb(42, 48, 59)');
    await expect(sidebar).toHaveCSS('background-image', 'none');
  } else {
    const tabs = page.getByRole('navigation', { name: 'Tabs' });
    await expect(tabs).toHaveCSS('background-image', 'none');
    const width = (await tabs.boundingBox())?.width;
    const color = page.getByLabel('Sidebar Background Start');
    const divider = page.getByLabel('Sidebar Border');
    await color.fill('#233446');
    await divider.fill('#506680');
    await save.click();
    await expect(tabs).toHaveCSS(
      'background-image',
      'linear-gradient(rgb(35, 52, 70), rgba(24, 27, 34, 0.72))'
    );
    await expect(tabs).toHaveCSS('border-top-color', 'rgb(80, 102, 128)');
    expect((await tabs.boundingBox())?.width).toBe(width);
    await color.fill('');
    await divider.fill('');
    await save.click();
    await expect(tabs).toHaveCSS('background-image', 'none');
  }
  await background.fill('');
  await save.click();
  await expect(page.getByText('Theme colors saved.')).toBeVisible();
  expect(overrides).toEqual(classicOnly);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--bg')
      )
    )
    .toBe('');
  await page.getByRole('button', { name: 'Edit All Overrides' }).click();
  const editor = page.getByLabel('Theme Override JSON');
  await expect(editor).toHaveValue(JSON.stringify(classicOnly, null, 2));
  await editor.fill('[]');
  await page.getByRole('button', { name: 'Edit Theme Colors' }).click();
  await expect(background).toBeVisible();
  await page.getByRole('button', { name: 'Edit All Overrides' }).click();
  await expect(editor).toHaveValue('[]');
  await page.getByRole('button', { name: 'Save overrides' }).click();
  await expect(
    page.getByText(
      'Enter a JSON object with string or numeric override values.'
    )
  ).toBeVisible();
  await editor.fill(
    JSON.stringify({ '--theme-page-spotlight-strength': 0.75 })
  );
  await page.getByRole('button', { name: 'Save overrides' }).click();
  await expect(
    page.getByText('Your theme overrides were saved.')
  ).toBeVisible();
  expect(overrides).toEqual({ '--theme-page-spotlight-strength': 0.75 });
});

test('account theme override controls follow the selected Lumen locale', async ({
  page,
}) => {
  let locale = 'fr';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const responses: Record<string, object> = {
      '/api/v1/auth/me': {
        id: 2,
        displayName: 'Viewer',
        permissions: 32,
        userType: 2,
        settings: { advancedThemeOverrides: {} },
      },
      '/api/v1/user/2/settings/main': { username: 'Viewer', locale },
      '/api/v1/user/2/settings/password': { hasPassword: true },
      '/api/v1/languages': [],
    };
    return route.fulfill({ json: responses[pathname] ?? {} });
  });

  await page.goto(appPath('./me/account#advanced-theme'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.locator('#advanced-theme').scrollIntoViewIfNeeded();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/theme-overrides-fr-${page.viewportSize()?.width}.png`,
    });
  for (const label of [
    'Arrière-plan de la page',
    'Surface',
    'Surface surélevée',
    'Bordure',
    'Arrière-plan des menus et des boîtes de dialogue',
    'Début du dégradé d’arrière-plan de la barre latérale',
    'Fin du dégradé d’arrière-plan de la barre latérale',
    'Bordure de la barre latérale',
    'Arrière-plan au survol de la barre latérale',
    'En-tête de recherche après défilement',
    'Texte principal',
    'Couleur d’accentuation',
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole('button', { name: 'Enregistrer les couleurs du thème' })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);

  locale = 'ar';
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('#advanced-theme').scrollIntoViewIfNeeded();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/theme-overrides-ar-${page.viewportSize()?.width}.png`,
    });
  for (const label of [
    'خلفية الصفحة',
    'السطح',
    'السطح المرتفع',
    'الحد',
    'خلفية القوائم ومربعات الحوار',
    'بداية تدرج خلفية الشريط الجانبي',
    'نهاية تدرج خلفية الشريط الجانبي',
    'حد الشريط الجانبي',
    'خلفية الشريط الجانبي عند التمرير',
    'ترويسة البحث بعد التمرير',
    'النص الأساسي',
    'لون التمييز',
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole('button', { name: 'حفظ ألوان المظهر' })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
});

test('password form uses the selected locale for its save action and failure', async ({
  page,
}) => {
  let locale = 'fr';
  let hasPassword = true;
  let passwordResponseStatus = 403;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === '/api/v1/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Viewer', permissions: 32, userType: 2 },
      });
    if (pathname === '/api/v1/user/2/settings/main')
      return route.fulfill({ json: { username: 'Viewer', locale } });
    if (pathname === '/api/v1/user/2/settings/password')
      return request.method() === 'POST'
        ? route.fulfill({ status: passwordResponseStatus, json: {} })
        : route.fulfill({ json: { hasPassword } });
    return route.fulfill({ json: {} });
  });

  async function submitInvalidCredentials() {
    const fields = page.locator('#password input[type="password"]');
    await fields.nth(0).fill('old-pass');
    await fields.nth(1).fill('new-password-123');
    await fields.nth(2).fill('new-password-123');
    const saveLabel =
      locale === 'fr'
        ? 'Enregistrer le mot de passe'
        : locale === 'ar'
          ? 'حفظ كلمة المرور'
          : 'Save Password';
    await page.getByRole('button', { name: saveLabel }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  }

  await page.goto(appPath('./me/account#password'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.locator('#password').scrollIntoViewIfNeeded();
  await submitInvalidCredentials();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/password-fr-${page.viewportSize()?.width}.png`,
    });
  await expect(
    page.getByRole('button', { name: 'Enregistrer le mot de passe' })
  ).toBeVisible();
  await expect(
    page.getByText(
      'Vérifiez votre mot de passe actuel et les autorisations de votre compte.'
    )
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);

  locale = 'ar';
  passwordResponseStatus = 503;
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('#password').scrollIntoViewIfNeeded();
  await submitInvalidCredentials();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/password-ar-${page.viewportSize()?.width}.png`,
    });
  await expect(
    page.getByRole('button', { name: 'حفظ كلمة المرور' })
  ).toBeVisible();
  await expect(
    page.getByText(
      'تعذر تأكيد تغيير كلمة المرور. تحقق من بيانات اعتمادك قبل إعادة المحاولة.'
    )
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);

  locale = 'fr';
  hasPassword = false;
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.locator('#password').scrollIntoViewIfNeeded();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/password-no-local-fr-${page.viewportSize()?.width}.png`,
    });
  await expect(
    page.getByText('Ce compte ne possède pas de mot de passe local.')
  ).toBeVisible();
  await expect(page.locator('#password input[type="password"]')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Enregistrer le mot de passe' })
  ).toBeVisible();
});

test('account permission names follow the selected Lumen locale', async ({
  page,
}) => {
  let locale = 'fr';
  const permissions = 4 + 16 + 32 + 64 + 2199023255552;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const responses: Record<string, object> = {
      '/api/v1/auth/me': {
        id: 2,
        displayName: 'Viewer',
        permissions,
        userType: 2,
      },
      '/api/v1/user/2/settings/main': { username: 'Viewer', locale },
      '/api/v1/user/2/settings/password': { hasPassword: true },
    };
    return route.fulfill({ json: responses[pathname] ?? {} });
  });

  await page.goto(appPath('./me/account#account-permissions'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.locator('#account-permissions').scrollIntoViewIfNeeded();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/account-permissions-fr-${page.viewportSize()?.width}.png`,
    });
  for (const label of [
    'Gérer les paramètres',
    'Gérer les demandes',
    'Demander',
    'Voter',
    'Demander des magazines',
  ]) {
    await expect(
      page.locator('#account-permissions').getByText(label, { exact: true })
    ).toBeVisible();
  }
  expect(
    await page.locator('body').evaluate((body) => {
      const root = document.documentElement;
      return Math.max(body.scrollWidth, root.scrollWidth) <= root.clientWidth;
    })
  ).toBe(true);

  locale = 'ar';
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('#account-permissions').scrollIntoViewIfNeeded();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/account-permissions-ar-${page.viewportSize()?.width}.png`,
    });
  for (const label of [
    'إدارة الإعدادات',
    'إدارة الطلبات',
    'طلب',
    'التصويت',
    'طلب المجلات',
  ]) {
    await expect(
      page.locator('#account-permissions').getByText(label, { exact: true })
    ).toBeVisible();
  }
  expect(
    await page.locator('body').evaluate((body) => {
      const root = document.documentElement;
      return Math.max(body.scrollWidth, root.scrollWidth) <= root.clientWidth;
    })
  ).toBe(true);
});
