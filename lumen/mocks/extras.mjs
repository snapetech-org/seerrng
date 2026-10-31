// Sample data for the categories most test servers have no service for (comics, magazines,
// games, sports, adult). Dev only: `LUMEN_MOCKS=1 npm run dev` answers these endpoints here
// instead of SeerrNG, in the shapes SeerrNG's API returns. Requests are accepted and remembered
// for the session; nothing is sent anywhere.

// a cover image: a gradient with the title, so pages look real without fetching anything
const cover = (title, hue, w = 300, h = 450) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 42%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 60% 18%)"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/>` +
      `<text x="50%" y="88%" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="${Math.round(w / 11)}" fill="rgba(255,255,255,.9)">${title.replace(/[&<>]/g, '')}</text></svg>`
  );
const hueOf = (s) =>
  [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const paged = (all, page = 1, per = 20) => ({
  page,
  totalPages: Math.max(1, Math.ceil(all.length / per)),
  totalResults: all.length,
  results: all.slice((page - 1) * per, page * per),
});

const requested = new Map(); // `${type}:${id}` -> media status
const mediaRequests = []; // request-list entries for the mocked categories, newest first
const PROVIDER = {
  comic: 'comicvine',
  magazine: 'lazylibrarian',
  sports: 'sportarr',
  adult: 'stashdb',
};
const mediaInfo = (type, id, base) => {
  const s = requested.get(`${type}:${id}`) ?? base;
  return s ? { status: s } : undefined;
};

// ---- comics ----
const COMICS = [
  [
    'Saga',
    'Image',
    '2012',
    66,
    'An epic space opera about one young family fighting to find their place in the universe.',
  ],
  [
    'Monstress',
    'Image',
    '2015',
    54,
    'A teenage girl struggles to overcome the trauma of war in an alternate 1900s Asia.',
  ],
  [
    'Paper Girls',
    'Image',
    '2015',
    30,
    'Four newspaper delivery girls uncover a mystery across time.',
  ],
  [
    'Immortal Hulk',
    'Marvel',
    '2018',
    50,
    'You hear about a man who survived a fatal accident.',
  ],
  [
    'Batman: Year One',
    'DC Comics',
    '1987',
    4,
    'Bruce Wayne returns to Gotham and Jim Gordon arrives on the force.',
  ],
  [
    'Sandman',
    'DC Comics',
    '1989',
    75,
    'The Lord of Dreams escapes decades of captivity.',
  ],
  [
    'Something Is Killing the Children',
    'BOOM! Studios',
    '2019',
    40,
    'The children of Archer’s Peak are going missing.',
  ],
  [
    'East of West',
    'Image',
    '2013',
    45,
    'The Four Horsemen of the Apocalypse in a dystopian America.',
  ],
  [
    'Hawkeye',
    'Marvel',
    '2012',
    22,
    'What Clint Barton does when he isn’t being an Avenger.',
  ],
  [
    'Locke & Key',
    'IDW Publishing',
    '2008',
    37,
    'Keys that unlock powers in an old New England house.',
  ],
  [
    'Ms. Marvel',
    'Marvel',
    '2014',
    19,
    'Kamala Khan gains shape-shifting powers in Jersey City.',
  ],
  [
    'The Walking Dead',
    'Image',
    '2003',
    193,
    'Survivors of a zombie apocalypse search for safety.',
  ],
].map(([title, publisher, startYear, issueCount, deck], i) => ({
  id: String(40000 + i),
  provider: 'comicvine',
  mediaType: 'comic',
  title,
  publisher,
  startYear,
  issueCount,
  deck,
  posterPath: cover(title, hueOf(title)),
  base: i === 0 ? 5 : i === 3 ? 2 : undefined,
}));
const comicOut = (c) => {
  const { base, ...rest } = c;
  return { ...rest, mediaInfo: mediaInfo('comic', c.id, base) };
};
const issuesOf = (c) =>
  Array.from({ length: c.issueCount }, (_, n) => ({
    id: `${c.id}-${n + 1}`,
    issueNumber: String(n + 1),
    name: n === 0 ? 'Chapter One' : `Chapter ${n + 1}`,
    coverDate: `${+c.startYear + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}-01`,
  }));

// ---- magazines ----
const MAGS = [
  [
    'National Geographic',
    'National Geographic Partners',
    1888,
    'November 2026',
    14,
    'Active',
  ],
  ['WIRED', 'Condé Nast', 1993, 'November 2026', 12, 'Active'],
  [
    'The Economist',
    'The Economist Group',
    1843,
    '31 October 2026',
    40,
    'Active',
  ],
  [
    'Scientific American',
    'Springer Nature',
    1845,
    'November 2026',
    9,
    'Active',
  ],
  ['Rolling Stone', 'Penske Media', 1967, 'October 2026', 6, 'Active'],
  ['The New Yorker', 'Condé Nast', 1925, '2 November 2026', 22, 'Active'],
].map(
  (
    [title, publisher, firstPublishYear, latestIssue, issueCount, status],
    i
  ) => ({
    id: title,
    provider: i < 4 ? 'lazylibrarian' : 'googlebooks',
    mediaType: 'magazine',
    title,
    publisher,
    firstPublishYear,
    latestIssue,
    issueCount,
    status,
    requestable: true,
    posterPath: cover(title, hueOf(title)),
    base: i === 0 ? 5 : undefined,
  })
);
const magOut = (m, withIssues) => {
  const { base, ...rest } = m;
  return {
    ...rest,
    mediaInfo: mediaInfo('magazine', m.title, base),
    ...(withIssues
      ? {
          issues: Array.from({ length: m.issueCount }, (_, n) => ({
            id: `${m.title}-${n}`,
            date: `${['October', 'September', 'August', 'July', 'June', 'May', 'April', 'March', 'February', 'January'][n % 10]} ${2026 - Math.floor(n / 10)}`,
            available: !!base && n < 5,
          })),
        }
      : {}),
  };
};

// ---- sports ----
const LEAGUES = [
  ['English Premier League', 'Soccer', 'England'],
  ['NFL', 'American Football', 'USA'],
  ['Formula 1', 'Motorsport', 'World'],
  ['NBA', 'Basketball', 'USA'],
  ['UEFA Champions League', 'Soccer', 'Europe'],
  ['MLB', 'Baseball', 'USA'],
  ['NHL', 'Ice Hockey', 'USA'],
  ['Six Nations', 'Rugby Union', 'Europe'],
  ['MotoGP', 'Motorsport', 'World'],
].map(([title, sport, country], i) => ({
  id: `sportsdb:${4328 + i}`,
  provider: 'sportarr',
  mediaType: 'sports',
  title,
  sport,
  country,
  year: 2026,
  requestable: true,
  overview: `${title} — every match of the ${2026}/${27} season as it happens.`,
  posterPath: cover(title, hueOf(title), 400, 400),
  libraryState: i === 1 ? 'monitored' : 'not-added',
  eventsAvailable: i === 1,
}));
const leagueOut = (l) =>
  requested.has(`sports:${l.id}`)
    ? { ...l, libraryState: 'requested', mediaInfo: { status: 2 } }
    : l;

// ---- adult (titles kept deliberately plain) ----
const SCENES = Array.from({ length: 10 }, (_, i) => {
  const title = `Sample scene ${i + 1}`;
  return {
    id: `0b5c1e0a-7a3c-4f0e-9a5d-${String(100000000000 + i).padStart(12, '0')}`,
    provider: 'whisparr',
    mediaType: 'adult',
    title,
    year: 2020 + (i % 6),
    studio: ['Studio North', 'Studio West', 'Studio East'][i % 3],
    performers: ['Performer A', 'Performer B'].slice(0, 1 + (i % 2)),
    overview: 'Placeholder description for testing the layout.',
    posterPath: cover(title, 330 + i * 4, 640, 360),
    serviceId: 1,
    serviceName: 'Whisparr',
  };
});
const sceneOut = (x) =>
  requested.has(`adult:${x.id}`) ? { ...x, mediaInfo: { status: 2 } } : x;

// ---- games ----
const GAMES = {
  game: [
    'Hollow Knight',
    'Stardew Valley',
    'Hades',
    'Celeste',
    'Disco Elysium',
    'Outer Wilds',
    'Factorio',
    'Slay the Spire',
    'Baldur’s Gate 3',
    'Balatro',
    'Portal 2',
    'Terraria',
  ],
  retro: [
    'Super Metroid',
    'Chrono Trigger',
    'The Legend of Zelda: A Link to the Past',
    'Sonic the Hedgehog 2',
    'Castlevania: Symphony of the Night',
    'EarthBound',
    'Final Fantasy VI',
    'Mega Man 2',
  ],
  modern: [
    'The Legend of Zelda: Tears of the Kingdom',
    'Super Mario Odyssey',
    'Metroid Dread',
    'Bloodborne',
    'Animal Crossing: New Horizons',
    'Splatoon 3',
  ],
};
const SYSTEMS = {
  retro: [
    { slug: 'snes', name: 'Super Nintendo', group: 'retro' },
    { slug: 'genesis', name: 'Sega Genesis', group: 'retro' },
    { slug: 'psx', name: 'PlayStation', group: 'retro' },
    { slug: 'nes', name: 'NES', group: 'retro' },
  ],
  modern: [
    { slug: 'switch', name: 'Nintendo Switch', group: 'modern' },
    { slug: 'ps4', name: 'PlayStation 4', group: 'modern' },
  ],
};
const gameList = (cat) =>
  GAMES[cat].map((title, i) => {
    const igdbId = (cat === 'game' ? 1000 : cat === 'retro' ? 2000 : 3000) + i;
    return {
      id: `igdb:${igdbId}`,
      catalogProvider: 'igdb',
      catalogId: String(igdbId),
      igdbId,
      title,
      summary: `${title} — sample catalogue entry for testing. Explore, fight and find secrets across a hand-drawn world.`,
      coverUrl: cover(title, hueOf(title), 264, 352),
      releaseDate: `${cat === 'retro' ? 1991 + i : 2016 + (i % 9)}-0${(i % 9) + 1}-15`,
      platforms:
        cat === 'game'
          ? ['PC (Microsoft Windows)', 'Linux', 'Mac']
          : SYSTEMS[cat].map((s) => s.name),
      genres: [
        ['Platform', 'Adventure'],
        ['Role-playing (RPG)', 'Indie'],
        ['Strategy', 'Simulator'],
      ][i % 3],
      platformOptions: [],
      emulationSystems:
        cat === 'game'
          ? []
          : SYSTEMS[cat].slice(0, 1 + (i % SYSTEMS[cat].length)),
      availability: requested.has(`game:${igdbId}`)
        ? 'tracked'
        : i === 1
          ? 'available'
          : 'missing',
      rating: 78 + (i % 20),
      developers: ['Sample Studio'],
      publishers: ['Sample Publisher'],
      timeToBeat: { normally: 36000 + i * 3600 },
      screenshots: [
        cover(title + ' ·', hueOf(title) + 20, 640, 360),
        cover(title + ' ··', hueOf(title) + 40, 640, 360),
      ],
    };
  });
const gameRequests = [];

// ---- the middleware ----
const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((ok) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      try {
        ok(JSON.parse(b || '{}'));
      } catch {
        ok({});
      }
    });
  });

