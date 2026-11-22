import { expect, test } from '@playwright/test';

const copy = {
  en: {
    title: 'Translations and Hacks',
    search: 'Search Titles',
    kind: 'Kind',
    anyKind: 'Any Kind',
    language: 'Language',
    anyLanguage: 'Any Language',
    completeOnly: 'Completed Projects Only',
    apply: 'Apply Filters',
    noMatches: 'No projects matched.',
    choose: 'Choose a Version',
    browse: 'Browse Patches',
    version: 'Patch Version',
    gameType: 'Game Type',
    system: 'System',
    keep: 'Keep Original',
    request: 'Request Patch',
    receipt: 'Patch requested',
  },
  fr: {
    title: 'Traductions et modifications',
    search: 'Rechercher des titres',
    kind: 'Type',
    anyKind: 'Tous les types',
    language: 'Langue',
    anyLanguage: 'Toutes les langues',
    completeOnly: 'Projets terminés uniquement',
    apply: 'Appliquer les filtres',
    noMatches: 'Aucun projet correspondant.',
    choose: 'Choisir une version',
    browse: 'Parcourir les patchs',
    version: 'Version du patch',
    gameType: 'Type de jeu',
    system: 'Système',
    keep: 'Conserver l’original',
    request: 'Demander le patch',
    receipt: 'Patch demandé',
  },
  ar: {
    title: 'الترجمات والتعديلات',
    search: 'ابحث عن العناوين',
    kind: 'النوع',
    anyKind: 'أي نوع',
    language: 'اللغة',
    anyLanguage: 'أي لغة',
    completeOnly: 'المشاريع المكتملة فقط',
    apply: 'تطبيق عوامل التصفية',
    noMatches: 'لا توجد مشاريع مطابقة.',
    choose: 'اختر إصدارًا',
    browse: 'تصفح التعديلات',
    version: 'إصدار التعديل',
    gameType: 'نوع اللعبة',
    system: 'النظام',
    keep: 'الاحتفاظ بالأصل',
    request: 'طلب التعديل',
    receipt: 'تم طلب التعديل',
  },
} as const;

const key = `dat-${'c'.repeat(64)}`;
const viewport = {
  desktop: { width: 1440, height: 900 },
  iphone: { width: 390, height: 844 },
  android: { width: 412, height: 915 },
  tablet: { width: 834, height: 1194 },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`patch catalogue and requests follow ${locale}`, async ({
    page,
  }, info) => {
    const text = copy[locale];
    let submission: unknown;
    await page.setViewportSize(
      viewport[info.project.name as keyof typeof viewport] ?? viewport.iphone
    );
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Player', permissions: 32 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            softwareEnabled: true,
            romarrEnabled: true,
            enabledMediaCategories: { game: true, modern: true },
          },
        });
      if (path === '/patches/search')
        return route.fulfill({ json: { available: true, results: [] } });
      if (path === '/patches/projects/patch-l10n')
        return route.fulfill({
          json: {
            id: 'patch-l10n',
            name: 'Fixture Patch',
            kind: 'translation',
            status: 'complete',
            game: { catalogKey: key, title: 'Fixture Game' },
            latestVersionId: 'v1',
            versions: [{ id: 'v1', version: '1.0', base: { available: true } }],
          },
        });
      if (path === `/request/software/catalog/games/${key}`)
        return route.fulfill({
          json: {
            catalogProvider: 'dat',
            catalogId: key,
            emulationSystems: [{ group: 'retro', slug: 'snes', name: 'SNES' }],
          },
        });
      if (path === '/request/software' && request.method() === 'POST') {
        submission = request.postDataJSON();
        return route.fulfill({
          status: 201,
          json: { request: { id: 91, status: 'submitted' } },
        });
      }
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto('/patches');
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(
      page.getByRole('searchbox', { name: text.search })
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: text.kind })).toBeVisible();
    await expect(
      page.getByRole('option', { name: text.anyKind })
    ).toBeAttached();
    await expect(
      page.getByRole('combobox', { name: text.language })
    ).toBeVisible();
    await expect(page.getByText(text.completeOnly)).toBeVisible();
    await page.getByRole('button', { name: text.apply }).click();
    await expect(page.getByText(text.noMatches)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`catalog-${locale}.png`) });

    await page.goto('/patches/patch-l10n');
    await expect(page.getByRole('link', { name: text.browse })).toBeVisible();
    await expect(page.getByLabel(text.version)).toHaveValue('v1');
    await expect(page.getByLabel(text.gameType)).toHaveValue('retro');
    await expect(page.getByLabel(text.system)).toHaveValue('snes');
    await expect(page.getByText(text.keep)).toBeVisible();
    await page.getByRole('button', { name: text.request }).click();
    await expect(page.locator('p[role="status"]')).toContainText(text.receipt);
    expect(submission).toEqual({
      category: 'retro',
      catalogProvider: 'dat',
      catalogKey: key,
      platformSlug: 'snes',
      selection: {
        kind: 'patch',
        projectId: 'patch-l10n',
        versionId: 'v1',
        keepOriginal: true,
      },
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`detail-${locale}.png`) });
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
  });
}
