import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

for (const permissions of [32, 8796093022208]) {
  test(`download visibility follows the current account permission ${permissions}`, async ({
    page,
  }) => {
    const queries: URLSearchParams[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice('/api/v1'.length);
      if (path === '/downloads/interventions') {
        queries.push(url.searchParams);
        const history = url.searchParams.get('scope') === 'history';
        return route.fulfill({
          json: {
            total: 30,
            partialSources: ['Radarr'],
            truncated: false,
            results: [
              {
                id: 1,
                title: history ? 'Old Download' : 'Current Download',
                serviceName: 'Movies',
                serviceType: 'radarr',
                state: history ? 'resolved' : 'active',
                resolution: history ? 'manual-rejection' : null,
                warnings: ['Needs a library match'],
                actions: history
                  ? [
                      {
                        at: '2026-11-12T12:00:00Z',
                        actorId: 9,
                        action: 'reject',
                        state: 'manual-rejection',
                        options: { blocklist: true, removeFromClient: false },
                      },
                    ]
                  : [],
              },
            ],
          },
        });
      }
      return route.fulfill({
        json:
          path === '/auth/me'
            ? { id: 1, displayName: 'Reader', permissions }
            : {},
      });
    });

    await page.goto(appPath('/me'));
    const entry = page.getByRole('link', { name: 'Open Download Inbox' });
    if (permissions === 32) {
      await expect(
        page.getByRole('heading', { name: 'You', exact: true })
      ).toBeVisible();
      await expect(entry).toHaveCount(0);
      await page.goto(appPath('/downloads'));
      await expect(
        page.getByText('Manage Downloads permission is required.')
      ).toBeVisible();
      expect(queries).toHaveLength(0);
      return;
    }

    await entry.click();
    await expect(
      page.getByText('Current Download', { exact: true })
    ).toBeVisible();
    const partialWarning = page.getByText(
      'Some acquisition services could not be checked. Their warnings may be missing or out of date.',
      { exact: true }
    );
    await expect(partialWarning).toBeVisible();
    const warningColors = await page.evaluate(() => {
      const warning = document.querySelector('.note.wait');
      const probe = document.createElement('span');
      probe.style.color = 'var(--wait)';
      document.body.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return { actual: warning && getComputedStyle(warning).color, expected };
    });
    expect(warningColors.actual).toBe(warningColors.expected);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect.poll(() => queries.at(-1)?.get('page')).toBe('2');
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByText('Old Download', { exact: true })).toBeVisible();
    expect(queries.at(-1)?.get('scope')).toBe('history');
    expect(queries.at(-1)?.get('page')).toBe('1');
    await page.getByText('Action history', { exact: true }).click();
    await expect(
      page.getByText('Client files kept', { exact: false })
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test('manual import sends the chosen target and only eligible files, while rejection keeps source files by default', async ({
  page,
}) => {
  const posts: { path: string; body: unknown }[] = [];
  const fingerprint = 'a'.repeat(64);
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    const base = '/downloads/interventions';
    if (request.method() === 'POST' && path.startsWith(base)) {
      posts.push({ path, body: request.postDataJSON() });
      return route.fulfill({
        json: {
          id: 7,
          state: path.endsWith('/import') ? 'importing' : 'resolved',
        },
      });
    }
    if (path === base)
      return route.fulfill({
        json: {
          total: 1,
          partialSources: [],
          truncated: false,
          results: [
            {
              id: 7,
              title: 'Example Release',
              serviceName: 'Movies',
              serviceType: 'radarr',
              state: 'active',
              warnings: [],
              manualImportCapable: true,
            },
          ],
        },
      });
    if (path === `${base}/7/targets`)
      return route.fulfill({ json: [{ id: 3, title: 'Matched Movie' }] });
    if (path === `${base}/7/preview`) {
      const matched = url.searchParams.get('targetId') === '3';
      return route.fulfill({
        json: {
          target: matched ? { id: 3, title: 'Matched Movie' } : null,
          fingerprint,
          candidates: [
            {
              id: 14,
              name: 'Movie.mkv',
              size: 102400,
              eligible: matched,
              rejections: [],
            },
            {
              id: 15,
              name: 'Sample.mkv',
              size: 1024,
              eligible: false,
              rejections: ['Sample file'],
            },
          ],
        },
      });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Operator', permissions: 8796093022208 }
          : {},
    });
  });
  await page.goto(appPath('/downloads'));
  await page.getByRole('button', { name: 'Preview files' }).click();
  const sheet = page.getByRole('dialog', { name: 'Preview files' });
  await expect(
    sheet.getByRole('button', { name: 'Import selected files' })
  ).toBeDisabled();
  await sheet.getByRole('button', { name: 'Search' }).click();
  await sheet
    .getByRole('button', { name: 'Choose a library match Matched Movie' })
    .click();
  await expect(sheet.getByText('Selected match: Matched Movie')).toBeVisible();
  await expect(
    sheet.getByRole('checkbox', { name: 'Select Sample.mkv' })
  ).toBeDisabled();
  await sheet.getByRole('checkbox', { name: 'Select Movie.mkv' }).check();
  await sheet.getByRole('button', { name: 'Import selected files' }).click();
  await expect(sheet).toHaveCount(0);
  expect(posts).toEqual([
    {
      path: '/downloads/interventions/7/import',
      body: {
        candidateIds: [14],
        importMode: 'copy',
        fingerprint,
        targetId: 3,
      },
    },
  ]);
  await page.getByRole('button', { name: 'Reject download' }).click();
  const reject = page.getByRole('dialog', { name: 'Reject download' });
  await expect(
    reject.getByRole('checkbox', {
      name: 'Remove the download and files from its download client',
    })
  ).not.toBeChecked();
  await reject.getByRole('button', { name: 'Confirm rejection' }).click();
  await expect(reject).toHaveCount(0);
  expect(posts.at(-1)).toEqual({
    path: '/downloads/interventions/7/reject',
    body: { blocklist: true, removeFromClient: false },
  });
});

