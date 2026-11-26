import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const text = {
  en: {
    title: 'Share',
    input: 'Titles, links, or ISBNs',
    format: 'Book Format',
    ebook: 'Ebook',
    audiobook: 'Audiobook',
    find: 'Find Matches',
    matches: 'Matches',
    matchFor: 'Match for Fixture Series',
    choose: 'Choose a match',
    open: 'Open Title',
    seasons: 'Series Seasons',
    first: 'First season',
    all: 'All seasons',
    request: 'Request Selected (1)',
    policy: 'Streaming Request Policy',
    anyway: 'Request Anyway',
    cancel: 'Cancel',
    submitted: 'Request submitted',
    notice: 'Submitted 1 request.',
  },
  fr: {
    title: 'Partager',
    input: 'Titres, liens ou ISBN',
    format: 'Format du livre',
    ebook: 'Livre numérique',
    audiobook: 'Livre audio',
    find: 'Trouver des correspondances',
    matches: 'Correspondances',
    matchFor: 'Correspondance pour Fixture Series',
    choose: 'Choisir une correspondance',
    open: 'Ouvrir le titre',
    seasons: 'Saisons de la série',
    first: 'Première saison',
    all: 'Toutes les saisons',
    request: 'Demander la sélection (1)',
    policy: 'Politique de demande liée au streaming',
    anyway: 'Demander quand même',
    cancel: 'Annuler',
    submitted: 'Demande envoyée',
    notice: '1 demande envoyée.',
  },
  ar: {
    title: 'مشاركة',
    input: 'العناوين أو الروابط أو أرقام ISBN',
    format: 'تنسيق الكتاب',
    ebook: 'كتاب إلكتروني',
    audiobook: 'كتاب صوتي',
    find: 'البحث عن مطابقات',
    matches: 'المطابقات',
    matchFor: 'مطابقة لـ Fixture Series',
    choose: 'اختر مطابقة',
    open: 'فتح العنوان',
    seasons: 'مواسم المسلسل',
    first: 'الموسم الأول',
    all: 'كل المواسم',
    request: 'طلب المحدد (1)',
    policy: 'سياسة طلبات المشاهدة عبر خدمات البث',
    anyway: 'اطلب على أي حال',
    cancel: 'إلغاء',
    submitted: 'تم إرسال الطلب',
    notice: 'تم إرسال طلب واحد.',
  },
} as const;

const viewports = {
  desktop: { width: 1440, height: 900 },
  iphone: { width: 390, height: 844 },
  android: { width: 412, height: 915 },
  tablet: { width: 834, height: 1194 },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Share identify and request flow follows ${locale}`, async ({
    page,
  }, info) => {
    const copy = text[locale];
    const writes: unknown[] = [];
    await page.setViewportSize(
      viewports[info.project.name as keyof typeof viewports] ??
        viewports.desktop
    );
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/resolve/capabilities')
        return route.fulfill({ json: { enabled: true, image: false } });
      if (path === '/resolve')
        return route.fulfill({
          json: {
            groups: [
              {
                input: 'Fixture Series',
                autoSelected: 0,
                candidates: [
                  {
                    id: '42',
                    title: 'Fixture Series',
                    mediaType: 'tv',
                    evidence: 'Exact title match',
                    href: '/tv/42',
                  },
                ],
              },
            ],
          },
        });
      if (path === '/request' && request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push(body);
        if (!body.bypassStreamingRequestPolicy)
          return route.fulfill({
            status: 403,
            json: {
              code: 'STREAMING_REQUEST_POLICY_REJECTED',
              allowOverride: true,
              message: 'Available on your streaming service.',
            },
          });
        return route.fulfill({ status: 201, json: { id: 77 } });
      }
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto('/share');
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    const input = page.getByLabel(copy.input);
    await input.fill('Fixture Series');
    await page.screenshot({
      path: info.outputPath(`share-input-${locale}.png`),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: copy.find }).click();
    await expect(
      page.getByRole('heading', { name: copy.matches })
    ).toBeVisible();
    await expect(page.getByLabel(copy.matchFor)).toBeVisible();
    await expect(page.getByRole('link', { name: copy.open })).toHaveAttribute(
      'href',
      appPath('/tv/42')
    );
    const seasons = page.getByLabel(copy.seasons);
    await expect(
      seasons.getByRole('option', { name: copy.first })
    ).toBeAttached();
    await seasons.selectOption('all');
    await page.screenshot({
      path: info.outputPath(`share-matches-${locale}.png`),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: copy.request }).click();
    const dialog = page.getByRole('alertdialog', { name: copy.policy });
    await expect(dialog).toContainText('Available on your streaming service.');
    await page.screenshot({
      path: info.outputPath(`share-policy-${locale}.png`),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: copy.cancel }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: copy.request }).click();
    const retry = page.getByRole('alertdialog', { name: copy.policy });
    await retry.getByRole('button', { name: copy.anyway }).click();
    await expect(page.getByText(copy.submitted, { exact: true })).toBeVisible();
    await expect(page.locator('p[role="status"]')).toHaveText(copy.notice);
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: 'Fixture Series' })
        .getByText(copy.submitted, { exact: true })
    ).toBeVisible();
    expect(writes).toEqual([
      { mediaType: 'tv', mediaId: 42, seasons: 'all' },
      { mediaType: 'tv', mediaId: 42, seasons: 'all' },
      {
        mediaType: 'tv',
        mediaId: 42,
        seasons: 'all',
        bypassStreamingRequestPolicy: true,
      },
    ]);
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
