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
    page.getByRole('heading', { name: 'Default Request Folders' })
  ).toHaveCount(0);
  await expect(
    page.locator('dd').getByText('User', { exact: true })
  ).toBeVisible();
});

test('request folders preserve service choices and confirm persisted values', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_ROOT_FOLDER_LOCALE ?? ''
  )
    ? (process.env.LUMEN_ROOT_FOLDER_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const labels = {
    en: {
      title: 'Default Request Folders',
      movie: 'Movies · radarr one',
      unavailable: 'Saved folder (not currently offered)',
      save: 'Save Request Folders',
    },
    fr: {
      title: 'Dossiers de destination par défaut',
      movie: 'Films · radarr one',
      unavailable: 'Dossier enregistré (actuellement indisponible)',
      save: 'Enregistrer les dossiers de demande',
    },
    ar: {
      title: 'مجلدات الطلب الافتراضية',
      movie: 'الأفلام · radarr one',
      unavailable: 'المجلد المحفوظ (غير متاح حاليًا)',
      save: 'حفظ مجلدات الطلب',
    },
  } as const;
  const profile = { username: 'Viewer', locale };
  let folders: Record<string, string> = { 'radarr:1': '/legacy' };
  const writes: unknown[] = [];
  let rejectNextSave = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          displayName: 'Viewer',
          permissions: 8192,
          userType: 2,
        },
      });
    if (path === '/user/2/settings/main') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push(body);
        if (rejectNextSave) {
          rejectNextSave = false;
          return route.fulfill({ status: 503, json: {} });
        }
        Object.assign(profile, body);
        folders = body.requestRootFolders;
      }
      return route.fulfill({ json: profile });
    }
    if (path === '/user/2/settings/request-root-folders')
      return route.fulfill({ json: folders });
    if (/^\/service\/(radarr|sonarr|lidarr|readarr)$/.test(path)) {
      const type = path.split('/')[2];
      return route.fulfill({
        json: [{ id: 1, name: `${type} one`, serviceType: 'ebook' }],
      });
    }
    if (/^\/service\/(radarr|sonarr|lidarr|readarr)\/1$/.test(path))
      return route.fulfill({
        json: {
          rootFolders: [{ path: '/media/primary' }, { path: '/media/alt' }],
        },
      });
    if (path === '/service/comic')
      return route.fulfill({
        json: [{ id: 3, name: 'Kapowarr', backendType: 'kapowarr' }],
      });
    if (path === '/service/comic/3/rootfolders')
      return route.fulfill({ json: { rootFolders: [{ path: '/comics' }] } });
    if (path === '/user/2/settings/password')
      return route.fulfill({ json: { hasPassword: true } });
    if (path === '/user/2/settings/discover-book-sections')
      return route.fulfill({
        json: {
          sections: [
            { key: 'popular:ebook', enabled: true },
            { key: 'popular:audiobook', enabled: true },
          ],
        },
      });
    if (path === '/languages') return route.fulfill({ json: [] });
    if (path === '/request/lists') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/me/account'));
  const title = page.getByRole('heading', { name: labels[locale].title });
  await expect(title).toBeVisible();
  const radarr = page.getByLabel(labels[locale].movie);
  await expect(radarr).toHaveValue('/legacy');
  await expect(radarr.locator('option[value="/legacy"]')).toHaveText(
    labels[locale].unavailable
  );
  if (process.env.LUMEN_ROOT_FOLDER_CAPTURE_DIR) {
    const project = await page.evaluate(() =>
      innerWidth < 600 ? 'iphone' : 'desktop'
    );
    await page.screenshot({
      path: `${process.env.LUMEN_ROOT_FOLDER_CAPTURE_DIR}/account-${project}.png`,
      fullPage: true,
      scale: 'css',
      animations: 'disabled',
    });
  }
  await radarr.selectOption('/media/alt');
  await page.getByRole('button', { name: labels[locale].save }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(radarr).toHaveValue('/media/alt');
  await expect(
    page.getByRole('button', { name: labels[locale].save })
  ).toBeEnabled();
  await page.getByRole('button', { name: labels[locale].save }).click();
  await expect(radarr).toHaveValue('/media/alt');
  expect(writes).toEqual([
    { requestRootFolders: { 'radarr:1': '/media/alt' } },
    { requestRootFolders: { 'radarr:1': '/media/alt' } },
  ]);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
});