test('manual import cannot submit an old match while a new library search is pending', async ({
  page,
}, info) => {
  let releaseSearch!: () => void;
  let notifySearchStarted!: () => void;
  const searchStarted = new Promise<void>((resolve) => {
    notifySearchStarted = resolve;
  });
  const pendingSearch = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  let targetSearches = 0;
  const posts: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (request.method() === 'POST') {
      posts.push(path);
      return route.fulfill({ json: { id: 7, state: 'importing' } });
    }
    if (path === '/downloads/interventions')
      return route.fulfill({
        json: {
          total: 1,
          partialSources: [],
          truncated: false,
          results: [
            {
              id: 7,
              title: 'Example Release',
              serviceName: 'Movies',
              serviceType: 'radarr',
              state: 'active',
              warnings: [],
              manualImportCapable: true,
            },
          ],
        },
      });
    if (path === '/downloads/interventions/7/targets') {
      targetSearches++;
      if (targetSearches === 2) {
        notifySearchStarted();
        await pendingSearch;
      }
      const target =
        targetSearches === 1
          ? { id: 3, title: 'Matched Movie' }
          : { id: 4, title: 'Alternate Movie' };
      return route.fulfill({ json: [target] });
    }
    if (path === '/downloads/interventions/7/preview') {
      const matched = url.searchParams.get('targetId') === '3';
      return route.fulfill({
        json: {
          target: matched ? { id: 3, title: 'Matched Movie' } : null,
          fingerprint: 'a'.repeat(64),
          candidates: [
            {
              id: 14,
              name: 'Movie.mkv',
              size: 102400,
              eligible: matched,
              rejections: [],
            },
          ],
        },
      });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Operator', permissions: 8796093022208 }
          : {},
    });
  });

  await page.goto(appPath('/downloads'));
  await page.getByRole('button', { name: 'Preview files' }).click();
  const sheet = page.getByRole('dialog', { name: 'Preview files' });
  await sheet.getByRole('button', { name: 'Search' }).click();
  await sheet
    .getByRole('button', { name: 'Choose a library match Matched Movie' })
    .click();
  await sheet.getByRole('checkbox', { name: 'Select Movie.mkv' }).check();
  await sheet
    .getByRole('searchbox', { name: 'Movie, series, album, or book' })
    .fill('Alternate Movie');
  await sheet.getByRole('button', { name: 'Search' }).click();
  await searchStarted;
  try {
    const submit = sheet.getByRole('button', {
      name: 'Import selected files',
    });
    await expect(submit).toBeDisabled();
    expect(posts).toEqual([]);
    const captureDir = process.env.LUMEN_DOWNLOAD_SEARCH_CAPTURE_DIR;
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name)) {
      await sheet.screenshot({
        path: `${captureDir}/import-pending-candidate-${info.project.name}.png`,
      });
      await submit.evaluate((button) => {
        (button as HTMLButtonElement).disabled = false;
      });
      await sheet.screenshot({
        path: `${captureDir}/import-pending-baseline-${info.project.name}.png`,
      });
      await submit.evaluate((button) => {
        (button as HTMLButtonElement).disabled = true;
      });
      await expect(submit).toBeDisabled();
    }
  } finally {
    releaseSearch();
  }
  await expect(
    sheet.getByRole('button', {
      name: 'Choose a library match Alternate Movie',
    })
  ).toBeVisible();
  await expect(sheet.getByText('Selected match: Matched Movie')).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Import selected files' })
  ).toBeEnabled();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  expect(posts).toEqual([]);
});

