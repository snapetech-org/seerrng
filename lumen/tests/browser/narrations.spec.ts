import { expect, test, type Page } from '@playwright/test';

// Narration lists built from SeerrNG's audiobook editions. SeerrNG also lists catalogue copies
// it can't pin a request to; those come with an empty id ("requestable": false), several per
// narrator. Shapes below follow the live response for Wool (Hardcover work 260468).
const woolId = 'bookshelf:1:aGM6MjYwNDY4';
const ed = (
  id: string,
  narrators: string[],
  extra: Record<string, unknown> = {}
) => ({
  id,
  requestable: !!id,
  title: 'Wool',
  format: 'audiobook',
  language: 'eng',
  narrators,
  durationSeconds: 0,
  publisher: '',
  selected: false,
  owned: false,
  ...extra,
});
const woolEditions = [
  ed('31877632', ['Edoardo Ballerini'], { selected: true, owned: true }),
  ed('31747196', ['Susannah Harker'], { durationSeconds: 60000 }),
  ed('', ['Amanda Sayle'], { publisher: 'Audible Studios' }),
  ed('33383711', ['Amanda Sayle'], { publisher: 'Brilliance Audio' }),
  ed('', ['Susannah Harker']),
  ed('33383714', []),
  ed('', ['Edoardo Ballerini'], { durationSeconds: 54000 }),
  ed('33113576', ['Minnie Goode']),
  ed('', ['Susannah Harper']),
  ed('', ['Minnie Goode'], { publisher: 'Broad Reach Publishing' }),
  ed('', ['Minnie Goode'], { durationSeconds: 64380 }),
];
// the book service's own list: Edoardo Ballerini is downloaded, Susannah Harker is monitored
// (requested); SeerrNG reports it as a library list that can keep a second copy alongside
const libraryEditions = woolEditions.map((e) =>
  e.id === '31747196' ? { ...e, selected: true } : e
);
const inLibrary = {
  id: 7,
  status: 5,
  availableAudiobookServiceIds: [0],
  requests: [],
};

type Sent = { url: string; body: unknown };
async function fixtures(
  page: Page,
  list: unknown[] | Record<string, unknown>,
  mediaInfo?: unknown
): Promise<Sent[]> {
  const editions = Array.isArray(list) ? { editions: list } : list;
  const sent: Sent[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.slice(7);
    if (req.method() === 'POST') {
      sent.push({ url: req.url(), body: req.postDataJSON() });
      return route.fulfill({ json: { id: 99 } });
    }
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 1,
          localLogin: true,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'fam', permissions: 2 },
      });
    if (path === '/editions/book') return route.fulfill({ json: editions });
    if (path.startsWith('/book/'))
      return route.fulfill({
        json: {
          id: woolId,
          mediaType: 'book',
          bookFormat: 'audiobook',
          title: 'Wool',
          author: 'Hugh Howey',
          description: 'A silo story.',
          posterPath: '/cover.jpg',
          ...(mediaInfo ? { mediaInfo } : {}),
        },
      });
    if (path.startsWith('/service/') || path.startsWith('/genres/'))
      return route.fulfill({ json: [] });
    return route.fulfill({
      json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    });
  });
  return sent;
}

const radios = (page: Page) =>
  page.getByRole('radiogroup', { name: 'Narrations' }).getByRole('radio');
const row = (page: Page, name: string) =>
  radios(page).filter({ hasText: name });
// the page's request button, or the sticky action bar's copy of it on small screens
const requestButton = (page: Page) =>
  page
    .getByRole('button', { name: /^Request/ })
    .filter({ visible: true })
    .first();

