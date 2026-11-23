import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('Media Categories and Age Gate follow the saved locale and preserve each draft', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_CATEGORY_LOCALE ?? ''
  )
    ? (process.env.LUMEN_CATEGORY_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const baseline = process.env.LUMEN_CATEGORY_BASELINE === 'true';
  const translated = {
    en: {
      title: 'Media Categories',
      back: 'Administration',
      available: 'Available Categories',
      movie: 'Movies',
      series: 'Series',
      ebook: 'Books',
      music: 'Music',
      defaultCategories: 'Default User Categories',
      saveCategories: 'Save Categories',
      saveDefaults: 'Save Default Categories',
      defaultsSaved: 'Default categories saved.',
      categorySaved: 'Category settings saved.',
      ageGate: 'Age Gate',
      restrictedByDefault: 'Restrict accounts by default',
      movieRating: 'Highest movie rating',
      tvRating: 'Highest series rating',
      country: 'Rating country',
      saveAgeGate: 'Save Age Gate',
      ageGateSaved: 'Age Gate settings saved.',
      adult: 'Adult',
      sports: 'Sports',
      adultEnabledNote:
        'Adult discovery requires a configured Whisparr v3 service and account permission. Restricted accounts cannot access it.',
      serverProblem: 'The server had a problem. Try again in a moment.',
      confirmFailure: 'The server did not confirm the saved categories.',
      description:
        'Choose which categories everyone can browse and request. Disabled categories disappear from navigation and discovery, and new requests are blocked. Existing requests and download history stay available in Request Status.',
      groupDescription:
        'These switches control category availability across SeerrNG.',
      defaultsDescription:
        'These choices apply to accounts that inherit the defaults. Instance-wide category restrictions still apply.',
      groupName: 'Available Categories',
      ageGateHeading: 'Age Gate',
    },
    fr: {
      title: 'Catégories de médias',
      back: 'Administration',
      available: 'Catégories disponibles',
      movie: 'Films',
      series: 'Séries',
      ebook: 'Livres',
      music: 'Musique',
      defaultCategories: 'Catégories utilisateur par défaut',
      saveCategories: 'Enregistrer les catégories',
      saveDefaults: 'Enregistrer les catégories par défaut',
      defaultsSaved: 'Catégories par défaut enregistrées.',
      categorySaved: 'Paramètres de catégorie enregistrés.',
      ageGate: 'Contrôle d’âge',
      restrictedByDefault: 'Restreindre les comptes par défaut',
      movieRating: 'Classification maximale des films',
      tvRating: 'Classification maximale des séries',
      country: 'Pays de classification',
      saveAgeGate: 'Enregistrer le contrôle d’âge',
      ageGateSaved: 'Paramètres du contrôle d’âge enregistrés.',
      adult: 'Adulte',
      sports: 'Sports',
      adultEnabledNote:
        'La découverte de contenus pour adultes nécessite un service Whisparr v3 configuré et l’autorisation correspondante du compte. Les comptes restreints n’y ont pas accès.',
      serverProblem:
        'Le serveur a rencontré un problème. Réessayez dans un instant.',
      confirmFailure:
        'Le serveur n’a pas confirmé l’enregistrement des catégories.',
      description:
        'Choisissez les catégories que chacun peut découvrir et demander. Les catégories désactivées disparaissent de la navigation et de la découverte, et les nouvelles demandes sont bloquées. Les demandes existantes et leur historique de téléchargement restent accessibles dans le suivi des demandes.',
      groupDescription:
        'Ces interrupteurs définissent les catégories disponibles dans SeerrNG.',
      defaultsDescription:
        'Ces choix s’appliquent aux comptes qui héritent des paramètres par défaut. Les restrictions de catégories de l’instance s’appliquent toujours.',
      groupName: 'Catégories disponibles',
      ageGateHeading: "Contrôle d'âge",
    },
    ar: {
      title: 'فئات الوسائط',
      back: 'الإدارة',
      available: 'الفئات المتاحة',
      movie: 'أفلام',
      series: 'مسلسلات',
      ebook: 'كتب',
      music: 'الموسيقى',
      defaultCategories: 'الفئات الافتراضية للمستخدمين',
      saveCategories: 'حفظ الفئات',
      saveDefaults: 'حفظ الفئات الافتراضية',
      defaultsSaved: 'تم حفظ الفئات الافتراضية.',
      categorySaved: 'أُنقذت أوضاع الفئة',
      ageGate: 'بوابة العمر',
      restrictedByDefault: 'تقييد الحسابات افتراضيًا',
      movieRating: 'أعلى تقييم للأفلام',
      tvRating: 'أعلى تقييم للمسلسلات',
      country: 'بلد التصنيف',
      saveAgeGate: 'حفظ بوابة العمر',
      ageGateSaved: 'تم حفظ إعدادات بوابة العمر.',
      adult: 'للبالغين',
      sports: 'الرياضة',
      adultEnabledNote:
        'يتطلب استكشاف محتوى البالغين إعداد خدمة Whisparr v3 ومنح الحساب الإذن المناسب. لا يمكن للحسابات المقيّدة الوصول إليه.',
      serverProblem: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
      confirmFailure: 'لم يؤكد الخادم حفظ الفئات.',
      description:
        'اختر الفئات التي يمكن للجميع استعراضها وطلبها. تُخفى الفئات المعطّلة من التنقل والاكتشاف، وتُمنع الطلبات الجديدة. تظل الطلبات الحالية وسجل تنزيلاتها متاحين في حالة الطلب.',
      groupDescription: 'تحدد مفاتيح التبديل هذه الفئات المتاحة في SeerrNG.',
      defaultsDescription:
        'تُطبّق هذه الاختيارات على الحسابات التي ترث الإعدادات الافتراضية. وتظل قيود الفئات على مستوى الخادم سارية.',
      groupName: 'الفئات المتاحة',
      ageGateHeading: 'بوابة العمر',
    },
  }[locale];
  const labels = baseline
    ? {
        ...translated,
        title: 'Media Categories',
        back: 'Administration',
        available: 'Available Categories',
        movie: 'Movies',
        series: 'Series',
        ebook: 'Books',
        music: 'Music',
        sports: 'Sports',
        categorySaved: 'Category settings saved.',
        defaultCategories: 'Default User Categories',
        description:
          'Disabled categories are hidden from discovery and block new requests. Existing requests and download history remain available.',
        groupDescription: '',
        adultEnabledNote:
          'Adult discovery requires a configured Whisparr v3 service and account permission. Restricted accounts cannot access it.',
        groupName: 'Enabled Media Categories',
        ageGateHeading: 'Age Gate',
      }
    : translated;
  const categories: Record<string, boolean> = {
    movie: true,
    tv: true,
    music: true,
    ebook: true,
    audiobook: true,
    comic: true,
    magazine: true,
    adult: true,
    sports: true,
    retro: true,
    modern: true,
    game: true,
  };
  const defaults = { ...categories };
  const ageGate = {
    defaultRestricted: false,
    maxMovieCertification: 'R',
    maxTvCertification: 'TV-MA',
    certificationCountry: 'CA',
  };
  const writes: Record<string, unknown>[] = [];
  let failEbookSave = true;
  let staleMovieReadback: Record<string, boolean> | undefined;
  let returnStaleMovieReadback = false;

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/lumen/,
      ''
    );
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/settings/public'))
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    if (path.endsWith('/settings/main')) {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<
          string,
          Record<string, boolean> | typeof ageGate
        >;
        writes.push(body);
        if (failEbookSave && body.enabledMediaCategories?.ebook === false) {
          failEbookSave = false;
          return route.fulfill({
            status: 503,
            json: { message: 'Service unavailable.' },
          });
        }
        if (
          body.enabledMediaCategories?.movie === false &&
          !staleMovieReadback
        ) {
          staleMovieReadback = { ...categories };
          returnStaleMovieReadback = true;
        }
        if (body.enabledMediaCategories)
          Object.assign(categories, body.enabledMediaCategories);
        if (body.defaultEnabledMediaCategories)
          Object.assign(defaults, body.defaultEnabledMediaCategories);
        if (body.ageGate) Object.assign(ageGate, body.ageGate);
        return route.fulfill({
          json: {
            enabledMediaCategories: categories,
            defaultEnabledMediaCategories: defaults,
            ageGate,
          },
        });
      }
      const response = {
        enabledMediaCategories: categories,
        defaultEnabledMediaCategories: defaults,
        ageGate,
      };
      if (returnStaleMovieReadback && staleMovieReadback) {
        returnStaleMovieReadback = false;
        response.enabledMediaCategories = staleMovieReadback;
      }
      return route.fulfill({ json: response });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/admin/categories'));
  await expect(
    page.getByRole('heading', { name: labels.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.back, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.available, exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(labels.description, { exact: true })
  ).toBeVisible();
  if (labels.groupDescription)
    await expect(
      page.getByText(labels.groupDescription, { exact: true })
    ).toBeVisible();

  const available = page.locator('section').filter({
    has: page.getByRole('heading', { name: labels.available, exact: true }),
  });
  const defaultsSection = page.locator('section').filter({
    has: page.getByRole('heading', {
      name: labels.defaultCategories,
      exact: true,
    }),
  });
  await expect(
    available.getByRole('group', { name: labels.groupName, exact: true })
  ).toBeVisible();
  await expect(
    available.getByRole('checkbox', { name: labels.movie, exact: true })
  ).toBeChecked();
  await expect(
    available.getByRole('checkbox', { name: labels.series, exact: true })
  ).toBeChecked();
  await expect(
    available.getByRole('checkbox', { name: labels.sports, exact: true })
  ).toBeChecked();
  await expect(
    available.getByText(labels.adultEnabledNote, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.ageGateHeading, exact: true })
  ).toBeVisible();
  if (process.env.LUMEN_CATEGORY_CAPTURE)
    await page.screenshot({
      path: `${process.env.LUMEN_CATEGORY_CAPTURE}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (baseline) return;

  expect(await available.getByRole('checkbox').count()).toBe(
    Object.keys(categories).length
  );
  await available
    .getByRole('checkbox', { name: labels.movie, exact: true })
    .uncheck();
  await available
    .getByRole('button', { name: labels.saveCategories, exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(labels.confirmFailure);
  await expect(
    available.getByRole('checkbox', { name: labels.movie, exact: true })
  ).not.toBeChecked();
  await expect(
    available.getByRole('button', { name: labels.saveCategories, exact: true })
  ).toBeEnabled();
  await available
    .getByRole('button', { name: labels.saveCategories, exact: true })
    .click();
  await expect(
    available.getByText(labels.categorySaved, { exact: true })
  ).toBeVisible();
  await expect(
    available.getByRole('checkbox', { name: labels.movie, exact: true })
  ).not.toBeChecked();

  await available
    .getByRole('checkbox', { name: labels.ebook, exact: true })
    .uncheck();
  await available
    .getByRole('button', { name: labels.saveCategories, exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(labels.serverProblem);
  await expect(
    available.getByRole('checkbox', { name: labels.ebook, exact: true })
  ).not.toBeChecked();
  await expect(
    available.getByRole('button', { name: labels.saveCategories, exact: true })
  ).toBeEnabled();
  await available
    .getByRole('button', { name: labels.saveCategories, exact: true })
    .click();
  await expect(
    available.getByText(labels.categorySaved, { exact: true })
  ).toBeVisible();

  await available
    .getByRole('checkbox', { name: labels.music, exact: true })
    .uncheck();
  await defaultsSection
    .getByRole('checkbox', { name: labels.series, exact: true })
    .uncheck();
  await defaultsSection
    .getByRole('button', { name: labels.saveDefaults, exact: true })
    .click();
  await expect(
    defaultsSection.getByText(labels.defaultsSaved, { exact: true })
  ).toBeVisible();
  await expect(
    available.getByRole('button', { name: labels.saveCategories, exact: true })
  ).toBeEnabled();

  const ageGateSection = page.locator('section').filter({
    has: page.getByRole('heading', {
      name: labels.ageGateHeading,
      exact: true,
    }),
  });
  const restrictionToggle = ageGateSection.getByRole('checkbox', {
    name: labels.restrictedByDefault,
    exact: true,
  });
  const movieRating = ageGateSection.getByLabel(labels.movieRating, {
    exact: true,
  });
  const country = ageGateSection.getByLabel(labels.country, { exact: true });
  const saveAgeGate = ageGateSection.getByRole('button', {
    name: labels.saveAgeGate,
    exact: true,
  });
  await restrictionToggle.check();
  await movieRating.selectOption('PG');
  await country.fill('u');
  await expect(saveAgeGate).toBeDisabled();
  await country.fill('us');
  await saveAgeGate.click();
  await expect(
    ageGateSection.getByText(labels.ageGateSaved, { exact: true })
  ).toBeVisible();
  await expect(country).toHaveValue('US');
  await expect(restrictionToggle).toBeChecked();
  await expect(
    available.getByRole('button', { name: labels.saveCategories, exact: true })
  ).toBeEnabled();

  expect(writes).toEqual([
    { enabledMediaCategories: { movie: false } },
    { enabledMediaCategories: { movie: false } },
    { enabledMediaCategories: { ebook: false } },
    { enabledMediaCategories: { ebook: false } },
    { defaultEnabledMediaCategories: { tv: false } },
    {
      ageGate: {
        defaultRestricted: true,
        maxMovieCertification: 'PG',
        certificationCountry: 'US',
      },
    },
  ]);
});
