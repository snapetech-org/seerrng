import type {
  AurralLibrarySearchResult,
  AurralNormalizedAlbum,
  AurralNormalizedArtist,
  AurralNormalizedTopResult,
  AurralNormalizedTrack,
  AurralResolvedLink,
} from '@server/api/aurral';

export interface ParsedMusicQuery {
  artist: string | null;
  title: string | null;
  year: number | null;
  edition: string | null;
  type: string | null;
}

export interface MusicQueryParseDetails extends ParsedMusicQuery {
  extraArtists: string[];
  cleanQuery: string;
  /**
   * True when the artist/title (or extra artist) came from a guess that is
   * often wrong ("Stand by Me", "Dancing with a Stranger", "Star Wars: A New
   * Hope"). resolveMusicQuerySplit keeps it only when results support it.
   */
  tentativeSplit?: boolean;
  /** The query as typed, so a rejected guess can be parsed again without it. */
  rawQuery?: string;
}

export interface ParseMusicQueryOptions {
  /** Allow "X by Y", "Y: X" and bare "X with Y" guesses. Default true. */
  tentativeSplits?: boolean;
}

const SUPPORTED_LINK_EXACT_HOSTS = new Set([
  'open.spotify.com',
  'music.apple.com',
  'music.youtube.com',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'tidal.com',
  'www.tidal.com',
  'listen.tidal.com',
  'deezer.com',
  'www.deezer.com',
  'deezer.page.link',
  'song.link',
  'www.song.link',
  'odesli.co',
  'www.odesli.co',
  'album.link',
  'www.album.link',
]);

const COVER_PENALTY_RULES: { label: string; pattern: RegExp }[] = [
  { label: 'cover', pattern: /\bcovers?\b/i },
  { label: 'karaoke', pattern: /\bkaraoke\b/i },
  { label: 'tribute', pattern: /\btributes?\b/i },
  { label: 'made popular by', pattern: /\bmade popular by\b/i },
  { label: 'in the style of', pattern: /\bin the style of\b/i },
  { label: 'lullaby', pattern: /\blullab(?:y|ies)\b/i },
  { label: '8-bit', pattern: /\b8[\s-]?bit\b/i },
  { label: 'for babies', pattern: /\bfor babies\b/i },
  { label: 'instrumental', pattern: /\binstrumental\b/i },
  { label: 'piano version', pattern: /\bpiano (?:version|arrangement)\b/i },
  { label: 'remake', pattern: /\bremakes?\b/i },
  { label: 'lofi', pattern: /\blo[\s-]?fi\b/i },
];

const FILLER_PHRASES = [
  /\bi\s+want\s+to\s+hear\b/gi,
  /\bthat\s+song\b/gi,
  /\bthe\s+song\b/gi,
  /\bfrom\s+the\b/gi,
  /\bmovie\b/gi,
  /\bsang\b/gi,
  /\bcalled\b/gi,
  /\babout\b/gi,
  /\bplease\b/gi,
  /\bplay\b/gi,
];

const WITH_PRONOUNS = new Set(['me', 'you', 'us', 'him', 'her', 'them', 'it']);

/**
 * Lower-cased search text. Latin accents are dropped (Mötley Crüe ->
 * motley crue), then the text is recomposed (NFKC) so marks that belong to
 * other scripts stay attached (ドラゴンボール, गाना). "!" and "$" inside a
 * word read as letters (P!nk -> pink, Ke$ha -> kesha); other punctuation
 * becomes a space.
 */