test('another narrator: one selection at a time, and the click moves it', async ({
  page,
}) => {
  const sent = await fixtures(
    page,
    { editions: libraryEditions, source: 'library', supportsAlongside: true },
    inLibrary
  );
  await page.goto(`/book/${encodeURIComponent(woolId)}?f=audio`);
  await expect(row(page, 'Edoardo Ballerini')).toContainText('In library');
  await expect(row(page, 'Susannah Harker')).toContainText('Requested');
  // nothing picked yet: no row looks selected
  await expect(
    radios(page).and(page.locator('[aria-checked="true"]'))
  ).toHaveCount(0);

  await row(page, 'Amanda Sayle').click();
  await expect(row(page, 'Amanda Sayle')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(row(page, 'Minnie Goode')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  const button = requestButton(page);
  await expect(button).toHaveText(/Request another narrator · Amanda Sayle/);

  await row(page, 'Minnie Goode').click();
  await expect(row(page, 'Minnie Goode')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(row(page, 'Amanda Sayle')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(button).toHaveText(/Request another narrator · Minnie Goode/);

  // keyboard too
  await row(page, 'Amanda Sayle').focus();
  await page.keyboard.press('Space');
  await expect(row(page, 'Amanda Sayle')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(
    radios(page).and(page.locator('[aria-checked="true"]'))
  ).toHaveCount(1);

  // owned, requested and unrequestable rows stay put
  for (const name of [
    'Edoardo Ballerini',
    'Susannah Harker',
    'Susannah Harper',
  ])
    await expect(row(page, name)).toHaveAttribute('aria-disabled', 'true');

  // an ordinary request for Minnie Goode's edition, added alongside the copy already here
  await row(page, 'Minnie Goode').click();
  await button.click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].url).toContain('/api/v1/request');
  expect(sent[0].body).toMatchObject({
    mediaType: 'book',
    format: 'audiobook',
    preferredEditionId: '33113576',
    editionPolicy: 'alongside',
  });
  await expect(row(page, 'Minnie Goode')).toContainText('Requested');
});

test('another narrator is not offered when the service cannot keep two copies', async ({
  page,
}) => {
  await fixtures(
    page,
    { editions: libraryEditions, source: 'library', supportsAlongside: false },
    inLibrary
  );
  await page.goto(`/book/${encodeURIComponent(woolId)}?f=audio`);
  await expect(row(page, 'Edoardo Ballerini')).toContainText('In library');
  await expect(row(page, 'Amanda Sayle')).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  await expect(
    page.getByText('Every narration we can request is already in the library')
  ).toBeVisible();
});

test('the ebook page counts narrations from SeerrNG alone', async ({
  page,
}) => {
  await fixtures(page, woolEditions);
  await page.goto(`/book/${encodeURIComponent(woolId)}`);
  await expect(page.locator('.fmt a').nth(1)).toContainText(/\d+ narrations?/);
});

test('first request: rows SeerrNG can pin are selectable and send their edition id', async ({
  page,
}) => {
  // nothing in the library yet (book not in the library): every row with an edition id is requestable
  const editions = woolEditions.map((e) => ({ ...e, owned: false }));
  const sent = await fixtures(page, editions);
  await page.goto(`/book/${encodeURIComponent(woolId)}?f=audio`);
  await expect(
    page.getByRole('heading', { name: 'Choose a narrator' })
  ).toBeVisible();
  // the recommended copy starts selected, and only that one
  await expect(row(page, 'Edoardo Ballerini')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(
    radios(page).and(page.locator('[aria-checked="true"]'))
  ).toHaveCount(1);
  // Susannah Harper is only listed without an edition id: it can't be pinned
  await expect(row(page, 'Susannah Harper')).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  await row(page, 'Susannah Harper').click({ force: true });
  await expect(row(page, 'Susannah Harper')).toHaveAttribute(
    'aria-checked',
    'false'
  );

  for (const [name, id] of [
    ['Amanda Sayle', '33383711'],
    ['Minnie Goode', '33113576'],
  ] as const) {
    await row(page, name).click();
    await expect(
      radios(page).and(page.locator('[aria-checked="true"]'))
    ).toHaveCount(1);
    await expect(row(page, name)).toHaveAttribute('aria-checked', 'true');
    await expect(requestButton(page)).toHaveText(
      new RegExp(`Request · ${name}`)
    );
  }
  await requestButton(page).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].body).toMatchObject({
    mediaType: 'book',
    format: 'audiobook',
    preferredEditionId: '33113576',
    editionPolicy: 'only',
  });
});

test('a full cast listed without an edition id does not share a selection with a narrator', async ({
  page,
}) => {
  const cast = [
    'Adeel Akhtar',
    'Arabella Stanton',
    'Cush Jumbo',
    'Frankie Treadaway',
    'Hugh Laurie',
  ];
  const editions = [
    ed('32850979', ['Stephen Fry'], { selected: true, durationSeconds: 30300 }),
    ed('', cast, { durationSeconds: 31260 }),
    ed('', ['Ann Saunders']),
    ed('32752239', cast),
    ed('32063555', ['Jim Dale'], { durationSeconds: 29880 }),
  ];
  const sent = await fixtures(page, editions);
  await page.goto(`/book/${encodeURIComponent(woolId)}?f=audio`);
  const castRow = row(page, 'Full cast');
  await castRow.click();
  await expect(castRow).toHaveAttribute('aria-checked', 'true');
  await expect(row(page, 'Ann Saunders')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(row(page, 'Ann Saunders')).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  await expect(
    radios(page).and(page.locator('[aria-checked="true"]'))
  ).toHaveCount(1);
  await expect(requestButton(page)).toHaveText(/Adeel Akhtar/);
  await requestButton(page).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].body).toMatchObject({ preferredEditionId: '32752239' });
});

test('"Any English narrator" still names an edition SeerrNG can pin', async ({
  page,
}) => {
  // no recommended copy; the only one with a length is listed without an edition id
  const editions = [
    ed('', ['Minnie Goode'], { durationSeconds: 64380 }),
    ed('33113576', ['Minnie Goode']),
    ed('33383711', ['Amanda Sayle']),
  ];
  const sent = await fixtures(page, editions);
  await page.goto(`/book/${encodeURIComponent(woolId)}?f=audio`);
  await row(page, 'Any English narrator').click();
  await expect(row(page, 'Any English narrator')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(requestButton(page)).toHaveText(/Request audiobook/);
  await requestButton(page).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].body).toMatchObject({
    format: 'audiobook',
    preferredEditionId: '33113576',
    editionPolicy: 'either',
  });
});

test('a recommended recording SeerrNG can only list without an id is not offered', async ({
  page,
}) => {
  // live shape of Cheshire Crossing: one full-cast listing, recommended, no edition id
  const cast = [
    'Brittany Pressley',
    'James Monroe Iglehart',
    'Kristen DiMercurio',
    'Ann Marie Gideon',
  ];
  const sent = await fixtures(page, [
    ed('', cast, { selected: true, durationSeconds: 5880 }),
  ]);
  await page.goto(`/book/${encodeURIComponent(woolId)}?f=audio`);
  const castRow = row(page, 'Full cast');
  await expect(castRow).toHaveAttribute('aria-disabled', 'true');
  await expect(castRow).toContainText('Can’t be requested yet');
  await expect(castRow).not.toContainText('Recommended');
  await expect(row(page, 'Any English narrator')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(requestButton(page)).toHaveText(/Request audiobook/);
  await requestButton(page).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].body).toMatchObject({ format: 'audiobook' });
  expect(sent[0].body).not.toHaveProperty('editionPolicy', 'only');
});