export function extrasMock(seerrUrl) {
  return async (req, res, next) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname.replace(/^\/api\/v1/, '');
    const q = (k) => u.searchParams.get(k) || '';
    const page = +(q('page') || 1);
    const match = (re) => p.match(re);
    let m;

    // every category on, adult included, on top of the real server's settings
    if (p === '/settings/public' && req.method === 'GET') {
      const r = await fetch(seerrUrl + '/api/v1/settings/public', {
        headers: { cookie: req.headers.cookie || '' },
      })
        .then((x) => x.json())
        .catch(() => ({}));
      const all = {
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
      return json(res, 200, {
        ...r,
        adultEnabled: true,
        enabledMediaCategories: all,
      });
    }
    if (p === '/discover/comics') {
      const list = COMICS.filter(
        (c) =>
          !q('query') ||
          c.title.toLowerCase().includes(q('query').toLowerCase()) ||
          c.publisher.toLowerCase().includes(q('query').toLowerCase())
      );
      return json(res, 200, {
        ...paged(list.map(comicOut), page),
        comicVineConfigured: true,
      });
    }
    if ((m = match(/^\/comic\/(\d+)\/issues$/))) {
      const c = COMICS.find((x) => x.id === m[1]);
      return c
        ? json(res, 200, paged(issuesOf(c).reverse(), page, 20))
        : json(res, 404, { message: 'Comic not found' });
    }
    if ((m = match(/^\/comic\/(\d+)$/))) {
      const c = COMICS.find((x) => x.id === m[1]);
      return c
        ? json(res, 200, {
            ...comicOut(c),
            description: `<p>${c.deck}</p><p>Collected in several volumes. This is sample text standing in for ComicVine’s description.</p>`,
          })
        : json(res, 404, { message: 'Comic not found' });
    }
    if (p === '/discover/magazines') {
      const list =
        q('catalog') === 'public'
          ? MAGS.filter((x) =>
              x.title.toLowerCase().includes(q('query').toLowerCase())
            )
          : MAGS.filter((x) => x.provider === 'lazylibrarian');
      return json(
        res,
        200,
        paged(
          list.map((x) => magOut(x)),
          page
        )
      );
    }
    if ((m = match(/^\/magazine\/(.+)$/))) {
      const x = MAGS.find((y) => y.title === decodeURIComponent(m[1]));
      return x
        ? json(res, 200, magOut(x, true))
        : json(res, 404, { message: 'Magazine not found' });
    }
    if (p === '/discover/sports') {
      if (!q('query'))
        return json(res, 200, {
          page,
          totalPages: 0,
          totalResults: 0,
          results: [],
        });
      const t = q('query').toLowerCase();
      return json(
        res,
        200,
        paged(
          LEAGUES.filter((l) =>
            (l.title + l.sport + l.country).toLowerCase().includes(t)
          ).map(leagueOut),
          page
        )
      );
    }
    if ((m = match(/^\/sportarr\/(.+)$/))) {
      const l = LEAGUES.find((x) => x.id === decodeURIComponent(m[1]));
      return l
        ? json(res, 200, leagueOut(l))
        : json(res, 404, { message: 'League not found' });
    }
    if (p === '/adult/search') {
      const t = q('query').toLowerCase();
      return json(res, 200, {
        ...paged(
          SCENES.filter(
            (x) => !t || (x.title + x.studio).toLowerCase().includes(t)
          ).map(sceneOut),
          page
        ),
        partial: false,
      });
    }
    if ((m = match(/^\/adult\/([0-9a-f-]{36})$/))) {
      const x = SCENES.find((y) => y.id === m[1]);
      return x
        ? json(res, 200, sceneOut(x))
        : json(res, 404, { message: 'Adult scene not found.' });
    }
    if (
      p === '/request/software/catalog/popular' ||
      p === '/request/software/catalog/search'
    ) {
      const cat = q('category');
      if (!GAMES[cat])
        return json(res, 400, {
          error: 'A valid category and limit are required.',
        });
      const t = q('q').toLowerCase();
      const all = gameList(cat).filter(
        (g) => !t || g.title.toLowerCase().includes(t)
      );
      const off = +(q('offset') || q('cursor') || 0);
      const lim = +(q('limit') || 24);
      const nxt = off + lim < all.length ? off + lim : null;
      return json(res, 200, {
        results: all.slice(off, off + lim),
        ...(t
          ? { nextCursor: nxt == null ? null : String(nxt) }
          : { nextOffset: nxt }),
      });
    }
    if ((m = match(/^\/request\/software\/catalog\/games\/(\d+)$/))) {
      const g = (GAMES[q('category')] ? gameList(q('category')) : []).find(
        (x) => x.catalogId === m[1]
      );
      return g
        ? json(res, 200, g)
        : json(res, 404, { error: 'Game not found.' });
    }
    // the real request list plus the mocked categories' requests
    if (p === '/request' && req.method === 'GET') {
      const r = await fetch(
        seerrUrl + '/api/v1' + req.url.replace(/^\/api\/v1/, ''),
        { headers: { cookie: req.headers.cookie || '' } }
      );
      const d = await r.json().catch(() => ({ results: [] }));
      return json(
        res,
        r.status,
        r.ok ? { ...d, results: mediaRequests.concat(d.results || []) } : d
      );
    }
    if ((m = match(/^\/request\/(9\d{5})$/)) && req.method === 'DELETE') {
      const i = mediaRequests.findIndex((r) => r.id === +m[1]);
      if (i >= 0) {
        const r = mediaRequests[i];
        requested.delete(`${r.type}:${r.media.identifiers[0].value}`);
        mediaRequests.splice(i, 1);
      }
      res.statusCode = 204;
      return res.end();
    }
    if (p === '/request/software/status' && req.method === 'GET')
      return json(res, 200, {
        results: gameRequests,
        pageInfo: {
          pages: 1,
          pageSize: 40,
          results: gameRequests.length,
          page: 1,
        },
      });
    if (
      (m = match(/^\/request\/software\/status\/(\d+)\/withdraw$/)) &&
      req.method === 'POST'
    ) {
      const i = gameRequests.findIndex((g) => g.request.id === +m[1]);
      if (i >= 0) {
        requested.delete(`game:${gameRequests[i].request.catalogId}`);
        gameRequests.splice(i, 1);
      }
      return json(res, 200, { ok: true });
    }
    if (p === '/request/software' && req.method === 'POST') {
      const b = await readBody(req);
      if (
        b.category === 'game' &&
        (!b.variant?.operatingSystem || !b.variant?.architecture)
      )
        return json(res, 400, {
          error:
            'Choose an operating system and architecture for this PC game.',
        });
      if (b.category !== 'game' && !b.platformSlug)
        return json(res, 400, {
          error: 'Choose a system assigned to this emulation category.',
        });
      const g = gameList(b.category).find((x) => x.igdbId === b.catalogId);
      if (!g)
        return json(res, 400, {
          error: 'A valid software category and catalog title are required.',
        });
      requested.set(`game:${g.igdbId}`, 2);
      const sys = SYSTEMS[b.category]?.find((s) => s.slug === b.platformSlug);
      const request = {
        id: gameRequests.length + 1,
        category: b.category,
        status: 'pending',
        title: g.title,
        coverUrl: g.coverUrl,
        catalogId: g.igdbId,
        catalogKey: String(g.igdbId),
        catalogProvider: 'igdb',
        platform: sys ? { slug: sys.slug, name: sys.name } : null,
        variant: b.variant || null,
        percent: null,
        error: null,
        createdAt: new Date().toISOString(),
      };
      gameRequests.unshift({
        request,
        status: 'pending',
        message: null,
        assets: [],
      });
      return json(res, 201, { request });
    }
    // media requests for the mocked categories; music goes to the real server
    if (p === '/request' && req.method === 'POST') {
      const b = await readBody(req);
      if (['comic', 'magazine', 'sports', 'adult'].includes(b.mediaType)) {
        requested.set(`${b.mediaType}:${b.mediaId}`, 2);
        const r = {
          id: 900000 + mediaRequests.length,
          status: 1,
          type: b.mediaType,
          is4k: false,
          createdAt: new Date().toISOString(),
          seasons: [],
          requestedBy: { id: 0, displayName: '' },
          media: {
            mediaType: b.mediaType,
            tmdbId: 0,
            status: 2,
            identifiers: [
              { provider: PROVIDER[b.mediaType], value: String(b.mediaId) },
            ],
          },
        };
        mediaRequests.unshift(r);
        return json(res, 201, r);
      }
      // the body has been read, so pass this one on to SeerrNG ourselves
      const r = await fetch(seerrUrl + '/api/v1/request', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: req.headers.cookie || '',
        },
        body: JSON.stringify(b),
      });
      res.statusCode = r.status;
      res.setHeader(
        'Content-Type',
        r.headers.get('content-type') || 'application/json'
      );
      return res.end(await r.text());
    }
    next();
  };
}
