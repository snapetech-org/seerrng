import { expect, test, type Page } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

async function session(
  page: Page,
  permissions: unknown,
  configured?: string,
  warnings?: string[]
) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { seerrPublicUrl: configured } })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    const json =
      path === '/auth/me'
        ? {
            id: 1,
            displayName: 'Household',
            permissions,
            ...(warnings ? { warnings } : {}),
          }
        : path === '/settings/public'
          ? {
              mediaServerType: 1,
              enabledMediaCategories: {
                music: true,
                comic: true,
                magazine: true,
                game: true,
                sports: true,
                adult: true,
              },
            }
          : path === '/lumen/configuration'
            ? { seerrPublicUrl: configured }
            : path.includes('genreslider')
              ? []
              : { results: [], page: 1, totalPages: 1, totalResults: 0 };
    return route.fulfill({ json });
  });
}

test('Coming soon is reachable from You on every screen size', async ({
  page,
}) => {
  await session(page, 32);
  await page.goto(testAppPath('/me'));
  const link = page.getByRole('link', {
    name: 'Open Coming soon',
    exact: true,
  });
  await expect(link).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await link.click();
  await expect(page).toHaveURL(/\/soon$/);
  await expect(
    page.getByRole('heading', { name: 'Coming soon', exact: true })
  ).toBeVisible();
});