test('external request lists connect, sync, import CSV and remove through account settings', async ({
  page,
}, testInfo) => {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let lists = [
    {
      id: 7,
      provider: 'imdb',
      sourceUrl: 'https://www.imdb.com/user/ur12345678/watchlist/',
      lastSyncedAt: null,
      lastSyncError: null,
    },
  ];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (['POST', 'DELETE'].includes(request.method())) {
      const body = request.postData();
      calls.push({
        method: request.method(),
        path,
        ...(body ? { body: JSON.parse(body) } : {}),
      });
    }
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Viewer', permissions: 32, userType: 2 },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({ json: { username: 'Viewer' } });
    if (path === '/user/2/settings/password')
      return route.fulfill({ json: { hasPassword: true } });
    if (path === '/user/2/settings/card-text')
      return route.fulfill({ json: {} });
    if (path === '/user/2/settings/discover-book-sections')
      return route.fulfill({
        json: {
          sections: [
            { key: 'popular:ebook', enabled: true },
            { key: 'popular:audiobook', enabled: true },
          ],
        },
      });
    if (path === '/languages') return route.fulfill({ json: [] });
    if (path === '/request/lists' && request.method() === 'GET')
      return route.fulfill({ json: lists });
    if (path === '/request/lists' && request.method() === 'POST') {
      lists = [
        ...lists,
        {
          id: 8,
          provider: 'goodreads',
          sourceUrl: String(request.postDataJSON().url),
          lastSyncedAt: null,
          lastSyncError: null,
        },
      ];
      return route.fulfill({ status: 201, json: lists[1] });
    }
    if (path === '/request/lists/hardcover')
      return route.fulfill({ status: 201, json: { validatedBooks: 3 } });
    if (path === '/request/lists/7/sync')
      return route.fulfill({
        json: { requested: 2, alreadyRequested: 1, unmatched: 3, failed: 0 },
      });
    if (path === '/request/lists/7/import')
      return route.fulfill({
        json: { requested: 1, alreadyRequested: 0, unmatched: 0, failed: 0 },
      });
    if (path === '/request/lists/7' && request.method() === 'DELETE') {
      lists = lists.filter((list) => list.id !== 7);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/me/account'));
  await expect(
    page.getByRole('heading', { name: 'External Request Lists' })
  ).toBeVisible();
  if (process.env.LUMEN_EXTERNAL_LIST_CAPTURE_DIR) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(process.env.LUMEN_EXTERNAL_LIST_CAPTURE_DIR, {
      recursive: true,
    });
    await page.screenshot({
      path: `${process.env.LUMEN_EXTERNAL_LIST_CAPTURE_DIR}/account-${testInfo.project.name}.png`,
      fullPage: true,
      scale: 'css',
      animations: 'disabled',
    });
  }
  await page
    .getByLabel('Public List URL')
    .fill('https://www.goodreads.com/review/list/123');
  await page.getByRole('button', { name: 'Add List' }).click();
  await expect(
    page.getByRole('link', {
      name: 'https://www.goodreads.com/review/list/123',
    })
  ).toBeVisible();
  await page.getByLabel('Hardcover API Token').fill('x'.repeat(20));
  await page.getByRole('button', { name: 'Connect Hardcover' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Books found on your shelf: 3' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sync Now' }).first().click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '2 requested, 1 already requested' })
  ).toBeVisible();
  await page.getByLabel('Import IMDb CSV').setInputFiles({
    name: 'watchlist.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Const,Title\ntt1234567,Test Title\n'),
  });
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '1 requested, 0 already requested' })
  ).toBeVisible();
  expect(calls).toContainEqual({
    method: 'POST',
    path: '/request/lists/7/import',
    body: { itemIds: ['tt1234567'] },
  });
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await expect(
    page.getByRole('link', {
      name: 'https://www.imdb.com/user/ur12345678/watchlist/',
    })
  ).toHaveCount(0);
  expect(calls).toContainEqual({
    method: 'POST',
    path: '/request/lists',
    body: { url: 'https://www.goodreads.com/review/list/123' },
  });
  expect(calls).toContainEqual({
    method: 'POST',
    path: '/request/lists/hardcover',
    body: { apiToken: 'x'.repeat(20) },
  });
  expect(calls).toContainEqual({
    method: 'DELETE',
    path: '/request/lists/7',
    body: undefined,
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
});