export const normalizeMusicSearchText = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFKC')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .replace(/['’`]/g, '')
    .replace(/(?<=\p{L})!(?=\p{L})/gu, 'i')
    .replace(/(?<=\p{L})\$(?=\p{L})/gu, 's')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A comparison key for names: normalized text, or the plain lower-cased
 * name when normalizing leaves nothing (the band "!!!").
 */
export const musicMatchKey = (value: string): string =>
  normalizeMusicSearchText(value) || value.trim().toLocaleLowerCase();

/** Normalized text without spaces: "AC/DC", "ac dc" and "acdc" all match. */
export const compactMusicSearchText = (normalized: string): string =>
  normalized.replace(/\s+/g, '');

/** Equality of two normalized names, also when only the spacing differs. */
export const musicNamesEqual = (left: string, right: string): boolean => {
  if (!left || !right) return false;
  if (left === right) return true;
  const compactLeft = compactMusicSearchText(left);
  return (
    compactLeft.length > 0 && compactLeft === compactMusicSearchText(right)
  );
};

/** Whole-word containment of normalized text ("me" is not in "james"). */
export const containsMusicWords = (haystack: string, needle: string): boolean =>
  Boolean(needle) && ` ${haystack} `.includes(` ${needle} `);

export const stripTrackFeaturedParens = (title: string): string => {
  const stripped = title
    .replace(
      /\s*(?:\(|\[)\s*(?:feat\.?|ft\.?|featuring|with)\s+[^()[\]]*(?:\)|\])/gi,
      ''
    )
    .replace(
      /\s*(?:\(|\[)\s*from\s+(?:the\s+motion\s+picture\s+)?[^()[\]]*(?:\)|\])/gi,
      ''
    )
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || title.trim();
};

/**
 * A song title without what catalogs append to it, normalised: "(Who Loves
 * Me)", "[Live]", "feat. X", " - Remastered 2011", " - Single Version".
 */
export const stripTrackTitleExtras = (title: string): string => {
  let working = stripTrackFeaturedParens(title)
    .replace(
      /\s+-\s+[^-]*\b(?:remaster(?:ed)?|version|edit|mix|mono|stereo|live|single)\b[^-]*$/i,
      ''
    )
    .trim();
  for (let i = 0; i < 3; i += 1) {
    const next = working.replace(/\s*[([][^()[\]]*[)\]]\s*$/, '').trim();
    if (!next || next === working) break;
    working = next;
  }
  return normalizeMusicSearchText(working || title);
};

/** The song's title, with or without appended parts, is the searched title. */
export const isSameTitleTrack = (
  track: { title: string },
  cleanNorm: string
): boolean =>
  Boolean(cleanNorm) &&
  (musicNamesEqual(normalizeMusicSearchText(track.title), cleanNorm) ||
    musicNamesEqual(stripTrackTitleExtras(track.title), cleanNorm));

/**
 * Copies catalog popularity (Deezer track rank) onto songs with the same
 * artist and title. Songs without a match keep what they have.
 */
export const applyTrackPopularity = <T extends AurralNormalizedTrack>(
  tracks: T[],
  ranked: { artistName: string; title: string; rank: number }[]
): T[] => {
  const key = (artistName: string, title: string) =>
    `${musicMatchKey(artistName)}|${stripTrackTitleExtras(title)}`;
  const ranks = new Map<string, number>();
  for (const entry of ranked) {
    const entryKey = key(entry.artistName, entry.title);
    ranks.set(entryKey, Math.max(ranks.get(entryKey) ?? 0, entry.rank));
  }
  if (ranks.size === 0) return tracks;
  return tracks.map((track) => {
    const rank = ranks.get(key(track.artistName, track.title));
    return rank === undefined ? track : { ...track, popularity: rank };
  });
};

/** A song without the internal popularity number, for answers. */
export const stripTrackPopularity = <T extends AurralNormalizedTrack>(
  track: T
): T => {
  if (track.popularity === undefined) return track;
  const copy = { ...track };
  delete copy.popularity;
  return copy;
};

export const stripEditionWords = (value: string): string => {
  let working = value.trim();
  if (!working) return '';

  const patterns = [
    /\s*(?:\(|\[)[^()[\]]*\bversion\s*(?:\)|\])/gi,
    /\s*(?:\(|\[)\s*(?:deluxe(?:\s+edition)?|expanded(?:\s+edition)?|remastered(?:\s+\d{4})?|remaster|special\s+edition|anniversary\s+edition|super\s+deluxe|collector'?s\s+edition)\s*(?:\)|\])/gi,
    /\s+\b(?:deluxe\s+edition|expanded\s+edition|special\s+edition|anniversary\s+edition|super\s+deluxe|taylor'?s\s+version|deluxe|expanded|remastered|remaster)\b/gi,
    /\s+\bthe\s+album\b$/i,
  ];

  for (const pattern of patterns) {
    const candidate = working.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
    if (candidate) {
      working = candidate;
    }
  }

  return normalizeMusicSearchText(working);
};

export const isMusicLinkQuery = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    const hostname = url.hostname.toLowerCase();
    if (!SUPPORTED_LINK_EXACT_HOSTS.has(hostname)) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
};

export const parseMusicPlaylistLink = (
  value: string
): AurralResolvedLink | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^(?:www\.)?deezer\.com\//i.test(trimmed)
      ? `https://${trimmed}`
      : null;
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    if (hostname === 'deezer.com' || hostname === 'www.deezer.com') {
      const match = url.pathname.match(
        /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?playlist\/(\d{1,20})(?:\/.*)?$/i
      );
      if (!match) {
        return null;
      }
      return {
        type: 'playlist',
        provider: 'deezer',
        id: match[1],
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      };
    }

    if (hostname === 'open.spotify.com' || hostname === 'spotify.com') {
      if (
        !/^\/(?:intl-[a-z]{2,5}(?:-[a-z]{2})?\/)?playlist\/[A-Za-z0-9]{1,100}(?:\/.*)?$/i.test(
          url.pathname
        )
      ) {
        return null;
      }
      return {
        type: 'playlist',
        provider: 'spotify',
        id: null,
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      };
    }

    if (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'music.youtube.com' ||
      hostname === 'm.youtube.com'
    ) {
      if (!/^\/playlist\/?$/i.test(url.pathname)) {
        return null;
      }
      return {
        type: 'playlist',
        provider: 'youtube',
        id: null,
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      };
    }

    return null;
  } catch {
    return null;
  }
};

