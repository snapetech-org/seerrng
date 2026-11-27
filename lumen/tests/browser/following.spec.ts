import { expect, test } from '@playwright/test';
import { testAppPath as mountedTestAppPath } from './testAppPath';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const appHref = (path: string, baseURL: string | undefined) => {
  const url = new URL(path, baseURL);
  if (mount && !url.pathname.startsWith(`${mount}/`))
    url.pathname = `${mount}${url.pathname}`;
  return url.pathname + url.search + url.hash;
};

const baseline = process.env.LUMEN_FOLLOW_BASELINE === '1';

function apiPath(url: string) {
  return new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').slice(7);
}

test('household users can open Following and manage their own updates', async ({
  page,
  baseURL,
}) => {
  let seen = false;
  let patchSeen = false;
  let notify = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/follow/events/seen') {
      const payload = route.request().postDataJSON();
      if (payload.ids[0] === 4) {
        expect(payload).toEqual({ ids: [4] });
        patchSeen = true;
      } else {
        expect(payload).toEqual({ ids: [1] });
        seen = true;
      }
      return route.fulfill({ status: 204 });
    }
    if (path === '/follow/2' && route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ notify: false });
      notify = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/follow/events/count')
      return route.fulfill({
        json: { unseen: Number(!seen) + Number(!patchSeen) },
      });
    if (path === '/follow/events')
      return route.fulfill({
        json: {
          total: 4,
          results: [
            {
              id: 1,
              title: 'A New Film',
              seen,
              follow: { subjectLabel: 'Example Director' },
              target: { mediaType: 'movie', id: '10' },
            },
            {
              id: 3,
              title: 'New Story Expansion',
              reasonKey: 'newExpansion',
              reasonValues: { game: 'Fixture Game' },
              seen: true,
              follow: { subjectLabel: 'Fixture Game', kind: 'expansion' },
              target: { mediaType: 'game', id: '42' },
            },
            {
              id: 4,
              title: 'Translation Patch 2',
              seen: patchSeen,
              follow: {
                subjectLabel: 'Translation Patch',
                kind: 'patch-project',
              },
              reasonKey: 'newPatchVersion',
              reasonValues: {
                project: 'Translation Patch',
                version: '2',
                game: 'Fixture Game',
              },
              target: {
                mediaType: 'patch',
                id: 'translation',
                variantKey: 'v2',
              },
            },
            {
              id: 5,
              title: 'Next Volume Announced',
              seen: true,
              follow: {
                subjectLabel: 'Fixture Novel',
                kind: 'series-language',
              },
              target: { mediaType: 'search', id: 'Fixture Novel Volume 4' },
            },
          ],
        },
      });
    if (path === '/follow')
      return route.fulfill({
        json: {
          results: [
            {
              id: 2,
              kind: 'tmdb-person',
              subjectLabel: 'Example Director',
              conditions: { ref: { tmdbId: 77 } },
              notify,
              autoRequest: false,
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(mountedTestAppPath('./me'));
  await page.getByRole('link', { name: 'Open Following', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Following', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'A New Film' })).toHaveAttribute(
    'href',
    appHref('movie/10', baseURL)
  );
  await expect(
    page.getByRole('heading', { name: 'New for You', exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(
      'Personal news about the people, production companies, networks, genres, narrators, series, games, artists, and projects you follow. Each item explains why it appeared.'
    )
  ).toBeVisible();
  const how = page.getByText('How Following Works', { exact: true });
  await expect(how).toBeVisible();
  await expect(how.locator('xpath=..')).not.toHaveAttribute('open');
  const captureDir = process.env.LUMEN_FOLLOW_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(test.info().project.name))
    await page.screenshot({
      path: `${captureDir}/following-feed-${test.info().project.name}.png`,
      animations: 'disabled',
    });
  await how.click();
  await expect(
    page.getByText(
      /The first check can show up to three current upcoming titles/
    )
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'New Story Expansion' })
  ).toHaveAttribute('href', appHref('game/game/42', baseURL));
  await expect(
    page.getByText('New content for Fixture Game: New Story Expansion.')
  ).toBeVisible();
  await expect(
    page.getByText('Translation Patch 2 is available for Fixture Game.')
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Translation Patch 2', exact: true })
  ).toHaveAttribute('href', appHref('patches/translation?version=v2', baseURL));
  await expect(
    page.getByRole('link', { name: 'Next Volume Announced', exact: true })
  ).toHaveAttribute(
    'href',
    appHref('search?q=Fixture%20Novel%20Volume%204', baseURL)
  );
  await page.getByRole('button', { name: 'Mark Seen: A New Film' }).click();
  await expect(
    page.getByRole('button', { name: 'Mark Seen: A New Film' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Example Director' })
  ).toHaveAttribute('href', appHref('person/77', baseURL));
  const notification = page.getByRole('checkbox', { name: 'Notify Me' });
  await expect(notification).toBeChecked();
  await notification.click();
  await expect(notification).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Request Automatically' })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page
    .getByRole('link', { name: 'Translation Patch 2', exact: true })
    .click();
  await expect(page).toHaveURL(appPath('/patches/translation?version=v2'));
  await expect.poll(() => patchSeen).toBe(true);
});

test('direct navigation without request access does not fetch follows', async ({
  page,
}) => {
  let requested = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(route.request().url());
    requested ||= path.startsWith('/follow');
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Viewer', permissions: 4 }
          : {},
    });
  });
  await page.goto(mountedTestAppPath('./following'));
  await expect(
    page.getByText('Request access is required to use Following.')
  ).toBeVisible();
  expect(requested).toBe(false);
});

test('empty Following suggests the enabled native related tools', async ({
  page,
}, info) => {
  const categories = {
    ebook: true,
    audiobook: true,
    game: true,
    retro: true,
    modern: true,
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          booksEnabled: true,
          ebookServiceEnabled: true,
          readmeabookEnabled: true,
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: categories,
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { enabledMediaCategories: categories } });
    if (path === '/follow/events')
      return route.fulfill({ json: { total: 0, results: [] } });
    if (path === '/follow/events/count')
      return route.fulfill({ json: { unseen: 0 } });
    if (path === '/follow') return route.fulfill({ json: { results: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/following'));
  const tools = page.getByRole('navigation', { name: 'What You Follow' });
  await expect(
    tools.getByRole('link', { name: 'Book Recommendations' })
  ).toHaveAttribute('href', appPath('/books/recommendations'));
  await expect(
    tools.getByRole('link', { name: 'Collector Picks' })
  ).toHaveAttribute('href', appPath('/music/collectors'));
  await expect(
    tools.getByRole('link', { name: 'Game Finder' })
  ).toHaveAttribute('href', appPath('/games/discovery'));
  await expect(
    tools.getByRole('link', { name: 'Translations and Hacks' })
  ).toHaveAttribute('href', appPath('/patches'));
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  const captureDir = process.env.LUMEN_FOLLOW_SUGGESTIONS_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/following-empty-${info.project.name}.png`,
      animations: 'disabled',
    });
});

test('empty Following hides links to disabled optional catalogs', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          booksEnabled: true,
          ebookServiceEnabled: true,
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: {
            ebook: false,
            audiobook: false,
            game: false,
            retro: false,
            modern: false,
          },
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          enabledMediaCategories: {
            ebook: false,
            audiobook: false,
            game: false,
            retro: false,
            modern: false,
          },
        },
      });
    if (path === '/follow/events')
      return route.fulfill({ json: { total: 0, results: [] } });
    if (path === '/follow/events/count')
      return route.fulfill({ json: { unseen: 0 } });
    if (path === '/follow') return route.fulfill({ json: { results: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/following'));
  const tools = page.getByRole('navigation', { name: 'What You Follow' });
  await expect(
    tools.getByRole('link', { name: 'Collector Picks' })
  ).toHaveAttribute('href', appPath('/music/collectors'));
  await expect(
    tools.getByRole('link', { name: 'Book Recommendations' })
  ).toHaveCount(0);
  await expect(tools.getByRole('link', { name: 'Game Finder' })).toHaveCount(0);
  await expect(
    tools.getByRole('link', { name: 'Translations and Hacks' })
  ).toHaveCount(0);
});

test('following a person uses the exact identity and waits for server confirmation', async ({
  page,
}, info) => {
  const person = { id: 77, name: 'Example Director' };
  let followed = false;
  let fail = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    const record = { id: 2, kind: 'tmdb-person', subjectKey: 'tmdb:person:77' };
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'ar' } });
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({
        kind: 'tmdb-person',
        subjectKey: 'tmdb:person:77',
        subjectLabel: person.name,
        conditions: { ref: { tmdbId: 77 } },
      });
      if (fail)
        return route.fulfill({ status: 500, json: { message: 'Try again' } });
      followed = true;
      return route.fulfill({ status: 201, json: record });
    }
    if (path === '/follow/2' && request.method() === 'DELETE') {
      followed = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Reader', permissions: 32 }
          : path === '/person/77'
            ? person
            : path === '/follow'
              ? { results: followed ? [record] : [] }
              : {},
    });
  });
  await page.goto(mountedTestAppPath('./person/77'));
  const follow = page.getByRole('button', {
    name: baseline ? 'Follow' : 'متابعة',
    exact: true,
  });
  await expect(follow).toBeVisible();
  const captureDir = process.env.LUMEN_FOLLOW_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/${baseline ? 'baseline' : 'candidate'}-person-${info.project.name}.png`,
      fullPage: true,
    });
  await follow.click();
  await expect(page.getByRole('status')).toContainText('Try again');
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  fail = false;
  await follow.click();
  const following = page.getByRole('button', {
    name: 'تتم المتابعة',
    exact: true,
  });
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await following.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
});

test('filtered discovery follows the exact genre, studio, and network', async ({
  page,
}) => {
  const posted: unknown[] = [];
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/genres/tv') return route.fulfill({ json: [] });
    if (path === '/genres/movie')
      return route.fulfill({ json: [{ id: 18, name: 'Drama' }] });
    if (path === '/studio/72')
      return route.fulfill({ json: { id: 72, name: 'Fixture Studio' } });
    if (path === '/network/900009')
      return route.fulfill({ json: { id: 900009, name: 'Fixture Network' } });
    if (path === '/follow' && request.method() === 'POST') {
      const subject = request.postDataJSON();
      posted.push(subject);
      return route.fulfill({ json: { ...subject, id: posted.length } });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(mountedTestAppPath('./movies?genre=18&studio=72'));
  await page.getByRole('button', { name: 'Follow Drama', exact: true }).click();
  await page
    .getByRole('button', { name: 'Follow Fixture Studio', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Following', exact: true })
  ).toHaveCount(2);
  await page.goto(mountedTestAppPath('./series?network=900009'));
  await page
    .getByRole('button', { name: 'Follow Fixture Network', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Following', exact: true })
  ).toHaveCount(1);
  expect(posted).toEqual([
    {
      kind: 'tmdb-genre',
      subjectKey: 'tmdb:genre:movie:18',
      subjectLabel: 'Drama',
      conditions: { ref: { genreId: 18, mediaType: 'movie' } },
    },
    {
      kind: 'tmdb-studio',
      subjectKey: 'tmdb:studio:72',
      subjectLabel: 'Fixture Studio',
      conditions: { ref: { tmdbId: 72 } },
    },
    {
      kind: 'tmdb-network',
      subjectKey: 'tmdb:network:900009',
      subjectLabel: 'Fixture Network',
      conditions: { ref: { tmdbId: 900009 } },
    },
  ]);
});

test('book details follow the author by catalog identity', async ({ page }) => {
  const subject = {
    kind: 'author',
    subjectKey: 'author:OL7A',
    subjectLabel: 'Fixture Author',
    conditions: { ref: { authorId: 'OL7A' } },
  };
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { booksEnabled: true, ebookServiceEnabled: true },
      });
    if (path === '/book/OL42W')
      return route.fulfill({
        json: {
          id: 'OL42W',
          title: 'Fixture Book',
          authorId: 'OL7A',
          author: 'Fixture Author',
          mediaType: 'book',
          bookFormat: 'ebook',
        },
      });
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual(subject);
      return route.fulfill({ json: { ...subject, id: 6 } });
    }
    if (path === '/follow/6' && request.method() === 'DELETE')
      return route.fulfill({ status: 204 });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(mountedTestAppPath('./book/OL42W'));
  const follow = page.getByRole('button', { name: 'Follow New Releases' });
  await follow.click();
  const following = page.getByRole('button', {
    name: 'Following',
    exact: true,
  });
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await following.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
});

test('an audiobook can follow a solo narrator without selecting an edition', async ({
  page,
}, info) => {
  const subject = {
    kind: 'narrator',
    subjectKey: 'narrator:fixture reader',
    subjectLabel: 'Fixture Reader',
  };
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'fr' } });
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { booksEnabled: true, audiobookServiceEnabled: true },
      });
    if (path === '/editions/book')
      return route.fulfill({
        json: {
          editions: [
            {
              id: 'solo',
              title: 'Solo edition',
              format: 'audiobook',
              language: 'en',
              narrators: ['Fixture Reader'],
            },
            {
              id: 'cast',
              title: 'Cast edition',
              format: 'audiobook',
              language: 'en',
              narrators: ['Full Cast'],
            },
          ],
        },
      });
    if (path.startsWith('/book/') && !path.endsWith('/ratings'))
      return route.fulfill({
        json: {
          id: 'bookshelf:1:aGM6MjYwNDY4',
          title: 'Fixture Audiobook',
          mediaType: 'book',
          bookFormat: 'audiobook',
          description: 'Fixture description.',
        },
      });
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual(subject);
      return route.fulfill({ json: { ...subject, id: 7 } });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(
    mountedTestAppPath('./book/bookshelf:1:aGM6MjYwNDY4?f=audio')
  );
  const narrations = page.getByRole('radiogroup', { name: 'Narrations' });
  await expect(narrations).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Follow Full Cast' })
  ).toHaveCount(0);
  const cast = narrations.getByRole('radio', { name: /Full Cast/ });
  await cast.click();
  await expect(cast).toBeChecked();
  const narratorFollow = page.getByRole('button', {
    name: baseline ? 'Follow Fixture Reader' : 'Suivre Fixture Reader',
  });
  await expect(narratorFollow).toBeVisible();
  const captureDir = process.env.LUMEN_FOLLOW_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/${baseline ? 'baseline' : 'candidate'}-narrator-${info.project.name}.png`,
      fullPage: true,
    });
  await narratorFollow.click();
  await expect(
    page.getByRole('button', { name: 'Abonné', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(cast).toBeChecked();
});

test('anime continuation loads on demand and follows the novel in its language', async ({
  page,
}, info) => {
  const testLocale = baseline ? 'en' : process.env.LUMEN_FOLLOW_LOCALE || 'fr';
  const arabic = testLocale === 'ar';
  const subject = {
    kind: 'series-language',
    subjectKey: 'ranobedb:81:en',
    subjectLabel: 'Fixture Novel',
    conditions: { language: 'en', ref: { ranobedbId: 81 } },
  };
  const lookups: string[] = [];
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = apiPath(request.url());
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: testLocale } });
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/tv/92')
      return route.fulfill({
        json: {
          id: 92,
          name: 'Fixture Anime',
          originalLanguage: 'ja',
          genres: [{ id: 16, name: 'Animation' }],
          seasons: [
            { id: 1, seasonNumber: 1, name: 'First Season', episodeCount: 12 },
            { id: 2, seasonNumber: 2, name: 'Second Season', episodeCount: 12 },
          ],
        },
      });
    if (path === '/continuation/tv/92') {
      lookups.push(url.search);
      return route.fulfill({
        json: {
          available: true,
          seasonMapping: 'ordered',
          sources: [
            {
              anilistId: 42,
              kind: 'novel',
              title: 'Fixture Novel',
              confidence: 'moderate',
              evidence: ['Publisher match'],
              end: { volume: 3, chapter: 12 },
              continuation: { volume: 4 },
              continuationBasis: 'derived',
              volumeApproximate: true,
              novel: {
                ranobedbId: 81,
                language: 'en',
                translationPending: true,
                continuationVolume: { title: 'Volume Four' },
              },
              targets: [
                {
                  label: 'continuation',
                  exact: true,
                  href: '/book/OL42W',
                  title: 'Volume Four',
                },
                {
                  label: 'start',
                  exact: false,
                  href: '/search?query=Fixture%20Novel%20%26%20Volume%201',
                  title: 'Fixture Novel',
                },
              ],
            },
          ],
        },
      });
    }
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual(subject);
      return route.fulfill({ json: { ...subject, id: 9 } });
    }
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(mountedTestAppPath('./tv/92'));
  const titleLabel = baseline
    ? 'Manga and Novel Continuations'
    : arabic
      ? 'متابعات المانغا والروايات'
      : 'Continuités manga et roman';
  const findLabel = baseline
    ? 'Find Sources'
    : arabic
      ? 'البحث عن المصادر'
      : 'Rechercher des sources';
  const find = page.getByRole('button', { name: findLabel });
  await expect(page.getByRole('heading', { name: titleLabel })).toBeVisible();
  await expect(find).toBeVisible();
  expect(lookups).toEqual([]);
  if (info.project.name === 'iphone') await find.click({ force: true });
  else await find.click();
  await expect(
    page.getByText(
      baseline
        ? 'Volume Four · Translation pending in English'
        : arabic
          ? 'Volume Four · الترجمة قيد الانتظار بلغة الإنجليزية'
          : 'Volume Four · Traduction en attente en anglais'
    )
  ).toBeVisible();
  await expect(
    page.getByText(
      baseline
        ? 'Season matches are based on release order.'
        : arabic
          ? 'تطابق المواسم مبني على ترتيب الإصدار.'
          : 'La correspondance des saisons repose sur l’ordre de sortie.'
    )
  ).toBeVisible();
  await expect(
    page.getByText(
      baseline
        ? 'Season ends at Volume 3, Chapter 12.'
        : arabic
          ? 'ينتهي الموسم عند المجلد 3، الفصل 12.'
          : 'La saison se termine à Tome 3, Chapitre 12.'
    )
  ).toBeVisible();
  await expect(
    page.getByText(
      baseline
        ? 'Estimated continuation · Volume 4'
        : arabic
          ? 'متابعة تقديرية · المجلد 4'
          : 'Suite estimée · Tome 4'
    )
  ).toBeVisible();
  await page
    .getByRole('combobox', {
      name: baseline
        ? 'Continuation season'
        : arabic
          ? 'موسم المتابعة'
          : 'Saison de continuation',
    })
    .selectOption('1');
  await expect
    .poll(() => lookups)
    .toEqual([
      `?language=${testLocale}&season=2`,
      `?language=${testLocale}&season=1`,
    ]);
  await expect(
    page.getByRole('link', {
      name: baseline
        ? 'Open Continuation Volume'
        : arabic
          ? 'فتح مجلد المتابعة'
          : 'Ouvrir le volume de continuation',
    })
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: baseline
        ? 'Search for Fixture Novel'
        : arabic
          ? 'ابحث عن Fixture Novel'
          : 'Rechercher Fixture Novel',
    })
  ).toHaveAttribute('href', /\/search\?q=Fixture\+Novel\+%26\+Volume\+1$/);
  await expect(
    page.getByText(
      baseline
        ? /Estimated from where the season ends/
        : arabic
          ? /تقدير انطلاقًا من نهاية الموسم/
          : /Estimation calculée depuis la fin de la saison/
    )
  ).toBeVisible();
  await expect(
    page.getByText(
      baseline
        ? 'The continuation volume is unconfirmed.'
        : arabic
          ? 'مجلد المتابعة غير مؤكد.'
          : 'Le volume de continuation n’est pas confirmé.'
    )
  ).toBeVisible();
  const futureVolumesFollow = page.getByRole('button', {
    name: baseline
      ? 'Follow Future Volumes'
      : arabic
        ? 'متابعة المجلدات القادمة'
        : 'Suivre les volumes à venir',
  });
  await expect(futureVolumesFollow).toBeVisible();
  const captureDir = process.env.LUMEN_FOLLOW_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/${baseline ? 'baseline' : 'candidate'}-future-volumes-${info.project.name}.png`,
      fullPage: true,
    });
  await futureVolumesFollow.click({ force: info.project.name === 'iphone' });
  await expect(
    page.getByRole('button', {
      name: baseline ? 'Following' : arabic ? 'تتم المتابعة' : 'Abonné',
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
});

test('switching franchise titles keeps the follow identity and state separate', async ({
  page,
  baseURL,
}) => {
  const subjects: unknown[] = [];
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/franchise/anime/10')
      return route.fulfill({
        json: {
          anchor: { title: 'Fixture Original' },
          notes: [],
          items: [
            {
              group: 'sequel',
              title: 'Fixture Sequel',
              mediaType: 'anime',
              href: '/search?query=Fixture%20Sequel',
              anilistId: 11,
              confidence: 'high',
              verified: true,
            },
            {
              group: 'source',
              title: 'Fixture Novel',
              mediaType: 'novel',
              href: '/search?query=Fixture%20Novel%20Volume%203',
              confidence: 'high',
              verified: true,
            },
            {
              group: 'source',
              title: 'Mapped Volume',
              mediaType: 'book',
              href: '/book/bookshelf%3A1%3AaGM6MjYwNDY4',
              confidence: 'high',
              verified: true,
            },
          ],
        },
      });
    if (path === '/franchise/anime/11')
      return route.fulfill({
        json: { anchor: { title: 'Fixture Sequel' }, notes: [], items: [] },
      });
    if (path === '/follow' && request.method() === 'POST') {
      const subject = request.postDataJSON();
      subjects.push(subject);
      return route.fulfill({ json: { ...subject, id: subjects.length } });
    }
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(mountedTestAppPath('./franchise/anime/10'));
  await expect(
    page.getByRole('link', { name: 'Fixture Novel' })
  ).toHaveAttribute(
    'href',
    appHref('search?q=Fixture+Novel+Volume+3', baseURL)
  );
  await expect(
    page.getByRole('link', { name: 'Mapped Volume' })
  ).toHaveAttribute(
    'href',
    appHref('book/bookshelf%3A1%3AaGM6MjYwNDY4', baseURL)
  );
  const follow = page.getByRole('button', { name: 'Follow', exact: true });
  const following = page.getByRole('button', {
    name: 'Following',
    exact: true,
  });
  await follow.click();
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('link', {
      name: 'Explore Franchise: Fixture Sequel',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Franchise for Fixture Sequel' })
  ).toBeVisible();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await follow.click();
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  expect(subjects).toEqual([
    {
      kind: 'franchise',
      subjectKey: 'anime:10',
      subjectLabel: 'Fixture Original',
      conditions: { ref: { anchorId: '10', anchorType: 'anime' } },
    },
    {
      kind: 'franchise',
      subjectKey: 'anime:11',
      subjectLabel: 'Fixture Sequel',
      conditions: { ref: { anchorId: '11', anchorType: 'anime' } },
    },
  ]);
});

for (const [type, catalogId, href] of [
  ['book', 'bookshelf:1:aGM6MjYwNDY4', '/book/bookshelf%3A1%3AaGM6MjYwNDY4'],
  ['game', '42', '/game/game/42'],
]) {
  test(`franchise curators can save an exact ${type} link`, async ({
    page,
    baseURL,
  }) => {
    let saved = false;
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = apiPath(request.url());
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/franchise/anime/10')
        return route.fulfill({
          json: {
            anchor: { title: 'Fixture Original' },
            notes: [],
            canCurate: true,
            items: saved
              ? [
                  {
                    group: 'source',
                    title: 'Fixture Volume',
                    mediaType: type,
                    href,
                    confidence: 'high',
                    verified: true,
                  },
                ]
              : [],
          },
        });
      if (path === '/franchise/relations' && request.method() === 'POST') {
        expect(request.postDataJSON()).toMatchObject({
          toType: type,
          toId: catalogId,
          href,
        });
        saved = true;
        return route.fulfill({ status: 201, json: { ok: true } });
      }
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto(mountedTestAppPath('./franchise/anime/10'));
    await page
      .getByRole('button', { name: 'Add Relationship', exact: true })
      .click();
    await page.getByLabel('Related Title').fill('Fixture Volume');
    await page.getByLabel('Catalogue ID').fill(catalogId);
    await page.getByLabel('Media Type').selectOption(type);
    await page
      .getByLabel('Relationship', { exact: true })
      .selectOption('source-material');
    await page.getByRole('button', { name: 'Save Relationship' }).click();
    await expect(
      page.getByRole('link', { name: 'Fixture Volume' })
    ).toHaveAttribute('href', appPath(new URL('.' + href, baseURL).pathname));
  });
}

test('unmatched AniList discovery titles can open the exact franchise', async ({
  page,
}, info) => {
  await page.route('**/imageproxy/anilist/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="45"/>',
    })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/integrations/discovery/feeds/anilist/trending')
      return route.fulfill({
        json: {
          page: 1,
          items: [
            {
              id: 'anilist:713',
              title: 'Fixture Anime',
              imageUrl: 'https://s4.anilist.co/file/fixture.jpg',
            },
          ],
        },
      });
    if (path === '/franchise/anime/713')
      return route.fulfill({
        json: { anchor: { title: 'Fixture Anime' }, notes: [], items: [] },
      });
    if (path === '/continuation/anilist/713') {
      const season = new URL(route.request().url()).searchParams.get('season');
      return route.fulfill({
        json: {
          available: true,
          seasons: [{ number: 1, title: 'First season' }],
          sources: [
            {
              anilistId: 11,
              kind: 'manga',
              title:
                season === '1' ? 'First Season Manga' : 'Latest Season Manga',
              confidence: 'high',
              evidence: [],
              targets: [],
            },
          ],
        },
      });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(mountedTestAppPath('./providers?unmatched=1'));
  const cover = page.locator('img[src="/imageproxy/anilist/file/fixture.jpg"]');
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(30);
  await page
    .getByRole('link', { name: 'Explore Franchise: Fixture Anime' })
    .click();
  await expect(page).toHaveURL(appPath('/franchise/anime/713'));
  await expect(
    page.getByRole('heading', { name: 'Franchise for Fixture Anime' })
  ).toBeVisible();
  const findSources = page.getByRole('button', {
    name: /^(Find Sources|Rechercher des sources|البحث عن المصادر)$/u,
  });
  await findSources.click({ force: info.project.name === 'iphone' });
  await expect(page.getByText('Latest Season Manga')).toBeVisible();
  const season = page.getByRole('combobox', { name: 'Continuation season' });
  await season.selectOption('1');
  await expect(page.getByText('First Season Manga')).toBeVisible();
  await expect(season).toHaveValue('1');
});
