import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('About and release history follow the saved locale', async ({ page }) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_ABOUT_LOCALE ?? ''
  )
    ? (process.env.LUMEN_ABOUT_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
  const translated = {
    en: {
      title: 'About SeerrNG',
      back: 'Administration',
      info: 'Server Information',
      update: 'Update available',
      support: 'Support and Releases',
      releaseNotes: 'Release Notes',
      legal: 'Legal Use',
      attribution: 'Metadata attribution',
      tmdbTerms: 'TMDB API terms',
      history: 'Release History',
      show: 'Show Releases',
      failure: 'Release history could not be loaded.',
      retry: 'Retry',
      latest: 'Latest',
      installed: 'Installed',
      viewOnGithub: 'View on GitHub',
      documentation: 'Documentation',
      legalBody: 'Users are responsible for complying with applicable laws',
      developmentBuild: 'This server is running a development build.',
    },
    fr: {
      title: 'À propos de SeerrNG',
      back: 'Administration',
      info: 'Informations du serveur',
      update: 'Mise à jour disponible',
      support: 'Assistance et versions',
      releaseNotes: 'Notes de version',
      legal: 'Utilisation légale',
      attribution: 'Attribution des métadonnées',
      tmdbTerms: 'Conditions d’utilisation de l’API TMDB',
      history: 'Historique des versions',
      show: 'Afficher les versions',
      failure: 'Impossible de charger l’historique des versions.',
      retry: 'Réessayer',
      latest: 'Dernière version',
      installed: 'Installée',
      viewOnGithub: 'Voir sur GitHub',
      documentation: 'Documentation',
      legalBody: 'Les utilisateurs sont responsables de se conformer',
      developmentBuild: 'Ce serveur utilise une version de développement.',
    },
    ar: {
      title: 'حول SeerrNG',
      back: 'الإدارة',
      info: 'معلومات الخادم',
      update: 'يتوفر تحديث',
      support: 'الدعم والإصدارات',
      releaseNotes: 'ملاحظات الإصدار',
      legal: 'الاستخدام القانوني',
      attribution: 'نَسب البيانات الوصفية',
      tmdbTerms: 'شروط استخدام واجهة TMDB البرمجية',
      history: 'سجل الإصدارات',
      show: 'عرض الإصدارات',
      failure: 'تعذّر تحميل سجل الإصدارات.',
      retry: 'إعادة المحاولة',
      latest: 'الأحدث',
      installed: 'مثبّت',
      viewOnGithub: 'رؤية المحتوى على GitHub',
      documentation: 'الوثائق',
      legalBody: 'يتحمل المستخدمون مسؤولية الالتزام',
      developmentBuild: 'يعمل هذا الخادم بإصدار مخصص للتطوير.',
    },
  }[locale];
  const labels = baseline
    ? {
        ...translated,
        title: 'About SeerrNG',
        back: 'Administration',
        info: 'Server Information',
        update: 'Update available',
        support: 'Support and Releases',
        releaseNotes: 'Release Notes',
        legal: 'Legal Use',
        attribution: 'Metadata attribution',
        tmdbTerms: 'TMDB API Terms',
        history: 'Release History',
        show: 'Show Releases',
        failure: 'Release history could not be loaded.',
        retry: 'Retry',
        latest: 'Latest',
        installed: 'Installed',
        viewOnGithub: 'View on GitHub',
        documentation: 'Documentation',
        legalBody: 'Users are responsible for complying with applicable laws',
        developmentBuild: 'This server is running a development build.',
      }
    : translated;
  let releaseLookups = 0;
  let aboutVersion = '3.72.38';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route(
    'https://api.github.com/repos/snapetech-org/seerrng/releases?per_page=20',
    (route) =>
      ++releaseLookups === 1
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            json: [
              {
                tag_name: 'v3.72.38',
                name: 'Fixture Release',
                body: '### Fixes\n\n- Fixture release notes.',
              },
            ],
          })
  );
  await page.route('**/api/v1/**', (route) => {
    const requestPath = new URL(route.request().url()).pathname.replace(
      /^\/lumen/,
      ''
    );
    if (requestPath.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (requestPath.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (requestPath.endsWith('/settings/public'))
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', versionCheck: true },
      });
    if (requestPath.endsWith('/settings/about'))
      return route.fulfill({
        json: {
          version: aboutVersion,
          totalMediaItems: 1234,
          totalRequests: 7,
          appDataPath: '/fixture/config',
        },
      });
    if (requestPath.endsWith('/status'))
      return route.fulfill({
        json: {
          commitTag: 'abcdef1234567',
          updateCheckSucceeded: true,
          updateAvailable: true,
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/admin/about'));
  await expect(
    page.getByRole('heading', { name: labels.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.back, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.info, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.update, exact: true })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/releases'
  );
  await expect(
    page.getByRole('heading', { name: labels.support, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.releaseNotes, exact: true })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/releases'
  );
  await expect(
    page.getByRole('link', { name: labels.documentation, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.legal, exact: true })
  ).toBeVisible();
  await expect(page.getByText(new RegExp(labels.legalBody))).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.attribution, exact: true })
  ).toBeVisible();
  const attributionCopy = page
    .getByRole('heading', { name: labels.attribution, exact: true })
    .locator('..')
    .locator('..')
    .locator('p');
  expect(await attributionCopy.innerText()).not.toMatch(/\s+\p{P}|\p{P}{2,}/u);
  await expect(
    page.getByRole('link', { name: labels.tmdbTerms, exact: true })
  ).toHaveAttribute('href', 'https://www.themoviedb.org/api-terms-of-use');
  const releaseToggle = page.getByRole('button', {
    name: labels.show,
    exact: true,
  });
  await expect(releaseToggle).toBeVisible();
  expect(releaseLookups).toBe(0);
  if (process.env.LUMEN_CAPTURE_ABOUT)
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_ABOUT}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await releaseToggle.click();
  await expect(page.getByRole('alert')).toContainText(labels.failure);
  await page.getByRole('button', { name: labels.retry, exact: true }).click();
  await page
    .getByText(`Fixture Release · ${labels.latest} · ${labels.installed}`, {
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Fixes', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.viewOnGithub, exact: true })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/releases/tag/v3.72.38'
  );
  expect(releaseLookups).toBe(2);
  aboutVersion = 'main-3.72.38';
  await page.reload();
  await expect(
    page.getByText(labels.developmentBuild, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.update, exact: true })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/compare/abcdef1234567...main'
  );
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