test('administration is visible in navigation and at the start of You', async ({
  page,
}, info) => {
  await session(page, 2);
  await page.goto(testAppPath('/me'));
  await expect(
    page.getByRole('heading', { name: 'Administration', exact: true })
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('you.png') });
  await page.goto(testAppPath('/'));
  const nav = page.getByRole('navigation', {
    name: 'Main navigation',
    exact: true,
  });
  const desktop = (page.viewportSize()?.width ?? 0) >= 1040;
  await page.screenshot({ path: info.outputPath('discover.png') });
  if (desktop) {
    await expect(
      nav.getByRole('link', { name: 'Lumen Settings', exact: true })
    ).toBeVisible();
    await nav
      .getByRole('link', { name: 'SeerrNG Administration', exact: true })
      .click();
  } else {
    await page
      .getByRole('navigation', { name: 'Tabs', exact: true })
      .getByRole('link', { name: 'Profile', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Administration', exact: true })
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Open SeerrNG Administration', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole('heading', { name: 'Administration', level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open System Caches' })
  ).toHaveAttribute('href', testAppPath('/admin/caches'));
  await page.screenshot({ path: info.outputPath('administration.png') });
  await page
    .getByRole('link', { name: 'Open Lumen Settings', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Lumen settings for everyone',
      exact: true,
    })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('administration directory exposes every settings destination once', async ({
  page,
}) => {
  await session(page, 2);
  await page.goto(testAppPath('/admin'));
  const directory = page.locator('.admin-groups');
  const links = directory.locator('a.go');
  await expect(links).toHaveCount(42);
  const destinations = await links.evaluateAll((items) =>
    items.map((item) => (item as HTMLAnchorElement).getAttribute('href'))
  );
  expect(destinations).not.toContain(null);
  expect(new Set(destinations).size).toBe(42);
  await expect(directory.locator('section')).toHaveCount(9);
});

for (const locale of [
  {
    tag: 'fr',
    administration: 'Administration',
    settings: 'Paramètres généraux',
    permissionsSearch: 'autorisations',
    permissionsLink: 'Ouvrir Autorisations par défaut des utilisateurs',
    categorySearch: 'catégories utilisateur par défaut',
    categoryLink: 'Ouvrir Catégories utilisateur par défaut',
    open: 'Ouvrir Paramètres généraux',
    search: 'Rechercher des paramètres',
    all: 'Tous les paramètres et outils',
    group: 'Télévision et films',
    groupHeading: 'Télévision et films',
    homeGroups: [
      'Général',
      'Demandes et découverte',
      'Serveurs multimédias et liseuses',
      'Indexeurs et téléchargements',
      'Télévision et films',
      'Livres, livres audio et bandes dessinées',
      'Musique',
      'Logiciels et jeux',
      'Système',
    ],
    homeSearch: 'Rechercher des films, séries, livres et mangas…',
    back: 'Retour',
    profile: 'Profil',
    missingHeading: 'Page introuvable',
    missingPage: 'Cette page n’existe pas dans Lumen.',
    backToDiscover: 'Retour à Découvrir',
    fullSeerr: 'ouvrir SeerrNG en entier',
    serverWarning:
      'Déconnectez-vous depuis Vous, puis reconnectez-vous avec votre compte Jellyfin ou Emby pour rétablir la disponibilité et la lecture de votre bibliothèque.',
    openYou: 'Ouvrir Vous',
    aurralServices: 'Services Aurral',
  },
  {
    tag: 'ar',
    administration: 'الإدارة',
    settings: 'إعدادات الشبكة',
    permissionsSearch: 'أذونات',
    permissionsLink: 'فتح أذونات المستخدمين الافتراضية',
    categorySearch: 'الفئات الافتراضية للمستخدمين',
    categoryLink: 'فتح الفئات الافتراضية للمستخدمين',
    open: 'فتح إعدادات الشبكة',
    search: 'البحث في الإعدادات',
    all: 'كل الإعدادات والأدوات',
    group: 'التلفزيون والأفلام',
    groupHeading: 'التلفزيون والأفلام',
    homeGroups: [
      'عام',
      'الطلبات والاستكشاف',
      'خوادم الوسائط وأجهزة القراءة',
      'الفهارس والتنزيلات',
      'التلفزيون والأفلام',
      'الكتب والكتب الصوتية والقصص المصورة',
      'الموسيقى',
      'البرامج والألعاب',
      'النظام',
    ],
    homeSearch: 'ابحث عن الأفلام والمسلسلات والكتب والمانغا…',
    back: 'عودة',
    profile: 'ملف التعريف',
    missingHeading: 'الصفحة غير موجودة',
    missingPage: 'هذه الصفحة غير موجودة في Lumen.',
    backToDiscover: 'العودة إلى الاستكشاف',
    fullSeerr: 'فتح واجهة SeerrNG كاملة',
    serverWarning:
      'سجّل الخروج من صفحة «أنت»، ثم سجّل الدخول مجددًا باستخدام حساب Jellyfin أو Emby لاستعادة مكتبتك وإمكانية التشغيل.',
    openYou: 'فتح صفحة «أنت»',
    aurralServices: 'خدمات Aurral',
  },
]) {
  test(`administrator directory uses ${locale.tag} messages on You and Administration`, async ({
    page,
  }, info) => {
    await session(page, 2);
    await page.route('**/api/v1/user/1/settings/main', (route) =>
      route.fulfill({ json: { locale: locale.tag } })
    );
    await page.goto(testAppPath('/me'));
    await expect(
      page.getByRole('heading', { name: locale.administration, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: locale.open, exact: true })
    ).toHaveAttribute(
      'href',
      testAppPath(locale.tag === 'fr' ? '/admin/general' : '/admin/network')
    );
    await expect(
      page.getByText(locale.settings, { exact: true })
    ).toBeVisible();
    await expect(page.locator('#tq')).toHaveAttribute(
      'placeholder',
      locale.homeSearch
    );
    await page.screenshot({
      path: info.outputPath(`shell-search-${locale.tag}.png`),
    });
    await expect(page.locator('#tq')).toHaveAttribute(
      'placeholder',
      locale.homeSearch
    );
    await expect(page.locator('.tb-back')).toHaveAttribute(
      'aria-label',
      locale.back
    );
    await page.goto(testAppPath('/no-such-lumen-page'));
    await expect(
      page.getByRole('heading', { name: locale.missingHeading, exact: true })
    ).toBeVisible();
    await expect(page.locator('.ph-only-avatar')).toHaveAttribute(
      'aria-label',
      locale.profile
    );
    await expect(page.getByText(locale.missingPage)).toBeVisible();
    await expect(
      page.getByRole('link', { name: locale.backToDiscover, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: locale.fullSeerr, exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`missing-page-${locale.tag}.png`),
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.goto(testAppPath('/admin'));
    const captureDir = process.env.LUMEN_I18N_CAPTURE_DIR;
    const baselineCapture = process.env.LUMEN_CAPTURE_BASELINE === '1';
    const aurralLabel =
      process.env.LUMEN_I18N_CAPTURE_ONLY === '1'
        ? 'Aurral Services'
        : locale.aurralServices;
    const aurralLink = page.getByRole('link', {
      name: `${locale.tag === 'fr' ? 'Ouvrir' : 'فتح'} ${aurralLabel}`,
      exact: true,
    });
    await expect(aurralLink).toBeVisible();
    const homeGroupHeadings = baselineCapture
      ? [
          'General',
          'Requests and Discovery',
          'Media Servers and Readers',
          'Indexers and Downloads',
          'TV and Movies',
          'Books, Audiobooks and Comics',
          'Music',
          'Software and Games',
          'System',
        ]
      : locale.homeGroups;
    for (const heading of homeGroupHeadings)
      await expect(
        page.getByRole('heading', { name: heading, exact: true })
      ).toBeVisible();
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name)) {
      const { mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      await mkdir(captureDir, { recursive: true });
      await page.screenshot({
        path: join(
          captureDir,
          `admin-home-${locale.tag}-${info.project.name}.png`
        ),
        fullPage: true,
      });
    }
    if (baselineCapture) return;
    if (process.env.LUMEN_I18N_CAPTURE_ONLY === '1') return;
    await expect(page.getByLabel(locale.search, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: locale.all, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: locale.open, exact: true })
    ).toBeVisible();
    await page.route('**/api/v1/settings/main', (route) =>
      route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          defaultQuotas: { movie: { quotaLimit: 2, quotaDays: 7 } },
          defaultPermissions: 32,
          defaultEnabledMediaCategories: { movie: true, tv: true },
        },
      })
    );
    await page
      .getByLabel(locale.search, { exact: true })
      .fill(locale.permissionsSearch);
    const permissionsLink = page.getByRole('link', {
      name: locale.permissionsLink,
      exact: true,
    });
    await expect(permissionsLink).toHaveAttribute(
      'href',
      testAppPath('/admin/requests#default-user-permissions')
    );
    await page.screenshot({
      path: info.outputPath(`admin-permissions-search-${locale.tag}.png`),
    });
    await permissionsLink.click();
    await expect(page).toHaveURL(/\/admin\/requests#default-user-permissions$/);
    await expect(
      page.locator('#default-user-permissions details')
    ).toHaveAttribute('open', '');
    await page.goto(testAppPath('/admin'));
    await page
      .getByLabel(locale.search, { exact: true })
      .fill(locale.categorySearch);
    const categoryLink = page.getByRole('link', {
      name: locale.categoryLink,
      exact: true,
    });
    await expect(categoryLink).toHaveAttribute(
      'href',
      testAppPath('/admin/categories#default-user-categories')
    );
    await page.screenshot({
      path: info.outputPath(`admin-categories-search-${locale.tag}.png`),
    });
    await categoryLink.click();
    await expect(page).toHaveURL(
      /\/admin\/categories#default-user-categories$/
    );
    await expect(
      page.getByRole('heading', {
        name:
          locale.tag === 'fr'
            ? 'Catégories utilisateur par défaut'
            : 'الفئات الافتراضية للمستخدمين',
        exact: true,
      })
    ).toBeInViewport();
    await page.goto(testAppPath('/admin'));
    await page.getByLabel(locale.search, { exact: true }).fill(locale.settings);
    await expect(
      page.getByRole('link', { name: locale.open, exact: true })
    ).toBeVisible();
    await page.getByLabel(locale.search, { exact: true }).fill('');
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale.tag === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: info.outputPath(`admin-${locale.tag}.png`) });

    await page.getByRole('link', { name: locale.group, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: locale.groupHeading, exact: true })
    ).toBeVisible();
    await page
      .getByLabel(locale.search, { exact: true })
      .fill('no-such-setting');
    await expect(
      page.getByText(
        locale.tag === 'fr'
          ? 'Aucun paramètre ne correspond à cette recherche.'
          : 'لا توجد إعدادات تطابق هذا البحث.',
        { exact: true }
      )
    ).toBeVisible();
  });

  test(`media-server sign-in notice uses ${locale.tag} messages`, async ({
    page,
  }, info) => {
    await session(page, 2, undefined, ['mediaServerSignInRequired']);
    await page.route('**/api/v1/user/1/settings/main', (route) =>
      route.fulfill({ json: { locale: locale.tag } })
    );
    await page.goto(testAppPath('/me'));
    const notice = page
      .locator('p[role="status"]')
      .filter({ hasText: locale.serverWarning });
    await expect(notice).toContainText(locale.serverWarning);
    await expect(
      notice.getByRole('link', { name: locale.openYou, exact: true })
    ).toHaveAttribute('href', testAppPath('/me'));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({
      path: info.outputPath(`server-warning-${locale.tag}.png`),
    });
  });
}

