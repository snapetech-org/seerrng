import { expect, test } from '@playwright/test';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_REQUEST_STATUS_LOCALE ?? ''
)
  ? (process.env.LUMEN_REQUEST_STATUS_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';
const baseline = process.env.LUMEN_STATUS_BASELINE === '1';
const detailBaseline = process.env.LUMEN_REQUEST_DETAIL_BASELINE === '1';
const actionBaseline = process.env.LUMEN_REQUEST_ACTION_BASELINE === '1';
const moderationBaseline = process.env.LUMEN_MODERATION_BASELINE === '1';
const rowBaseline = process.env.LUMEN_REQUEST_ROW_BASELINE === '1';
const partialBaseline = process.env.LUMEN_REQUEST_PARTIAL_BASELINE === '1';
const requestLinkBaseline = process.env.LUMEN_REQUEST_LINK_BASELINE === '1';
const mediaLinkBaseline = process.env.LUMEN_MEDIA_LINK_BASELINE === '1';

const labels = {
  en: {
    waiting: 'Waiting for approval',
    approved: 'Approved',
    searching: 'Searching',
    queued: 'Queued',
    downloading: 'Downloading 37%',
    importing: 'Importing',
    checking: 'Checking library',
    failed: 'Couldn’t get it',
    declined: 'Declined',
    cancelled: 'Cancelled',
    unavailable: 'Unavailable',
    unknown: 'Status unavailable',
    differentEdition: 'Different edition in library',
    differentEditionDetail:
      'This book is in your library in another edition than the one requested.',
    inLibrary: 'In library',
    fourK: '4K on Plex',
    overQuota: 'Over quota',
    autoQueued: 'Auto-Queued',
    episodeQueue: 'Episode Queue · 2 ahead',
    eta: 'About 3 min left',
    airing: 'New episodes added as they air',
    fewMissing: 'A few episodes missing',
    seasonMissing: 'Season 1 not found yet',
    seasonsMissing: 'Seasons 1, 3–4 not found yet',
    invalidLink: 'This request link is invalid.',
    watchOn: 'Watch on Plex',
    listenOn: 'Listen on Plex',
  },
  fr: {
    waiting: 'En attente d’approbation',
    approved: 'Approuvé',
    searching: 'Recherche en cours',
    queued: 'En attente de téléchargement',
    downloading: 'Téléchargement à 37 %',
    importing: 'Importation en cours',
    checking: 'Vérification de la bibliothèque',
    failed: 'Impossible à obtenir',
    declined: 'Refusé',
    cancelled: 'Annulé',
    unavailable: 'Indisponible',
    unknown: 'Statut indisponible',
    differentEdition: 'Édition différente dans la bibliothèque',
    differentEditionDetail:
      'Ce livre est dans votre bibliothèque dans une autre édition que celle demandée.',
    inLibrary: 'Dans la bibliothèque',
    fourK: '4K sur Plex',
    overQuota: 'Quota dépassé',
    autoQueued: 'Ajout automatique',
    episodeQueue: 'File d’attente des épisodes · 2 à venir',
    eta: 'Environ 3 min restantes',
    airing:
      'Les nouveaux épisodes sont ajoutés au fur et à mesure de leur diffusion',
    fewMissing: 'Quelques épisodes sont manquants',
    seasonMissing: 'Saison 1 introuvable pour le moment',
    seasonsMissing: 'Saisons 1, 3–4 introuvables pour le moment',
    invalidLink: 'Ce lien de demande n’est pas valide.',
    watchOn: 'Regarder sur Plex',
    listenOn: 'Écouter sur Plex',
  },
  ar: {
    waiting: 'بانتظار الموافقة',
    approved: 'تمت الموافقة',
    searching: 'جارٍ البحث',
    queued: 'في قائمة الانتظار',
    downloading: 'جارٍ التنزيل بنسبة 37%',
    importing: 'جارٍ الاستيراد',
    checking: 'جارٍ التحقق من المكتبة',
    failed: 'تعذر الحصول عليه',
    declined: 'مرفوض',
    cancelled: 'ملغى',
    unavailable: 'غير متاح',
    unknown: 'الحالة غير متاحة',
    differentEdition: 'إصدار مختلف في المكتبة',
    differentEditionDetail:
      'هذا الكتاب موجود في مكتبتك بإصدار مختلف عن الإصدار المطلوب.',
    inLibrary: 'في المكتبة',
    fourK: 'بدقة 4K على Plex',
    overQuota: 'تجاوز الحصة',
    autoQueued: 'مضاف تلقائيًا',
    episodeQueue: 'قائمة انتظار الحلقات · 2 قادمة',
    eta: 'متبقي نحو 3 دقيقة',
    airing: 'تُضاف الحلقات الجديدة عند عرضها',
    fewMissing: 'بعض الحلقات مفقودة',
    seasonMissing: 'الموسم 1 غير موجود بعد',
    seasonsMissing: 'المواسم 1, 3–4 غير موجودة بعد',
    invalidLink: 'رابط الطلب هذا غير صالح.',
    watchOn: 'شاهد على Plex',
    listenOn: 'استمع على Plex',
  },
} as const;

const statuses = [
  ['waiting', 'requested', 1, {}],
  ['approved', 'approved', 2, {}],
  ['searching', 'searching', 2, {}],
  ['queued', 'downloading', 2, { percent: 0 }],
  ['downloading', 'downloading', 2, { percent: 37 }],
  ['importing', 'importing', 2, {}],
  ['checking', 'library', 2, {}],
  ['failed', 'failed', 2, {}],
  ['declined', 'declined', 2, {}],
  ['cancelled', 'cancelled', 2, {}],
  ['unavailable', 'unavailable', 2, {}],
  ['unknown', 'future-stage', 2, {}],
  ['differentEdition', 'library', 5, { differentEdition: true }],
  ['inLibrary', 'available', 2, {}],
  ['overQuota', 'requested', 1, { quotaException: true }],
] as const;

const request = (
  id: number,
  stage: string,
  requestStatus: number,
  options: {
    percent?: number;
    differentEdition?: boolean;
    quotaException?: boolean;
  } = {}
) => ({
  id,
  type: 'book',
  status: requestStatus,
  bookFormat: options.differentEdition ? 'ebook' : 'audiobook',
  is4k: false,
  ...(options.differentEdition
    ? { preferredEditionId: `provider:edition-${id}` }
    : {}),
  ...(options.quotaException ? { quotaException: true } : {}),
  createdAt: '2026-11-08T12:00:00Z',
  requestedBy: { id: 1, displayName: 'reader' },
  media: {
    mediaType: 'book',
    tmdbId: 0,
    status: 5,
    availableEbookServiceIds: options.differentEdition ? [0] : [],
    availableAudiobookServiceIds: [],
    identifiers: [{ provider: 'openlibrary', value: `OL${id}W` }],
  },
  currentStatus: {
    stage,
    ...(options.percent === undefined ? {} : { percent: options.percent }),
  },
});

const tvRequest = (id: number, airing: boolean | null, seasons: number[]) => ({
  ...request(id, 'requested', 2),
  type: 'tv',
  seasons: seasons.map((seasonNumber) => ({ seasonNumber })),
  airing,
  currentStatus: undefined,
  media: {
    mediaType: 'tv',
    tmdbId: id,
    status: 4,
    seasons:
      airing === null
        ? []
        : seasons.map((seasonNumber) => ({ seasonNumber, status: 4 })),
  },
});

const requests = [
  ...statuses.map(([, stage, requestStatus, options], index) => ({
    ...request(601 + index, stage, requestStatus, options),
    ...(index === 0 ? { watchAheadParentRequestId: 500 } : {}),
    ...(index === 1 ? { watchAheadEpisodeCount: 2 } : {}),
  })),
  {
    ...request(621, 'downloading', 2),
    currentStatus: undefined,
    media: {
      mediaType: 'book',
      tmdbId: 0,
      status: 2,
      audiobookDownloadStatus: [
        { size: 100, sizeLeft: 80, timeLeft: '00:03:00' },
      ],
      identifiers: [{ provider: 'openlibrary', value: 'OL621W' }],
    },
  },
  {
    ...request(620, 'available', 2),
    type: 'movie',
    is4k: true,
    media: {
      mediaType: 'movie',
      tmdbId: 620,
      status: 5,
      status4k: 5,
      downloadStatus4k: [],
      mediaUrl4k: 'https://plex.example/library/metadata/620',
    },
  },
  {
    ...request(640, 'available', 2),
    type: 'music',
    media: {
      mediaType: 'music',
      mbId: 'fixture-album',
      status: 5,
      mediaUrl: 'https://plex.example/library/metadata/640',
    },
  },
  tvRequest(630, true, [1]),
  tvRequest(631, false, [1]),
  tvRequest(632, null, [1]),
  tvRequest(633, null, [1, 3, 4]),
];

test(`request lifecycle statuses follow ${locale}`, async ({ page }) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/request/status')
      return route.fulfill({
        status: 404,
        json: { message: 'Lifecycle fixture is not needed for all requests.' },
      });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'reader', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          musicEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path.startsWith('/book/')) {
      const bookId = decodeURIComponent(path.split('/').pop() ?? '');
      const id = Number(bookId.match(/OL(\d+)W/)?.[1]);
      return route.fulfill({
        json: { id: bookId, title: `Status ${id}`, author: 'Reader' },
      });
    }
    if (path.startsWith('/tv/')) {
      const id = Number(path.split('/').pop());
      return route.fulfill({
        json: {
          id,
          title: `TV ${id}`,
          name: `TV ${id}`,
          status: id === 630 ? 'Returning Series' : 'Ended',
        },
      });
    }
    if (path === '/movie/620')
      return route.fulfill({
        json: { id: 620, title: 'Fixture 4K movie', releaseDate: '2020-01-01' },
      });
    if (path === '/music/fixture-album')
      return route.fulfill({
        json: {
          id: 'fixture-album',
          title: 'Fixture music album',
          artist: { name: 'Fixture Artist' },
        },
      });
    if (path === '/request') {
      const results =
        url.searchParams.get('filter') === 'processing' ? [] : requests;
      return route.fulfill({
        json: { pageInfo: { pages: 1, results: results.length }, results },
      });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/requests?tab=all');
  await expect(page.locator('.rq')).toHaveCount(22);
  const expected = baseline
    ? {
        ...labels.en,
        queued: labels[locale].queued,
        downloading: labels[locale].downloading,
        inLibrary: labels[locale].inLibrary,
        overQuota: 'Over Quota',
      }
    : labels[locale];
  for (const [index, [key]] of statuses.entries()) {
    const row = page.locator('.rq').nth(index);
    await expect(row).toBeVisible();
    await expect(row.locator('.st')).toContainText(expected[key]);
  }
  await expect(page.locator('.rq').nth(12).locator('.d')).toContainText(
    detailBaseline
      ? labels.en.differentEditionDetail
      : labels[locale].differentEditionDetail
  );
  const overQuota = page.locator('.rq').nth(14);
  await expect(overQuota.locator('.st')).toContainText(expected.overQuota);
  const autoQueued = page.locator('.rq').nth(0).locator('.st');
  const episodeQueue = page.locator('.rq').nth(1).locator('.st');
  const eta = page.locator('.rq').nth(15).locator('.st');
  await expect(autoQueued).toContainText(
    rowBaseline ? 'Auto-Queued' : labels[locale].autoQueued
  );
  await expect(episodeQueue).toContainText(
    rowBaseline ? 'Episode Queue · 2 ahead' : labels[locale].episodeQueue
  );
  await expect(eta).toContainText(
    rowBaseline ? 'About 3 min left' : labels[locale].eta
  );
  const fourK = page
    .locator('.rq')
    .filter({ hasText: 'Fixture 4K movie' })
    .locator('.st');
  await expect(fourK).toContainText(expected.fourK);
  const fourKPlay = page
    .locator('.rq')
    .filter({ hasText: 'Fixture 4K movie' })
    .locator('a.btn-ok');
  await expect(fourKPlay).toHaveText(
    mediaLinkBaseline ? 'Watch on Plex' : labels[locale].watchOn
  );
  const musicPlay = page
    .locator('.rq')
    .filter({ hasText: 'Fixture music album' })
    .locator('a.btn-ok');
  await expect(musicPlay).toHaveText(
    mediaLinkBaseline ? 'Listen on Plex' : labels[locale].listenOn
  );
  const tvDetail = (id: number) =>
    page
      .locator('.rq')
      .filter({ hasText: `TV ${id}` })
      .locator('.st');
  await expect(tvDetail(630)).toContainText(
    partialBaseline ? labels.en.airing : labels[locale].airing
  );
  await expect(tvDetail(631)).toContainText(
    partialBaseline ? labels.en.fewMissing : labels[locale].fewMissing
  );
  await expect(tvDetail(632)).toContainText(
    partialBaseline ? labels.en.seasonMissing : labels[locale].seasonMissing
  );
  await expect(tvDetail(633)).toContainText(
    partialBaseline ? labels.en.seasonsMissing : labels[locale].seasonsMissing
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  const captureDir = process.env.LUMEN_STATUS_CAPTURE_DIR;
  const width = page.viewportSize()?.width;
  if (captureDir && (width === 1440 || width === 390))
    await page.screenshot({
      path: `${captureDir}/${locale}-${width}.png`,
      fullPage: true,
    });

  const actionCopy = actionBaseline
    ? {
        history: 'History',
        cancel: 'Cancel',
        cancelTitle: 'Cancel this request?',
        cancelBody:
          'Status 601 won’t be fetched. You can ask for it again later.',
        confirmCancel: 'Cancel request',
        keep: 'Keep it',
        declineTitle: 'Decline this request?',
        declineButton: { en: 'Decline', fr: 'Refuser', ar: 'رفض' }[locale],
        declineBody:
          'Status 601 won’t be fetched, and the person who asked will see it was declined.',
        confirmDecline: 'Decline request',
      }
    : {
        en: {
          history: 'History',
          cancel: 'Cancel',
          cancelTitle: 'Cancel this request?',
          cancelBody:
            'Status 601 won’t be fetched. You can ask for it again later.',
          confirmCancel: 'Cancel request',
          keep: 'Keep it',
          declineTitle: 'Decline this request?',
          declineButton: 'Decline',
          declineBody:
            'Status 601 won’t be fetched, and the person who asked will see it was declined.',
          confirmDecline: 'Decline request',
        },
        fr: {
          history: 'Historique',
          cancel: 'Annuler',
          cancelTitle: 'Annuler cette demande ?',
          cancelBody:
            'Status 601 ne sera pas téléchargé. Vous pourrez le demander à nouveau plus tard.',
          confirmCancel: 'Annuler la demande',
          keep: 'Conserver',
          declineTitle: 'Refuser cette demande ?',
          declineButton: 'Refuser',
          declineBody:
            'Status 601 ne sera pas récupéré et la personne qui l’a demandé verra qu’elle a été refusée.',
          confirmDecline: 'Refuser la demande',
        },
        ar: {
          history: 'السجل',
          cancel: 'إلغاء',
          cancelTitle: 'إلغاء هذا الطلب؟',
          cancelBody: 'لن يتم جلب Status 601. يمكنك طلبه مرة أخرى لاحقًا.',
          confirmCancel: 'إلغاء الطلب',
          keep: 'الاحتفاظ به',
          declineTitle: 'رفض هذا الطلب؟',
          declineButton: 'رفض',
          declineBody: 'لن يتم جلب Status 601، وسيرى مقدم الطلب أنه رُفض.',
          confirmDecline: 'رفض الطلب',
        },
      }[locale];
  const moderationCopy = moderationBaseline
    ? {
        declineTitle: 'Decline this request?',
        declineBody:
          'Status 601 won’t be fetched, and the person who asked will see it was declined.',
        confirmDecline: 'Decline request',
        cancelledToast: 'Request cancelled',
      }
    : {
        en: {
          declineTitle: 'Decline this request?',
          declineBody:
            'Status 601 won’t be fetched, and the person who asked will see it was declined.',
          confirmDecline: 'Decline request',
          cancelledToast: 'Request cancelled',
        },
        fr: {
          declineTitle: 'Refuser cette demande ?',
          declineBody:
            'Status 601 ne sera pas récupéré et la personne qui l’a demandé verra qu’elle a été refusée.',
          confirmDecline: 'Refuser la demande',
          cancelledToast: 'Demande annulée',
        },
        ar: {
          declineTitle: 'رفض هذا الطلب؟',
          declineBody: 'لن يتم جلب Status 601، وسيرى مقدم الطلب أنه رُفض.',
          confirmDecline: 'رفض الطلب',
          cancelledToast: 'تم إلغاء الطلب',
        },
      }[locale];
  const firstRow = page.locator('.rq').nth(0);
  await expect(
    firstRow.getByRole('button', { name: actionCopy.history })
  ).toBeVisible();
  await firstRow.getByRole('button', { name: actionCopy.cancel }).click();
  const dialog = page.getByRole('alertdialog', {
    name: actionCopy.cancelTitle,
  });
  await expect(dialog).toContainText(actionCopy.cancelBody);
  await expect(
    dialog.getByRole('button', { name: actionCopy.confirmCancel })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: actionCopy.keep })
  ).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished)
    );
  });
  if (captureDir && (width === 1440 || width === 390))
    await page.screenshot({
      path: `${captureDir}/actions-${locale}-${width}.png`,
      fullPage: false,
    });
  await dialog.getByRole('button', { name: actionCopy.keep }).click();

  const everyoneLabel = { en: 'Everyone', fr: 'Tout le monde', ar: 'الجميع' }[
    locale
  ];
  await page.locator('.seg button').filter({ hasText: everyoneLabel }).click();
  const waitingRequest = page.locator('.rq').nth(0);
  await waitingRequest
    .getByRole('button', { name: actionCopy.declineButton })
    .click();
  const declineDialog = page.getByRole('alertdialog', {
    name: moderationCopy.declineTitle,
  });
  await expect(declineDialog).toContainText(moderationCopy.declineBody);
  await expect(
    declineDialog.getByRole('button', { name: moderationCopy.confirmDecline })
  ).toBeVisible();
  await expect(
    declineDialog.getByRole('button', { name: actionCopy.keep })
  ).toBeVisible();
  await declineDialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished)
    );
  });
  if (captureDir && (width === 1440 || width === 390))
    await page.screenshot({
      path: `${captureDir}/moderation-${locale}-${width}.png`,
      fullPage: false,
    });
  await declineDialog.getByRole('button', { name: actionCopy.keep }).click();
  const allLabel = { en: 'All', fr: 'Toutes', ar: 'الكل' }[locale];
  await page.locator('.seg button').filter({ hasText: allLabel }).click();
  const cancellableRequest = page.locator('.rq').nth(0);
  await cancellableRequest
    .getByRole('button', { name: actionCopy.cancel })
    .click();
  const cancelDialog = page.getByRole('alertdialog', {
    name: actionCopy.cancelTitle,
  });
  await cancelDialog
    .getByRole('button', { name: actionCopy.confirmCancel })
    .click();
  await expect(page.locator('.toast.show')).toContainText(
    moderationCopy.cancelledToast
  );

  await page.goto('/requests?requestId=not-a-number');
  const invalidLink = page.getByRole('alert');
  await expect(invalidLink).toHaveText(
    requestLinkBaseline
      ? 'This request link is invalid.'
      : labels[locale].invalidLink
  );
  await expect(page.locator('.rq')).toHaveCount(22);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  if (captureDir && (width === 1440 || width === 390))
    await page.screenshot({
      path: `${captureDir}/invalid-link-${locale}-${width}.png`,
      fullPage: true,
    });
});