test('Download Inbox follows the saved locale at desktop and phone sizes', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_DOWNLOADS_LOCALE ?? ''
  )
    ? (process.env.LUMEN_DOWNLOADS_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const candidate = process.env.LUMEN_CAPTURE_MODE !== 'baseline';
  const labels = {
    en: {
      title: 'Download Inbox',
      description:
        'Review acquisition warnings, select files for manual import, and reject unwanted downloads.',
      active: 'Active warnings',
      history: 'History',
      status: 'Needs attention',
      preview: 'Preview files',
      reject: 'Reject download',
      query: 'Movie, series, album, or book',
      search: 'Search',
      import: 'Import selected files',
      cancel: 'Cancel',
      confirm: 'Confirm rejection',
      blocklist: 'Blocklist this release to avoid downloading it again',
      remove: 'Remove the download and files from its download client',
      resolved: 'Resolved',
      rejected: 'Manually rejected',
      actions: 'Action history',
      actor: 'User 9',
    },
    fr: {
      title: 'Télécharger la boîte de réception',
      description:
        "Examiner les avertissements d'acquisition, sélectionner des fichiers pour l'importation manuelle et rejeter les téléchargements indésirables.",
      active: 'Mises en garde actives',
      history: 'Historique',
      status: "Besoin d'attention",
      preview: 'Aperçu des fichiers',
      reject: 'Rejeter le téléchargement',
      query: 'Film, série, album ou livre',
      search: 'Rechercher',
      import: 'Importer les fichiers sélectionnés',
      cancel: 'Annuler',
      confirm: 'Confirmer le rejet',
      blocklist:
        'Bloquer cette version pour éviter de la télécharger à nouveau',
      remove:
        'Supprimer le téléchargement et les fichiers de son client de téléchargement',
      resolved: 'Résolu',
      rejected: 'Rejeté manuellement',
      actions: "Historique de l'action",
      actor: 'Utilisateur 9',
    },
    ar: {
      title: 'تحميل',
      description:
        'راجع تحذيرات الاستحواذ، وحدد الملفات للاستيراد اليدوي، ورفض التنزيلات غير المرغوب فيها.',
      active: 'تحذيرات نشطة',
      history: 'التاريخ',
      status: 'الحاجة إلى الاهتمام',
      preview: 'ملفات ما قبل الاستعراض',
      reject: 'التحميل',
      query: 'فيلم أو سلسلة أو ألبوم أو كتاب',
      search: 'بحث',
      import: 'ملفات مختارة',
      cancel: 'إلغاء',
      confirm: 'الرفض',
      blocklist: 'احظر هذا الإصدار لتجنّب تنزيله مرة أخرى',
      remove: 'إزالة الحمولة والملفات من عميلها',
      resolved: 'تم الحل',
      rejected: 'رُفضت يدوياً',
      actions: 'تاريخ العمل',
      actor: 'مستعمل 9',
    },
  } as const;
  const expected = (key: keyof (typeof labels)['en'], old: string) =>
    candidate ? labels[locale][key] : old;

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/downloads/interventions') {
      const history = url.searchParams.get('scope') === 'history';
      return route.fulfill({
        json: {
          total: 30,
          partialSources: [],
          truncated: false,
          results: [
            {
              id: 5,
              title: 'Fixture Download',
              serviceName: 'Movies',
              serviceType: 'radarr',
              state: history ? 'resolved' : 'active',
              resolution: history ? 'manual-rejection' : null,
              warnings: ['Fixture warning'],
              manualImportCapable: true,
              actions: history
                ? [
                    {
                      at: '2026-11-12T12:00:00Z',
                      actorId: 9,
                      action: 'reject',
                      state: 'manual-rejection',
                      options: { blocklist: true, removeFromClient: false },
                    },
                  ]
                : [],
            },
          ],
        },
      });
    }
    if (path === '/downloads/interventions/5/preview')
      return route.fulfill({
        json: {
          target: null,
          fingerprint: 'a'.repeat(64),
          candidates: [],
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Operator', permissions: 8796093022208 }
          : {},
    });
  });

  await page.goto(appPath('/downloads'));
  await expect(
    page.getByRole('heading', { name: expected('title', 'Download Inbox') })
  ).toBeVisible();
  if (candidate)
    await expect(page.getByText(labels[locale].description)).toBeVisible();
  await expect(
    page.getByRole('button', { name: expected('active', 'Active Warnings') })
  ).toBeVisible();
  await expect(
    page.getByText('Fixture Download', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(expected('status', 'Needs attention'), { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: expected('preview', 'Preview Files') })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: expected('reject', 'Reject Download') })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/downloads-${candidate ? 'candidate' : 'baseline'}-${locale}-${info.project.name}.png`,
      fullPage: true,
    });
  await page
    .getByRole('button', { name: expected('preview', 'Preview Files') })
    .click();
  const dialogName = candidate
    ? labels[locale].preview
    : 'Preview Download Files';
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('searchbox', {
      name: expected('query', 'Search This Service Library'),
    })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: expected('search', 'Search Library') })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', {
      name: expected('import', 'Import Selected Files'),
    })
  ).toBeDisabled();
  const searchControlBounds = await dialog.evaluate((element) => {
    const form = element.querySelector('form.toolbar');
    const field = form?.querySelector('label.search');
    const button = form?.querySelector('button');
    const bounds = (item: Element | null | undefined) => {
      if (!item) return null;
      const { left, right } = item.getBoundingClientRect();
      return { left, right };
    };
    return {
      sheet: bounds(element),
      field: bounds(field),
      button: bounds(button),
    };
  });
  expect(searchControlBounds.sheet).not.toBeNull();
  expect(searchControlBounds.field).not.toBeNull();
  expect(searchControlBounds.button).not.toBeNull();
  expect(searchControlBounds.field!.left).toBeGreaterThanOrEqual(
    searchControlBounds.sheet!.left
  );
  expect(searchControlBounds.button!.right).toBeLessThanOrEqual(
    searchControlBounds.sheet!.right
  );
  const modeBounds = await dialog
    .locator('label.sel[data-layout="stacked"] select')
    .boundingBox();
  expect(modeBounds).not.toBeNull();
  expect(modeBounds!.width).toBeGreaterThan(200);
  expect(modeBounds!.x + modeBounds!.width).toBeLessThanOrEqual(
    searchControlBounds.sheet!.right
  );
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/downloads-action-${candidate ? 'candidate' : 'baseline'}-${locale}-${info.project.name}.png`,
    });
  await dialog
    .getByRole('button', { name: expected('cancel', 'Cancel') })
    .click();
  await page
    .getByRole('button', { name: expected('reject', 'Reject Download') })
    .click();
  const rejectDialog = page.getByRole('dialog', {
    name: candidate ? labels[locale].reject : 'Reject Download',
  });
  await expect(rejectDialog).toBeVisible();
  await expect(
    rejectDialog.getByRole('checkbox', {
      name: expected('blocklist', 'Blocklist This Release'),
    })
  ).toBeChecked();
  await expect(
    rejectDialog.getByRole('checkbox', {
      name: expected('remove', 'Remove the Download and Files From Its Client'),
    })
  ).not.toBeChecked();
  await expect(
    rejectDialog.getByRole('button', {
      name: expected('confirm', 'Confirm Rejection'),
    })
  ).toBeVisible();
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/downloads-reject-${candidate ? 'candidate' : 'baseline'}-${locale}-${info.project.name}.png`,
    });
  await rejectDialog
    .getByRole('button', { name: expected('cancel', 'Cancel') })
    .click();
  await page
    .getByRole('button', { name: expected('history', 'History') })
    .click();
  await expect(
    page.getByText(expected('resolved', 'Resolved'), { exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByText(expected('rejected', 'Manually rejected'), { exact: true })
      .first()
  ).toBeVisible();
  await page
    .getByText(expected('actions', 'Action History'), { exact: true })
    .click();
  await expect(
    page.getByText(expected('actor', 'User 9'), { exact: false })
  ).toBeVisible();
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/downloads-history-${candidate ? 'candidate' : 'baseline'}-${locale}-${info.project.name}.png`,
      fullPage: true,
    });
});