export const parseMusicQuery = (
  rawQuery: string,
  options: ParseMusicQueryOptions = {}
): MusicQueryParseDetails => {
  const allowTentative = options.tentativeSplits !== false;
  let tentativeSplit = false;
  let working = rawQuery.trim().replace(/\s+/g, ' ');
  if (!working) {
    return {
      artist: null,
      title: null,
      year: null,
      edition: null,
      type: null,
      extraArtists: [],
      cleanQuery: '',
    };
  }

  const extraArtists: string[] = [];

  // 1. Trailing feat./ft./featuring/with + name (extra artist)
  const parenFeatMatch = working.match(
    /\s*(?:\(|\[)\s*(?:feat\.?|ft\.?|featuring|with)\s+([^()[\]]+?)\s*(?:\)|\])\s*$/i
  );
  if (parenFeatMatch) {
    const extra = parenFeatMatch[1].trim();
    const candidate = working
      .slice(0, parenFeatMatch.index)
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate) {
      if (extra) extraArtists.push(extra);
      working = candidate;
    }
  } else {
    const bareFeatMatch = working.match(
      /\s+(?:feat\.?|ft\.?|featuring)(?:\s+(.+?))?\s*$/i
    );
    if (bareFeatMatch) {
      const extra = bareFeatMatch[1]?.trim();
      const candidate = working
        .slice(0, bareFeatMatch.index)
        .replace(/\s+/g, ' ')
        .trim();
      if (candidate) {
        if (extra) extraArtists.push(extra);
        working = candidate;
      }
    } else if (allowTentative) {
      // "X with Y" may be a featured artist or part of the title
      // ("Dancing with a Stranger"): a guess, checked against results later.
      const bareWithMatch = working.match(/\s+with\s+(.+?)\s*$/i);
      if (bareWithMatch) {
        const extra = bareWithMatch[1].trim();
        const candidate = working
          .slice(0, bareWithMatch.index)
          .replace(/\s+/g, ' ')
          .trim();
        if (
          candidate &&
          extra &&
          !WITH_PRONOUNS.has(extra.toLocaleLowerCase())
        ) {
          extraArtists.push(extra);
          working = candidate;
          tentativeSplit = true;
        }
      }
    }
  }

  // 2. Edition words
  let edition: string | null = null;
  const editionExtractors: {
    pattern: RegExp;
    format: (match: RegExpMatchArray) => string;
  }[] = [
    {
      pattern: /\s*(?:\(|\[)([^()[\]]*\bversion)\s*(?:\)|\])/i,
      format: (m) => m[1].trim().toLowerCase(),
    },
    {
      pattern:
        /\s*(?:\(|\[)\s*(deluxe(?:\s+edition)?|expanded(?:\s+edition)?|remastered(?:\s+\d{4})?|remaster|special\s+edition|anniversary\s+edition|super\s+deluxe|live|acoustic)\s*(?:\)|\])/i,
      format: (m) => m[1].trim().toLowerCase(),
    },
    {
      pattern:
        /\s+\b(deluxe\s+edition|expanded\s+edition|special\s+edition|anniversary\s+edition|super\s+deluxe|taylor'?s\s+version|deluxe|expanded|remastered|remaster|acoustic|live)\b/i,
      format: (m) => m[1].trim().toLowerCase(),
    },
  ];
  for (const { pattern, format } of editionExtractors) {
    const match = working.match(pattern);
    if (match) {
      const candidate = working
        .replace(pattern, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (candidate) {
        edition = format(match);
        working = candidate;
        break;
      }
    }
  }

  // 3. Type hints (album, ep, single, song, soundtrack, ost)
  let type: string | null = null;
  const typePatterns: { pattern: RegExp; value?: string }[] = [
    {
      pattern:
        /\s*(?:\(|\[)\s*(album|ep|single|song|soundtrack|ost)\s*(?:\)|\])\s*$/i,
    },
    {
      pattern: /\s+\bthe\s+album\s*$/i,
      value: 'album',
    },
    {
      pattern: /\s+\b(album|ep|single|song|soundtrack|ost)\s*$/i,
    },
  ];
  for (const { pattern, value } of typePatterns) {
    const match = working.match(pattern);
    if (match) {
      const candidate = working
        .replace(pattern, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (candidate) {
        type = (value ?? match[1]).trim().toLowerCase();
        working = candidate;
        break;
      }
    }
  }

  // 4. 4-digit year (only when non-empty query remains, preserving titles like "1989").
  // The year may also be a title ("Taylor Swift 1989", "Prince 1999"): the
  // search runs both readings and selectTopResult prefers a release titled
  // with the year by the named artist.
  let year: number | null = null;
  const yearMatch = working.match(/(?:^|\s)(19\d{2}|20\d{2})(?=\s|$)/);
  if (yearMatch) {
    const candidate = working
      .replace(/(?:^|\s)(19\d{2}|20\d{2})(?=\s|$)/, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate) {
      year = Number(yearMatch[1]);
      working = candidate;
    }
  }

  // 5. Structured artist/title separators: "Y - X", "Y – X" (explicit), and
  // the guesses "X by Y" and "Y: X" ("Stand by Me", "Star Wars: A New Hope"
  // are titles), which resolveMusicQuerySplit checks against results.
  let artist: string | null = null;
  let title: string | null = null;
  const dashMatch = working.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  const byMatch = allowTentative ? working.match(/^(.+)\s+by\s+(.+)$/i) : null;
  if (byMatch && !dashMatch) {
    const parsedTitle = byMatch[1].trim();
    const parsedArtist = byMatch[2].trim();
    if (parsedTitle && parsedArtist) {
      title = parsedTitle;
      artist = parsedArtist;
      tentativeSplit = true;
    }
  } else if (dashMatch) {
    const parsedArtist = dashMatch[1].trim();
    const parsedTitle = dashMatch[2].trim();
    if (parsedArtist && parsedTitle) {
      artist = parsedArtist;
      title = parsedTitle;
    }
  } else if (allowTentative) {
    const colonMatch = working.match(/^(.+?):\s+(.+)$/);
    if (colonMatch) {
      const parsedArtist = colonMatch[1].trim();
      const parsedTitle = colonMatch[2].trim();
      if (parsedArtist && parsedTitle) {
        artist = parsedArtist;
        title = parsedTitle;
        tentativeSplit = true;
      }
    }
  }

  if (title === null && artist === null && extraArtists.length > 0) {
    title = working;
  }

  return {
    artist,
    title,
    year,
    edition,
    type,
    extraArtists,
    cleanQuery: working,
    ...(tentativeSplit ? { tentativeSplit: true, rawQuery } : {}),
  };
};

/**
 * Keeps a guessed artist/title split ("X by Y", "Y: X", "X with Y") only when
 * the results support it. When a result is titled like the whole query
 * ("Stand by Me", "Dancing with a Stranger", "Star Wars: A New Hope ..."), or
 * no result is by the guessed artist, the whole query is searched as typed.
 */
export const resolveMusicQuerySplit = (
  parsed: MusicQueryParseDetails,
  results: {
    artists: Pick<AurralNormalizedArtist, 'name'>[];
    albums: Pick<AurralNormalizedAlbum, 'title' | 'artistName'>[];
    tracks: Pick<AurralNormalizedTrack, 'title' | 'artistName'>[];
  }
): MusicQueryParseDetails => {
  if (!parsed.tentativeSplit || parsed.rawQuery === undefined) {
    return parsed;
  }
  const whole = parseMusicQuery(parsed.rawQuery, { tentativeSplits: false });
  const wholeNorm = normalizeMusicSearchText(whole.cleanQuery);

  // Compared without "(feat. X)" / "(with X)" credits: "Dracula (with
  // JENNIE)" supports the featured-artist reading of "Dracula with Jennie".
  const titledLikeWhole = (title: string) => {
    if (!wholeNorm) return false;
    const base = normalizeMusicSearchText(stripTrackFeaturedParens(title));
    return musicNamesEqual(base, wholeNorm) || base.startsWith(`${wholeNorm} `);
  };
  if (
    results.tracks.some((track) => titledLikeWhole(track.title)) ||
    results.albums.some((album) => titledLikeWhole(album.title))
  ) {
    return whole;
  }

  const guessedArtists = [
    ...(parsed.artist ? [parsed.artist] : []),
    ...parsed.extraArtists.filter(
      (extra) => !whole.extraArtists.includes(extra)
    ),
  ]
    .map(normalizeMusicSearchText)
    .filter(Boolean);
  const supports = (text: string, guess: string) =>
    musicNamesEqual(text, guess) ||
    (guess.length >= 3 && containsMusicWords(text, guess));
  const creditTexts = [
    ...results.artists.map((artist) => artist.name),
    ...results.tracks.flatMap((track) => [track.artistName, track.title]),
    ...results.albums.map((album) => album.artistName),
  ]
    .map(normalizeMusicSearchText)
    .filter(Boolean);
  const supported =
    guessedArtists.length > 0 &&
    guessedArtists.every((guess) =>
      creditTexts.some((text) => supports(text, guess))
    );

  return supported ? parsed : whole;
};

export const formatParsedMusicQuery = (
  details: MusicQueryParseDetails
): ParsedMusicQuery | null => {
  if (
    details.artist === null &&
    details.title === null &&
    details.year === null &&
    details.edition === null &&
    details.type === null
  ) {
    return null;
  }
  return {
    artist: details.artist,
    title: details.title,
    year: details.year,
    edition: details.edition,
    type: details.type,
  };
};

export const stripMusicSearchFiller = (query: string): string | null => {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    return null;
  }

  let working = query.trim();
  for (const pattern of FILLER_PHRASES) {
    working = working.replace(pattern, ' ');
  }
  working = working.replace(/\s+/g, ' ').trim();
  if (!working || working.toLowerCase() === query.trim().toLowerCase()) {
    return null;
  }
  return working;
};

export const hasCoverPenalty = (
  track: Pick<AurralNormalizedTrack, 'title' | 'artistName' | 'albumTitle'>,
  query: string
): boolean => {
  const haystack = `${track.title} ${track.artistName} ${track.albumTitle ?? ''}`;
  const queryText = query.trim();

  return COVER_PENALTY_RULES.some(
    ({ pattern }) => pattern.test(haystack) && !pattern.test(queryText)
  );
};

const tokenOverlapFraction = (
  queryNorm: string,
  targetNorm: string
): number => {
  const queryTokens = queryNorm.split(' ').filter(Boolean);
  if (queryTokens.length === 0) return 0;
  const targetTokens = new Set(targetNorm.split(' ').filter(Boolean));
  let matched = 0;
  for (const token of queryTokens) {
    if (
      targetTokens.has(token) ||
      [...targetTokens].some((target) => target.startsWith(token))
    ) {
      matched += 1;
    }
  }
  return matched / queryTokens.length;
};

export const scoreTrack = (
  track: AurralNormalizedTrack,
  context: {
    query: string;
    parsed: MusicQueryParseDetails;
    originalIndex: number;
    popularityRank?: number;
    matchingYearAlbumTitles?: Set<string>;
  }
): number => {
  const {
    query,
    parsed,
    originalIndex,
    popularityRank,
    matchingYearAlbumTitles,
  } = context;
  const normCleanQuery = normalizeMusicSearchText(parsed.cleanQuery || query);
  const normArtist = normalizeMusicSearchText(track.artistName);
  const normBaseTitle = normalizeMusicSearchText(
    stripTrackFeaturedParens(track.title)
  );
  const normFullTitle = normalizeMusicSearchText(track.title);
  const normAlbum = track.albumTitle
    ? normalizeMusicSearchText(track.albumTitle)
    : '';
  const parsedArtistNorm = parsed.artist
    ? normalizeMusicSearchText(parsed.artist)
    : null;
  const parsedTitleNorm = parsed.title
    ? normalizeMusicSearchText(parsed.title)
    : null;

  const titleTarget = parsedTitleNorm ?? normCleanQuery;
  let matchScore = 0;

  // Title match quality (exact > prefix > contains)
  if (titleTarget) {
    if (normBaseTitle === titleTarget || normFullTitle === titleTarget) {
      matchScore += 100;
    } else if (
      normBaseTitle.startsWith(`${titleTarget} `) ||
      normBaseTitle.startsWith(titleTarget)
    ) {
      matchScore += 65;
    } else if (normBaseTitle.includes(titleTarget)) {
      matchScore += 35;
    } else if (titleTarget.includes(' ')) {
      const overlap = tokenOverlapFraction(
        titleTarget,
        `${normBaseTitle} ${normArtist}`
      );
      if (overlap >= 1) {
        matchScore += 80;
      } else if (overlap >= 0.6) {
        matchScore += 25 * overlap;
      }
    }
  }

  // Artist match quality & boost
  let artistBoost = 0;
  if (parsedArtistNorm) {
    if (musicNamesEqual(normArtist, parsedArtistNorm)) {
      artistBoost = 95;
    } else if (
      normArtist.startsWith(`${parsedArtistNorm} `) ||
      (parsedArtistNorm.length >= 3 &&
        containsMusicWords(normArtist, parsedArtistNorm))
    ) {
      artistBoost = 55;
    }
  } else if (normCleanQuery) {
    if (musicNamesEqual(normArtist, normCleanQuery)) {
      artistBoost = 115;
    } else if (
      normCleanQuery.length >= 3 &&
      (normArtist.startsWith(`${normCleanQuery} `) ||
        normArtist.includes(normCleanQuery))
    ) {
      artistBoost = 50;
    } else if (normArtist.length >= 3) {
      // "too sweet hozier" / "hozier too sweet": the query is this song's
      // artist plus exactly its title, so it beats an upload titled with the
      // whole query ("Too sweet hozier" by someone else). A title that only
      // contains an artist's name ("dancing queen") boosts nothing.
      const rest = normCleanQuery.startsWith(`${normArtist} `)
        ? normCleanQuery.slice(normArtist.length + 1).trim()
        : normCleanQuery.endsWith(` ${normArtist}`)
          ? normCleanQuery.slice(0, -normArtist.length - 1).trim()
          : '';
      if (rest && rest === normBaseTitle) artistBoost = 70;
    }
  }

  // Extra artists (feat./ft./with) boost against artist/title credits, never matched against title as main query
  if (parsed.extraArtists.length > 0) {
    for (const extra of parsed.extraArtists) {
      const normExtra = normalizeMusicSearchText(extra);
      if (
        normExtra &&
        (normArtist.includes(normExtra) || normFullTitle.includes(normExtra))
      ) {
        artistBoost += 30;
      }
    }
  }

  // Edition & type & year hints
  let metadataBoost = 0;
  if (parsed.edition) {
    const normEdition = normalizeMusicSearchText(parsed.edition);
    if (
      normEdition &&
      (normFullTitle.includes(normEdition) || normAlbum.includes(normEdition))
    ) {
      metadataBoost += 15;
    }
  }
  if (parsed.type === 'soundtrack' || parsed.type === 'ost') {
    if (
      /\b(?:soundtrack|motion picture|ost|original score)\b/i.test(
        `${track.title} ${track.albumTitle ?? ''}`
      )
    ) {
      metadataBoost += 20;
    }
  }
  if (parsed.year !== null) {
    const yearStr = String(parsed.year);
    if (
      (normAlbum && matchingYearAlbumTitles?.has(normAlbum)) ||
      track.albumTitle?.includes(yearStr)
    ) {
      metadataBoost += 25;
    }
    // "Prince 1999": the year can be the song's title.
    if (
      normBaseTitle === yearStr &&
      normCleanQuery &&
      musicNamesEqual(normArtist, normCleanQuery)
    ) {
      metadataBoost += 60;
    }
  }

  // Log-scaled Deezer order / popularity
  const popularityScore =
    popularityRank !== undefined && popularityRank > 0
      ? Math.log10(popularityRank + 1) * 4
      : 20 / Math.log2(originalIndex + 2);

  const penalty = hasCoverPenalty(track, parsed.cleanQuery || query) ? 90 : 0;
  const ownedTieBreaker = track.inLibrary ? 2 : 0;

  return (
    matchScore +
    artistBoost +
    metadataBoost +
    popularityScore +
    ownedTieBreaker -
    penalty
  );
};

export const dedupeTracks = (
  tracks: AurralNormalizedTrack[]
): AurralNormalizedTrack[] => {
  const result: AurralNormalizedTrack[] = [];
  const indexByKey = new Map<string, number>();

  for (const track of tracks) {
    const key = `${normalizeMusicSearchText(track.artistName)}|${normalizeMusicSearchText(track.title)}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, result.length);
      result.push(track);
    } else if (track.inLibrary && !result[existingIndex].inLibrary) {
      result[existingIndex] = track;
    }
  }

  return result;
};

export const rankAndDedupeTracks = (
  tracks: AurralNormalizedTrack[],
  query: string,
  parsed: MusicQueryParseDetails,
  matchingYearAlbumTitles?: Set<string>
): AurralNormalizedTrack[] => {
  const scored = tracks.map((track, originalIndex) => ({
    track,
    originalIndex,
    score: scoreTrack(track, {
      query,
      parsed,
      originalIndex,
      matchingYearAlbumTitles,
    }),
  }));

  scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

  return dedupeTracks(scored.map((entry) => entry.track));
};

export const hasTrackMatchingArtistAndTitle = (
  tracks: AurralNormalizedTrack[],
  parsed: MusicQueryParseDetails
): boolean => {
  if (!parsed.artist || !parsed.title) {
    return true;
  }
  const targetArtist = normalizeMusicSearchText(parsed.artist);
  const targetTitle = normalizeMusicSearchText(parsed.title);
  if (!targetArtist || !targetTitle) {
    return true;
  }

  return tracks.some((track) => {
    if (hasCoverPenalty(track, `${parsed.artist} ${parsed.title}`)) {
      return false;
    }
    const normArtist = normalizeMusicSearchText(track.artistName);
    const normTitle = normalizeMusicSearchText(
      stripTrackFeaturedParens(track.title)
    );
    // A track without an artist name is no evidence for the artist.
    const artistMatches =
      normArtist.length > 0 &&
      (musicNamesEqual(normArtist, targetArtist) ||
        containsMusicWords(normArtist, targetArtist) ||
        containsMusicWords(targetArtist, normArtist));
    const titleMatches =
      normTitle === targetTitle ||
      normTitle.startsWith(`${targetTitle} `) ||
      normTitle.includes(targetTitle);
    return artistMatches && titleMatches;
  });
};

export const sortArtistsForSearch = (
  artists: AurralNormalizedArtist[],
  query: string,
  parsed: MusicQueryParseDetails
): AurralNormalizedArtist[] => {
  const target = musicMatchKey(parsed.artist ?? (parsed.cleanQuery || query));
  return artists
    .map((artist, index) => ({
      artist,
      index,
      hasMbid: artist.mbid ? 1 : 0,
      exactMatch:
        target && musicNamesEqual(musicMatchKey(artist.name), target) ? 1 : 0,
    }))
    .sort(
      // The artist the user typed comes first, with or without an MBID.
      (a, b) =>
        b.exactMatch - a.exactMatch ||
        b.hasMbid - a.hasMbid ||
        a.index - b.index
    )
    .map((entry) => entry.artist);
};

/** Key for matching an album across catalogs: artist + title without edition words. */
export const albumPopularityKey = (artistName: string, title: string) =>
  `${musicMatchKey(artistName)}|${stripEditionWords(title)}`;

export const sortAlbumsForSearch = (
  albums: AurralNormalizedAlbum[],
  query: string,
  parsed: MusicQueryParseDetails,
  // Deezer's album search order (0 = first) for a title several albums share
  popularity?: ReadonlyMap<string, number>
): AurralNormalizedAlbum[] => {
  const strippedQuery = stripEditionWords(parsed.cleanQuery || query);
  const yearPrefix = parsed.year !== null ? String(parsed.year) : null;
  const editionNorm = parsed.edition
    ? normalizeMusicSearchText(parsed.edition)
    : null;
  const typeLower = parsed.type?.toLowerCase() ?? null;

  return albums
    .map((album, index) => {
      const hasMbid = album.mbid ? 1 : 0;
      const exactTitle =
        strippedQuery && stripEditionWords(album.title) === strippedQuery
          ? 1
          : 0;
      const yearMatch =
        yearPrefix && album.releaseDate?.startsWith(yearPrefix) ? 1 : 0;
      const editionMatch =
        editionNorm &&
        normalizeMusicSearchText(album.title).includes(editionNorm)
          ? 1
          : 0;
      const typeMatch =
        typeLower && album.primaryType.toLowerCase() === typeLower ? 1 : 0;
      // "Taylor Swift 1989": an album titled with the year.
      const yearTitle =
        yearPrefix && stripEditionWords(album.title) === yearPrefix ? 1 : 0;
      // "abbey road": among albums with the title, the one Deezer lists first
      // (The Beatles) leads, not a single that happens to share it
      const rank = exactTitle
        ? popularity?.get(albumPopularityKey(album.artistName, album.title))
        : undefined;
      const popular = rank === undefined ? 0 : Math.max(0, 60 - rank * 10);
      return {
        album,
        index,
        // The exact title comes first; an MBID only breaks ties.
        score:
          yearTitle * 130 +
          exactTitle * 120 +
          hasMbid * 100 +
          popular +
          yearMatch * 20 +
          editionMatch * 8 +
          typeMatch * 5,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.album);
};

export const mergeArtists = (
  primary: AurralNormalizedArtist[],
  secondary: AurralNormalizedArtist[]
): AurralNormalizedArtist[] => {
  const result: AurralNormalizedArtist[] = [];
  const byKey = new Map<string, number>();

  for (const artist of [...primary, ...secondary]) {
    const normName = musicMatchKey(artist.name);
    if (!normName) continue;
    const key = artist.mbid ? `mbid:${artist.mbid}` : `name:${normName}`;
    const existingIdx = byKey.get(key) ?? byKey.get(`name:${normName}`);

    if (existingIdx === undefined) {
      const idx = result.length;
      result.push(artist);
      byKey.set(key, idx);
      byKey.set(`name:${normName}`, idx);
    } else {
      const existing = result[existingIdx];
      result[existingIdx] = {
        mbid: existing.mbid ?? artist.mbid,
        name: existing.name,
        image: existing.image ?? artist.image,
        inLibrary: existing.inLibrary || artist.inLibrary,
      };
      if (artist.mbid) {
        byKey.set(`mbid:${artist.mbid}`, existingIdx);
      }
    }
  }

  return result;
};

export const mergeAlbums = (
  primary: AurralNormalizedAlbum[],
  secondary: AurralNormalizedAlbum[]
): AurralNormalizedAlbum[] => {
  const result: AurralNormalizedAlbum[] = [];
  const byKey = new Map<string, number>();

  for (const album of [...primary, ...secondary]) {
    const titleKey = `${normalizeMusicSearchText(album.artistName)}|${normalizeMusicSearchText(album.title)}`;
    const key = album.mbid ? `mbid:${album.mbid}` : `title:${titleKey}`;
    const existingIdx = byKey.get(key) ?? byKey.get(`title:${titleKey}`);

    if (existingIdx === undefined) {
      const idx = result.length;
      result.push(album);
      byKey.set(key, idx);
      byKey.set(`title:${titleKey}`, idx);
    } else {
      const existing = result[existingIdx];
      result[existingIdx] = {
        ...existing,
        mbid: existing.mbid ?? album.mbid,
        artistMbid: existing.artistMbid ?? album.artistMbid,
        coverUrl: existing.coverUrl ?? album.coverUrl,
        releaseDate: existing.releaseDate ?? album.releaseDate,
        inLibrary: existing.inLibrary || album.inLibrary,
      };
      if (album.mbid) {
        byKey.set(`mbid:${album.mbid}`, existingIdx);
      }
    }
  }

  return result;
};

// Deezer track rank (0 to 1,000,000) above which a song beats a same-titled
// album ("hello": Adele's song, not an album called Hello)
export const FAMOUS_SONG_RANK = 400_000;

export const selectTopResult = ({
  query,
  parsed,
  artists,
  albums,
  tracks,
  upstreamTop,
  popularAlbum = null,
}: {
  query: string;
  parsed: MusicQueryParseDetails;
  artists: AurralNormalizedArtist[];
  albums: AurralNormalizedAlbum[];
  tracks: AurralNormalizedTrack[];
  upstreamTop: AurralNormalizedTopResult | null;
  /** The full album Deezer lists first for exactly this title, if any. */
  popularAlbum?: AurralNormalizedAlbum | null;
}): AurralNormalizedTopResult | null => {
  const cleanNorm = musicMatchKey(parsed.cleanQuery || query);
  const parsedArtistNorm = parsed.artist
    ? normalizeMusicSearchText(parsed.artist)
    : null;
  const hasExplicitArtistAndTitle = Boolean(parsed.artist && parsed.title);

  // "Taylor Swift 1989", "Prince 1999": the trailing year is a title when
  // the named artist has a release with that title. Otherwise it stays a
  // year filter ("taylor swift 2019").
  if (parsed.year !== null && cleanNorm && !hasExplicitArtistAndTitle) {
    const yearText = String(parsed.year);
    const byArtist = (name: string) =>
      musicNamesEqual(musicMatchKey(name), cleanNorm);
    const yearAlbums = albums.filter(
      (album) =>
        stripEditionWords(album.title) === yearText &&
        byArtist(album.artistName)
    );
    const yearAlbum =
      yearAlbums.find((album) => album.mbid !== null) ?? yearAlbums[0];
    if (yearAlbum) {
      return { type: 'album', ...yearAlbum };
    }
    const yearTrack = tracks.find(
      (track) =>
        normalizeMusicSearchText(stripTrackFeaturedParens(track.title)) ===
          yearText && byArtist(track.artistName)
    );
    if (yearTrack) {
      return { type: 'track', ...yearTrack };
    }
  }

  // A famous song beats an obscure artist or album with the same name: when
  // most of the top songs carry the searched title ("mr brightside", or "i
  // wanna dance with somebody" for "... (Who Loves Me)"), the song the catalog
  // ranks first is what people mean. The artist still shows below.
  // Among the songs with that title the most popular one wins (Deezer rank,
  // 0 when unknown); ties keep the ranked order.
  if (cleanNorm && !hasExplicitArtistAndTitle) {
    const sameTitle = tracks
      .slice(0, 5)
      .filter((track) => isSameTitleTrack(track, cleanNorm));
    if (
      sameTitle.length >= 3 &&
      !artists.some(
        (artist) =>
          artist.inLibrary &&
          musicNamesEqual(musicMatchKey(artist.name), cleanNorm)
      )
    ) {
      const [best] = tracks
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => isSameTitleTrack(track, cleanNorm))
        .sort(
          (a, b) =>
            (b.track.popularity ?? 0) - (a.track.popularity ?? 0) ||
            a.index - b.index
        );
      // "abbey road": many songs carry the title but none is famous, and the
      // album people mean is the one Deezer lists first
      if (popularAlbum && (best.track.popularity ?? 0) < FAMOUS_SONG_RANK) {
        return { type: 'album', ...popularAlbum };
      }
      return { type: 'track', ...best.track };
    }
  }

  // 4. [5] Artist top result
  if (cleanNorm && !hasExplicitArtistAndTitle) {
    const matchingArtist =
      artists.find(
        (artist) =>
          artist.mbid !== null &&
          musicNamesEqual(musicMatchKey(artist.name), cleanNorm)
      ) ??
      artists.find((artist) =>
        musicNamesEqual(musicMatchKey(artist.name), cleanNorm)
      );
    if (matchingArtist) {
      return { type: 'artist', ...matchingArtist };
    }

    const topFiveTracks = tracks.slice(0, 5);
    const matchingTracks = topFiveTracks.filter((track) =>
      musicNamesEqual(musicMatchKey(track.artistName), cleanNorm)
    );
    if (matchingTracks.length >= 3) {
      const withMbid = matchingTracks.find((track) => track.artistMbid);
      return {
        type: 'artist',
        mbid: withMbid?.artistMbid ?? null,
        name: matchingTracks[0].artistName,
        image: null,
        inLibrary: matchingTracks.some((track) => track.inLibrary),
      };
    }
  }

  // 5. [6] Album top result
  const strippedQuery = stripEditionWords(parsed.cleanQuery || query);
  if (strippedQuery && !hasExplicitArtistAndTitle) {
    const editionNorm = parsed.edition
      ? normalizeMusicSearchText(parsed.edition)
      : null;
    const matchingAlbums = albums.filter((album) => {
      const albumTitleStripped = stripEditionWords(album.title);
      if (albumTitleStripped !== strippedQuery) {
        return false;
      }
      if (parsedArtistNorm) {
        const albumArtistNorm = normalizeMusicSearchText(album.artistName);
        return (
          musicNamesEqual(albumArtistNorm, parsedArtistNorm) ||
          (parsedArtistNorm.length >= 3 &&
            containsMusicWords(albumArtistNorm, parsedArtistNorm))
        );
      }
      return true;
    });

    if (matchingAlbums.length > 0) {
      const preferredAlbum =
        (editionNorm
          ? matchingAlbums.find((album) =>
              normalizeMusicSearchText(album.title).includes(editionNorm)
            )
          : undefined) ??
        matchingAlbums.find((album) => album.mbid !== null) ??
        matchingAlbums[0];
      return { type: 'album', ...preferredAlbum };
    }
  }

  if (hasExplicitArtistAndTitle && tracks.length > 0) {
    return { type: 'track', ...tracks[0] };
  }

  if (upstreamTop && upstreamTop.type !== 'track') {
    return upstreamTop;
  }

  if (tracks.length > 0) {
    return { type: 'track', ...tracks[0] };
  }

  if (artists.length > 0) {
    return { type: 'artist', ...artists[0] };
  }

  if (albums.length > 0) {
    return { type: 'album', ...albums[0] };
  }

  return upstreamTop;
};

const matchesLibraryQuery = (
  combinedText: string,
  normQuery: string,
  queryTokens: string[],
  artistName?: string
): boolean => {
  const normTarget = musicMatchKey(combinedText);
  if (!normQuery || !normTarget) {
    return false;
  }
  if (queryTokens.length === 0) {
    // One-letter queries ("X"): the whole text, or the artist, must match.
    return (
      musicNamesEqual(normTarget, normQuery) ||
      (artistName !== undefined &&
        musicNamesEqual(musicMatchKey(artistName), normQuery))
    );
  }
  const targetTokens = normTarget.split(' ').filter(Boolean);
  if (
    queryTokens.every((token) =>
      targetTokens.some((targetToken) => targetToken.startsWith(token))
    )
  ) {
    return true;
  }
  // "acdc" for AC/DC, "mia" for M.I.A.: the query, without spaces, may span
  // several consecutive words of the target (starting at a word start).
  const compactQuery = compactMusicSearchText(normQuery);
  if (compactQuery.length < 3) {
    return false;
  }
  for (let start = 0; start < targetTokens.length; start += 1) {
    let joined = targetTokens[start];
    for (
      let end = start + 1;
      end < targetTokens.length && joined.length < compactQuery.length;
      end += 1
    ) {
      joined += targetTokens[end];
      if (joined.startsWith(compactQuery)) {
        return true;
      }
    }
  }
  return false;
};

export const filterLibraryHits = (
  query: string,
  library: AurralLibrarySearchResult
): AurralLibrarySearchResult => {
  const normQuery = musicMatchKey(query);
  if (!normQuery) {
    return { artists: [], albums: [], tracks: [] };
  }
  const queryTokens = normQuery.split(' ').filter((token) => token.length >= 2);

  return {
    artists: library.artists.filter((artist) =>
      matchesLibraryQuery(artist.name, normQuery, queryTokens)
    ),
    albums: library.albums.filter((album) =>
      matchesLibraryQuery(
        `${album.title} ${album.artistName}`,
        normQuery,
        queryTokens,
        album.artistName
      )
    ),
    tracks: library.tracks.filter((track) =>
      matchesLibraryQuery(
        `${track.title} ${track.artistName} ${track.albumTitle ?? ''}`,
        normQuery,
        queryTokens,
        track.artistName
      )
    ),
  };
};

export interface DominantTrackArtist {
  name: string;
  mbid: string | null;
}

/**
 * The artist most of the top songs belong to when that artist's name is the
 * query: "pink" finds three of five songs by "P!nk". Null for "artist - title"
 * searches, or when no one artist (by exact display name) has at least three
 * of the top five songs.
 */
export const findDominantTrackArtist = ({
  query,
  parsed,
  tracks,
}: {
  query: string;
  parsed: MusicQueryParseDetails;
  tracks: AurralNormalizedTrack[];
}): DominantTrackArtist | null => {
  if (parsed.artist && parsed.title) return null;
  const cleanNorm = musicMatchKey(parsed.cleanQuery || query);
  if (!cleanNorm) return null;
  const groups = new Map<string, AurralNormalizedTrack[]>();
  for (const track of tracks.slice(0, 5)) {
    const name = track.artistName.trim();
    if (!name || !musicNamesEqual(musicMatchKey(name), cleanNorm)) continue;
    groups.set(name, [...(groups.get(name) ?? []), track]);
  }
  let best: [string, AurralNormalizedTrack[]] | null = null;
  for (const entry of groups) {
    if (!best || entry[1].length > best[1].length) best = entry;
  }
  if (!best || best[1].length < 3) return null;
  const mbidCounts = new Map<string, number>();
  for (const track of best[1]) {
    if (!track.artistMbid) continue;
    const key = track.artistMbid.toLowerCase();
    mbidCounts.set(key, (mbidCounts.get(key) ?? 0) + 1);
  }
  const mbid = [...mbidCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { name: best[0], mbid };
};

export type TrackArtistResolution =
  | { kind: 'keep' }
  | { kind: 'promote'; artist: AurralNormalizedArtist }
  | { kind: 'lookup' };

/**
 * Whether the Artists row already leads with the artist the top songs belong
 * to. "pink" can bring back an obscure "PINK" while every song is by "P!nk":
 * then P!nk is promoted (when the songs carry her MBID or she is listed
 * further down) or looked up by her exact name. A same-name artist the user
 * owns always stays on top.
 */
export const planTrackArtistResolution = ({
  query,
  parsed,
  artists,
  libraryArtists,
  dominant,
}: {
  query: string;
  parsed: MusicQueryParseDetails;
  artists: AurralNormalizedArtist[];
  libraryArtists: AurralNormalizedArtist[];
  dominant: DominantTrackArtist;
}): TrackArtistResolution => {
  const cleanNorm = musicMatchKey(parsed.cleanQuery || query);
  const sameName = (artist: AurralNormalizedArtist) =>
    musicNamesEqual(musicMatchKey(artist.name), cleanNorm);
  if (
    libraryArtists.some(sameName) ||
    artists.some((artist) => artist.inLibrary && sameName(artist))
  ) {
    return { kind: 'keep' };
  }
  const mbid = dominant.mbid?.toLowerCase() ?? null;
  const byMbid = (artist: AurralNormalizedArtist) =>
    Boolean(mbid) && artist.mbid?.toLowerCase() === mbid;
  const exact = artists.filter(
    (artist) => artist.name.trim() === dominant.name
  );
  const present =
    exact.find(byMbid) ??
    exact.find((artist) => artist.mbid) ??
    exact[0] ??
    artists.find(byMbid);
  if (present) {
    return artists.find(sameName) === present
      ? { kind: 'keep' }
      : { kind: 'promote', artist: present };
  }
  if (dominant.mbid) {
    return {
      kind: 'promote',
      artist: {
        mbid: dominant.mbid,
        name: dominant.name,
        image: null,
        inLibrary: false,
      },
    };
  }
  return { kind: 'lookup' };
};

/**
 * The looked-up artist for the top songs: same normalised name, the exact
 * display name first ("P!nk" over "PINK"), then the search score.
 */
export const pickTrackArtistMatch = (
  candidates: { mbid: string; name: string; score: number }[],
  dominant: DominantTrackArtist
): AurralNormalizedArtist | null => {
  const target = musicMatchKey(dominant.name);
  const lower = dominant.name.toLocaleLowerCase();
  const rank = (name: string) =>
    name.trim() === dominant.name
      ? 2
      : name.trim().toLocaleLowerCase() === lower
        ? 1
        : 0;
  const best = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) =>
      musicNamesEqual(musicMatchKey(candidate.name), target)
    )
    .sort(
      (a, b) =>
        rank(b.candidate.name) - rank(a.candidate.name) ||
        b.candidate.score - a.candidate.score ||
        a.index - b.index
    )[0]?.candidate;
  return best
    ? { mbid: best.mbid, name: best.name, image: null, inLibrary: false }
    : null;
};

/**
 * The artist of the top songs among catalog search results for their exact
 * display name: the same display name ignoring case ("P!nk"), or the only
 * candidate when its normalised name matches. Artists listed under another
 * display name (the obscure "PINK") are excluded by MBID.
 */
export const pickCatalogTrackArtist = (
  candidates: AurralNormalizedArtist[],
  dominant: DominantTrackArtist,
  excludedMbids: Set<string>
): AurralNormalizedArtist | null => {
  const usable = new Map<string, AurralNormalizedArtist>();
  for (const candidate of candidates) {
    const mbid = candidate.mbid?.trim().toLowerCase();
    if (!mbid || excludedMbids.has(mbid) || usable.has(mbid)) continue;
    usable.set(mbid, candidate);
  }
  const lower = dominant.name.trim().toLocaleLowerCase();
  const exact = [...usable.values()].find(
    (candidate) => candidate.name.trim().toLocaleLowerCase() === lower
  );
  if (exact) return exact;
  if (usable.size === 1) {
    const [only] = usable.values();
    if (musicNamesEqual(musicMatchKey(only.name), musicMatchKey(dominant.name)))
      return only;
  }
  return null;
};

/** Puts the artist first, merged with its listed copy when there is one. */
export const promoteArtist = (
  artists: AurralNormalizedArtist[],
  artist: AurralNormalizedArtist
): AurralNormalizedArtist[] => {
  const key = artist.mbid?.toLowerCase();
  const existing =
    artists.find((entry) => entry === artist) ??
    (key ? artists.find((entry) => entry.mbid?.toLowerCase() === key) : null);
  const lead = existing
    ? {
        ...existing,
        mbid: existing.mbid ?? artist.mbid,
        image: existing.image ?? artist.image,
      }
    : artist;
  return [lead, ...artists.filter((entry) => entry !== existing)];
};

/**
 * Songs without an artist MBID by the response's exact-name artist get that
 * artist's MBID: only when the display names are equal ignoring case ("PINK"
 * never lends its MBID to "P!nk"), or, with `allowNormalized`, when the
 * anchor is the artist resolved from these very songs. Songs that already
 * carry a different MBID keep it.
 */
export const fillTrackArtistMbids = <T extends AurralNormalizedTrack>(
  tracks: T[],
  anchor: { name: string; mbid: string | null } | null,
  { allowNormalized = false }: { allowNormalized?: boolean } = {}
): T[] => {
  if (!anchor?.mbid) return tracks;
  const target = musicMatchKey(anchor.name);
  if (!target) return tracks;
  const lower = anchor.name.trim().toLocaleLowerCase();
  const mbid = anchor.mbid;
  return tracks.map((track) =>
    !track.artistMbid &&
    (track.artistName.trim().toLocaleLowerCase() === lower ||
      (allowNormalized &&
        musicNamesEqual(musicMatchKey(track.artistName), target)))
      ? { ...track, artistMbid: mbid }
      : track
  );
};