for (const permissions of [32, 4, '2', [2], -2, 2.5]) {
  test(`non-admin or invalid mask ${JSON.stringify(permissions)} has no admin navigation`, async ({
    page,
  }) => {
    await session(page, permissions);
    await page.goto(testAppPath('/me'));
    await expect(
      page.getByRole('heading', { name: 'You', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Lumen Settings', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /SeerrNG Administration/ })
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Administration', exact: true })
    ).toHaveCount(0);
    await expect(page.getByText('Full SeerrNG', { exact: true })).toBeVisible();
    await page.goto(testAppPath('/admin'));
    await expect(page).toHaveURL(/\/me$/);
    await page.goto(testAppPath('/me/lumen'));
    await expect(page.getByText('Admins only', { exact: true })).toBeVisible();
  });
}

test('configured companion destination is retained with the classic interface escape', async ({
  page,
}) => {
  await session(page, 2, 'https://seerr.example.test/base/?keep=1');
  await page.goto(testAppPath('/me'));
  const link = page.getByRole('link', {
    name: 'Open Full SeerrNG',
    exact: true,
  });
  await expect(link).toHaveAttribute(
    'href',
    'https://seerr.example.test/base/?keep=1&interface=classic'
  );
});

test('About opens release history on demand and retries a failed lookup', async ({
  page,
}) => {
  await session(page, 2);
  await page.route('**/api/v1/settings/about', (route) =>
    route.fulfill({
      json: {
        version: '3.72.38',
        totalMediaItems: 10,
        totalRequests: 5,
        appDataPath: '/config',
      },
    })
  );
  let lookups = 0;
  const longWord = 'a'.repeat(200);
  const notes = `### Fixes\n\n- **Fixture release notes.** ${longWord}\n- [Compare versions](https://github.com/snapetech-org/seerrng/compare/v3.72.37...v3.72.38)`;
  await page.route(
    'https://api.github.com/repos/snapetech-org/seerrng/releases?per_page=20',
    (route) =>
      ++lookups === 1
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            json: [
              {
                tag_name: 'v3.72.38',
                name: 'Fixture Release',
                body: notes,
              },
            ],
          })
  );
  await page.goto(testAppPath('/admin/about'));
  const open = page.getByRole('button', { name: 'Show Releases' });
  await expect(open).toBeVisible();
  expect(lookups).toBe(0);
  await open.click();
  await expect(page.getByRole('alert')).toContainText(
    'Release history could not be loaded'
  );
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page
    .getByText('Fixture Release · Latest · Installed', { exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Fixes' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Compare versions' })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/compare/v3.72.37...v3.72.38'
  );
  const releaseNotes = page
    .getByRole('listitem')
    .filter({ hasText: longWord })
    .last();
  await expect(releaseNotes).toBeVisible();
  expect(
    await releaseNotes.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        element.scrollWidth <= element.clientWidth &&
        bounds.right <= document.documentElement.clientWidth
      );
    })
  ).toBe(true);
  await expect(
    page.getByRole('link', { name: 'View on GitHub' })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/releases/tag/v3.72.38'
  );
  expect(lookups).toBe(2);
});

test('About links a development update to the installed commit comparison', async ({
  page,
}) => {
  await session(page, 2);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { versionCheck: true } })
  );
  await page.route('**/api/v1/settings/about', (route) =>
    route.fulfill({
      json: {
        version: 'main-abcdef0',
        totalMediaItems: 10,
        totalRequests: 5,
        appDataPath: '/config',
      },
    })
  );
  await page.route('**/api/v1/status', (route) =>
    route.fulfill({
      json: {
        commitTag: 'abcdef0',
        updateCheckSucceeded: true,
        updateAvailable: true,
      },
    })
  );
  await page.goto(testAppPath('/admin/about'));
  await expect(
    page.getByRole('link', { name: 'Update available' })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/compare/abcdef0...main'
  );
  await expect(page.getByRole('heading', { name: 'Legal Use' })).toBeVisible();
});