test('book home sections preserve order and enabled state through settings readback', async ({
  page,
}) => {
  const defaults = [
    { key: 'popular:ebook', enabled: true },
    { key: 'popular:audiobook', enabled: true },
  ];
  let sections = defaults;
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Viewer', permissions: 32, userType: 2 },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({ json: { username: 'Viewer' } });
    if (path === '/user/2/settings/password')
      return route.fulfill({ json: { hasPassword: true } });
    if (path === '/user/2/settings/discover-book-sections') {
      if (request.method() === 'POST') {
        sections = request.postDataJSON().sections;
        writes.push(request.postDataJSON());
      }
      return route.fulfill({ json: { sections } });
    }
    if (path === '/request/lists') return route.fulfill({ json: [] });
    if (path === '/languages') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/me/account'));
  await expect(
    page.getByRole('heading', { name: 'Book and Audiobook Home Sections' })
  ).toBeVisible();
  const picker = page.locator('#book-home-section-add');
  await picker.selectOption('new:ebook');
  await page.getByRole('button', { name: 'Add Section' }).click();
  const newRow = page.locator('.set').filter({ hasText: 'New Books' });
  await newRow.getByRole('button', { name: 'Move Up' }).click();
  await newRow.getByRole('button', { name: 'Move Up' }).click();
  const enabled = newRow.getByRole('checkbox');
  await enabled.uncheck();
  await page.getByRole('button', { name: 'Save Sections' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Book home sections saved.' })
  ).toBeVisible();
  expect(writes).toEqual([
    {
      sections: [
        { key: 'new:ebook', enabled: false },
        { key: 'popular:ebook', enabled: true },
        { key: 'popular:audiobook', enabled: true },
      ],
    },
  ]);
  await expect(picker.locator('option[value="new:ebook"]')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
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

for (const locale of ['fr', 'ar']) {
  test(`account profile actions and notices are localized in ${locale}`, async ({
    page,
  }, testInfo) => {
    const profile = {
      username: 'Viewer',
      email: 'viewer@example.test',
      locale,
    };
    let postCount = 0;
    let failReadback = false;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 2,
            displayName: profile.username,
            permissions: 0,
            userType: 1,
          },
        });
      if (path === '/user/2/settings/main') {
        if (request.method() === 'POST') {
          postCount += 1;
          if (postCount === 1) return route.fulfill({ status: 503, json: {} });
          if (postCount === 2) return route.fulfill({ status: 403, json: {} });
          const body = request.postDataJSON() as { username: string };
          profile.username =
            postCount === 3 ? 'Server Accepted' : body.username;
          if (postCount === 4) failReadback = true;
          return route.fulfill({ json: profile });
        }
        if (failReadback) {
          failReadback = false;
          return route.fulfill({ status: 503, json: {} });
        }
        return route.fulfill({
          json: profile,
        });
      }
      if (path === '/user/2/settings/password')
        return route.fulfill({ json: { hasPassword: false } });
      if (path === '/languages')
        return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: {} });
    });

    await page.goto(appPath('./me/account'));
    const expected =
      locale === 'fr'
        ? {
            label: 'Nom affiché',
            save: 'Enregistrer les modifications',
            failure:
              'Impossible d’enregistrer le profil. Vérifiez les valeurs et réessayez.',
            forbidden:
              'Vous n’avez pas l’autorisation de modifier ces paramètres.',
            mismatch:
              'SeerrNG a enregistré des valeurs différentes. Vérifiez le profil mis à jour.',
            confirm:
              'SeerrNG a accepté l’enregistrement, mais le profil mis à jour n’a pas pu être chargé.',
            languages: 'Impossible de charger les langues des médias',
            serverFailure:
              'Le serveur a rencontré un problème. Réessayez dans un instant.',
            retry: 'Réessayer',
            plex: 'Géré par Plex.',
            noPermissions:
              'Aucune autorisation supplémentaire n’est attribuée à ce compte.',
          }
        : {
            label: 'إسم العرض',
            save: 'حفظ التغييرات',
            failure: 'تعذّر حفظ الملف الشخصي. تحقق من القيم وحاول مجدداً.',
            forbidden: 'ليست لديك صلاحية لتغيير هذه الإعدادات.',
            mismatch: 'حفظ SeerrNG قيماً مختلفة. راجع الملف الشخصي المحدّث.',
            confirm: 'قبل SeerrNG الحفظ، لكن تعذّر تحميل الملف الشخصي المحدّث.',
            languages: 'تعذّر تحميل لغات الوسائط',
            serverFailure: 'واجه الخادم مشكلة. حاول مجدداً بعد قليل.',
            retry: 'إعادة المحاولة',
            plex: 'تدير Plex هذا الإعداد.',
            noPermissions: 'لم تُمنح لهذا الحساب صلاحيات إضافية.',
          };
    await expect(page.getByText(expected.languages)).toBeVisible();
    await expect(page.getByText(expected.serverFailure)).toBeVisible();
    await expect(
      page.getByRole('button', { name: expected.retry }).first()
    ).toBeVisible();
    await expect(page.getByText(expected.plex)).toBeVisible();
    await expect(page.getByText(expected.noPermissions)).toBeVisible();
    await page.getByLabel(expected.label).fill('First Attempt');
    const save = page.getByRole('button', { name: expected.save });
    await save.click();
    await expect(page.getByText(expected.failure)).toBeVisible();
    if (
      process.env.LUMEN_VISUAL_CAPTURE_DIR &&
      ['desktop', 'iphone'].includes(testInfo.project.name)
    ) {
      await page.screenshot({
        path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/candidate-${locale}-${testInfo.project.name}-profile-error.png`,
        fullPage: true,
      });
    }
    await page.getByLabel(expected.label).fill('Forbidden Attempt');
    await save.click();
    await expect(page.getByText(expected.forbidden)).toBeVisible();
    await page.getByLabel(expected.label).fill('Mismatched Attempt');
    await save.click();
    await expect(page.getByText(expected.mismatch)).toBeVisible();
    await page.getByLabel(expected.label).fill('Unreadable Attempt');
    await save.click();
    await expect(page.getByText(expected.confirm)).toBeVisible();
  });
}

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
  // The mobile tab bar yields while scrolling through this long form. Return to
  // its visible state before checking the newly localized navigation labels.
  await page.evaluate(() => window.scrollTo(0, 0));
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
  await page.evaluate(() => window.scrollTo(0, 0));
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

test('account applies the shared built-in theme preset and preserves overrides', async ({
  page,
}) => {
  const overrides: Record<string, string | number> = {
    '--theme-page-spotlight-strength': 0.5,
    '--theme-page-bg': '#112233',
  };
  let submitted: Record<string, string | number | null> | undefined;
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
      submitted = request.postDataJSON().changes;
      for (const [key, value] of Object.entries(submitted ?? {})) {
        if (typeof value === 'string' || typeof value === 'number')
          overrides[key] = value;
        else delete overrides[key];
      }
      return route.fulfill({ json: { advancedThemeOverrides: overrides } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('./me/account#advanced-theme'));
  await page.locator('#advanced-theme').scrollIntoViewIfNeeded();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/candidate-${page.viewportSize()?.width}.png`,
    });
  await page.getByLabel('Page Background').fill('#445566');
  await page.getByLabel('Built-in Theme Preset').selectOption('john-redesign');
  await page.getByRole('button', { name: 'Apply Theme Preset' }).click();
  await expect(page.getByText('Theme colors saved.')).toBeVisible();
  expect(submitted?.preset).toBe('john-redesign');
  expect(submitted?.['--palette-blue']).toBe('#0051d4');
  expect(submitted?.['--theme-page-bg']).toBe('#445566');
  expect(overrides['--theme-page-bg']).toBe('#445566');
  expect(overrides['--theme-page-spotlight-strength']).toBe(0.5);
  await expect(page.getByLabel('Page Background')).toHaveValue('#445566');
  await page.getByRole('button', { name: 'Edit All Overrides' }).click();
  const editor = page.getByLabel('Theme Override JSON');
  await editor.fill('{"--theme-control-border":"#abcdef"}');
  await page.getByLabel('Built-in Theme Preset').selectOption('john-redesign');
  await page.getByRole('button', { name: 'Apply Theme Preset' }).click();
  await expect.poll(() => overrides['--theme-control-border']).toBe('#abcdef');
  expect(overrides['--theme-page-bg']).toBe('#445566');
  expect(overrides['--theme-page-spotlight-strength']).toBe(0.5);
  await page.getByRole('button', { name: 'Edit Theme Colors' }).click();
  await expect(page.getByLabel('Page Background')).toHaveValue('#445566');
  await page.getByLabel('Built-in Theme Preset').scrollIntoViewIfNeeded();
  await expect(page.getByText(/Applying a preset saves it/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test('account resets all saved theme overrides together', async ({ page }) => {
  const overrides: Record<string, string | number> = {
    preset: 'john-redesign',
    '--theme-page-bg': '#112233',
    '--theme-page-spotlight-strength': 0.5,
  };
  let submitted: Record<string, string | number | null> | undefined;
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
      submitted = request.postDataJSON().changes;
      for (const [key, value] of Object.entries(submitted ?? {})) {
        if (typeof value === 'string' || typeof value === 'number')
          overrides[key] = value;
        else delete overrides[key];
      }
      return route.fulfill({ json: { advancedThemeOverrides: overrides } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('./me/account#advanced-theme'));
  await page.getByRole('button', { name: 'Reset Theme Overrides' }).click();
  await expect(page.getByText('Theme overrides cleared.')).toBeVisible();
  expect(submitted).toEqual({
    preset: null,
    '--theme-page-bg': null,
    '--theme-page-spotlight-strength': null,
  });
  expect(overrides).toEqual({});
  await expect(page.getByLabel('Page Background')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Reset Theme Overrides' })
  ).toBeDisabled();
});

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
    const tabs = page.locator('nav.tabbar[aria-label="Tabs"]');
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
