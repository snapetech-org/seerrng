import ListenBrainzAPI from '@server/api/listenbrainz';
import { ownedSongKey } from '@server/lib/musicOwnedSongs';
import {
  compactMusicSearchText,
  normalizeMusicSearchText,
  stripTrackTitleExtras,
} from '@server/lib/musicSearch';
import { mapWithConcurrency } from '@server/utils/concurrency';

/**
 * One rule set for an artist's release groups, used by the artist page, the
 * album page, search, requests and "Get all releases": every song once, not
 * once per release.
 *
 * - Every missing studio album is wanted (one edition per title).
 * - A single or EP only adds what no studio album (or an owned or requested
 *   release) already brings. Songs compare by title without catalog extras,
 *   so "(Radio Edit)", "(Single Version)" or "- 2012 Remaster" are the same
 *   song, while "(Live)", "(Remix)", "(Acoustic)", "(Demo)" or
 *   "(Instrumental)" are different recordings.
 * - Promo, bootleg and platform-exclusive releases are never wanted (they can
 *   rarely be found anyway).
 */

export const REQUEST_ALL_MAX_INSPECTED_RELEASE_GROUPS = 150;
export const REQUEST_ALL_TRACKLIST_CONCURRENCY = 4;

export type RequestAllPrimaryType = 'Album' | 'EP' | 'Single';

export interface RequestAllReleaseGroup {
  id: string;
  title: string;
  year: number | null;
  primaryType: string;
  secondaryTypes?: string[];
  /** MusicBrainz release statuses (Official, Promotion, Bootleg, ...). */
  releaseStatuses?: string[];
  /** Artist MBIDs in the release group's credit, when the catalog gives them. */
  artistCreditIds?: string[];
  inLibrary?: boolean;
  partial?: boolean;
  requested?: boolean;
  blocklisted?: boolean;
}

export interface RequestAllTrack {
  title: string;
  durationMs?: number;
}

export interface RequestAllPlanItem {
  mbid: string;
  title: string;
  primaryType: RequestAllPrimaryType;
  year: number | null;
  /** Songs on it that nothing else in the plan or the library brings. */
  newSongs?: number;
}

/** One song of a partly new single or EP, requested on its own. */
export interface RequestAllSong {
  title: string;
  artistName: string;
  fromReleaseMbid: string;
  fromReleaseTitle: string;
  durationMs?: number;
  /** The exact release (edition) the song is on, for a bonus track. */
  releaseMbid?: string;
  /** Why it is asked for on its own, e.g. "bonus track on {edition}". */
  reason?: string;
}

/** One official release (edition) of a release group, with its tracks. */
export interface ReleaseGroupEdition {
  releaseMbid: string;
  releaseTitle: string;
  tracks: RequestAllTrack[];
}

export type RequestAllSkipReasonCode =
  | 'owned'
  | 'partial'
  | 'requested'
  | 'blocklisted'
  | 'sameAlbum'
  | 'covered'
  | 'duplicate'
  | 'unofficial'
  | 'newSongsOnly';

export interface RequestAllSkip {
  mbid: string;
  title: string;
  primaryType: RequestAllPrimaryType;
  reasonCode: RequestAllSkipReasonCode;
  reason: string;
}

export interface RequestAllPlan {
  albums: RequestAllPlanItem[];
  epsAndSingles: RequestAllPlanItem[];
  songs: RequestAllSong[];
  skipped: RequestAllSkip[];
  counts: {
    albums: number;
    epsAndSingles: number;
    songs: number;
    skipped: number;
    /**
     * Skipped because those songs come anyway (covered, duplicates, other
     * editions) or because the release is unofficial.
     */
    covered: number;
    unofficial: number;
    /** Of `songs`: bonus tracks of larger editions of albums you have. */
    bonusSongs: number;
  };
  /** True when singles were judged by title only (too many to inspect). */
  titleOnly: boolean;
}

const SKIP_REASONS: Record<RequestAllSkipReasonCode, string> = {
  owned: 'You already have it.',
  partial: 'You have part of it; its page offers the missing songs.',
  requested: 'Already requested.',
  blocklisted: 'Blocklisted.',
  sameAlbum: 'Same album, another edition.',
  covered: 'You will already have every song on it.',
  duplicate: 'Same songs as another release that will be requested.',
  unofficial: 'Promo or unofficial release.',
  newSongsOnly: 'Only its songs that are on no album will be requested.',
};

const COVERED_REASON_CODES = new Set<RequestAllSkipReasonCode>([
  'sameAlbum',
  'covered',
  'duplicate',
  'unofficial',
]);

// ---- song and title keys -----------------------------------------------------

// Parts of a title that make it a different recording, not another copy.
const VARIANT_WORDS =
  /\b(?:live|remix(?:es|ed)?|rmx|acoustic|demo|instrumental|unplugged|a\s?cappella|karaoke|reprise|dub|extended|club|alternate|alt\.?\s+take|rehearsal|session|mix)\b/i;
// "mix" words that only name the usual cut of the song.
const PLAIN_MIX = /\b(?:radio|single|album|original|stereo|mono)\s+mix\b/gi;

const titleSegments = (title: string): string[] => {
  const segments = [...title.matchAll(/[([]([^()[\]]*)[)\]]/g)].map(
    (match) => match[1]
  );
  const dash = title.match(/\s[-–—]\s(.+)$/);
  if (dash) segments.push(dash[1]);
  return segments;
};

/**
 * One key per recording: the title without catalog extras, plus whatever
 * makes it a live/remix/acoustic/demo/instrumental version.
 */
export const requestAllSongKey = (title: string | null | undefined): string => {
  const raw = (title ?? '').trim().replace(/(\w)in['’](?=\s|$)/gi, '$1ing');
  if (!raw) return '';
  const base = compactMusicSearchText(stripTrackTitleExtras(raw));
  if (!base) return '';
  const variants = titleSegments(raw)
    .map((segment) => segment.replace(PLAIN_MIX, ' '))
    .filter((segment) => VARIANT_WORDS.test(segment))
    .map((segment) => compactMusicSearchText(normalizeMusicSearchText(segment)))
    .filter(Boolean)
    .sort();
  return variants.length ? `${base}#${variants.join('+')}` : base;
};

const isVariantKey = (key: string) => key.includes('#');

/** Album editions: "Bad" and "Bad (Special Edition)" are the same album. */
export const requestAllAlbumKey = (title: string | null | undefined): string =>
  compactMusicSearchText(stripTrackTitleExtras((title ?? '').trim()));

/**
 * The album a subtitled edition belongs to: "Dangerous: Man in Black" and
 * "Thriller - 25th Anniversary" are editions of "Dangerous" and "Thriller".
 */
export const albumEditionBaseKey = (
  title: string | null | undefined
): string => {
  const match = (title ?? '').trim().match(/^(.+?)\s*(?::\s|\s[-–—]\s)/);
  return match ? requestAllAlbumKey(match[1]) : '';
};

// Words that name an edition rather than a different album.
const EDITION_MARKER =
  /\b(?:edition|deluxe|anniversary|expanded|remaster(?:ed)?|reissue)\b/i;
const EDITION_WORDS =
  /\b(?:special|limited|fan|alternate|real|deluxe|super|anniversary|expanded|collector'?s|legacy|remaster(?:ed)?|reissue|bonus|edition|version|minimax|the|\d+(?:st|nd|rd|th))\b/gi;

/**
 * The album an edition-worded title belongs to: "Bad Special Alternate
 * Edition" and "Dangerous The Real Special Edition" are editions of "Bad"
 * and "Dangerous".
 */
export const albumEditionStrippedKey = (
  title: string | null | undefined
): string => {
  const raw = (title ?? '').trim();
  if (!EDITION_MARKER.test(raw)) return '';
  return compactMusicSearchText(
    normalizeMusicSearchText(
      raw.replace(/[()[\]:\-–—]/g, ' ').replace(EDITION_WORDS, ' ')
    )
  );
};

/** Every key under which a title could be an edition of a studio album. */
const editionTargetKeys = (title: string): string[] =>
  [albumEditionBaseKey(title), albumEditionStrippedKey(title)].filter(Boolean);

// ---- unofficial releases ------------------------------------------------------

/**
 * Releases that are not a normal official release: promos, bootlegs and
 * platform exclusives. Title patterns are a fallback for when the catalog
 * gives no release status; keep the list conservative.
 */
export const UNOFFICIAL_RELEASE_TITLE_PATTERNS: readonly RegExp[] = [
  /\bpromo(?:tional)?\b.*\b(?:cd|single|sampler|ep|vinyl|disc)\b/i,
  /\bbootleg\b/i,
  /\bunofficial\b/i,
  /\bapple music (?:home )?sessions?\b/i,
  /\bspotify (?:singles?|sessions?)\b/i,
  /\bamazon (?:original|music) /i,
  /\bsampler\b/i,
  /\binterview (?:disc|cd)\b/i,
  /\bregrooved\b/i,
];

// "Moonwalker Soundtrack" with no Soundtrack type in the catalog: not the
// official soundtrack release (that one carries the type).
const UNTYPED_SOUNDTRACK_TITLE = /\bsoundtrack\b/i;

// MusicBrainz secondary types that never make a normal release.
const UNOFFICIAL_SECONDARY_TYPES = new Set(['mixtape/street', 'interview']);

export const isUnofficialReleaseGroup = (
  group: Pick<RequestAllReleaseGroup, 'title' | 'secondaryTypes'> & {
    releaseStatuses?: string[];
  }
): boolean => {
  const statuses = (group.releaseStatuses ?? []).map((status) =>
    status.toLowerCase()
  );
  if (statuses.length > 0 && !statuses.includes('official')) return true;
  if (
    (group.secondaryTypes ?? []).some((type) =>
      UNOFFICIAL_SECONDARY_TYPES.has(type.toLowerCase())
    )
  ) {
    return true;
  }
  if (
    UNTYPED_SOUNDTRACK_TITLE.test(group.title) &&
    !(group.secondaryTypes ?? []).some(
      (type) => type.toLowerCase() === 'soundtrack'
    )
  ) {
    return true;
  }
  return UNOFFICIAL_RELEASE_TITLE_PATTERNS.some((pattern) =>
    pattern.test(group.title)
  );
};

// ---- shared helpers ------------------------------------------------------------

const asPrimaryType = (value: string): RequestAllPrimaryType | undefined =>
  value === 'Album' || value === 'EP' || value === 'Single' ? value : undefined;

/**
 * A studio release: an album, EP or single with no secondary type, or a
 * single or EP whose only secondary type is Soundtrack and that is credited
 * to the artist (a song written for a film is still one of their songs).
 * Live, remix, compilation, DJ-mix, demo and the like are not.
 */
export const isStudioReleaseGroup = (
  group: Pick<
    RequestAllReleaseGroup,
    'primaryType' | 'secondaryTypes' | 'artistCreditIds'
  >,
  artistMbid?: string
): boolean => {
  const primaryType = asPrimaryType(group.primaryType);
  if (!primaryType) return false;
  const secondary = group.secondaryTypes ?? [];
  if (secondary.length === 0) return true;
  if (
    primaryType === 'Album' ||
    secondary.length !== 1 ||
    secondary[0].toLowerCase() !== 'soundtrack'
  ) {
    return false;
  }
  const credits = (group.artistCreditIds ?? []).map((id) => id.toLowerCase());
  return (
    !artistMbid ||
    credits.length === 0 ||
    credits.includes(artistMbid.toLowerCase())
  );
};

// Kinds of release that stay their own thing: shown, never folded into an album.
const DISTINCT_SECONDARY_TYPES = new Set(['live', 'remix', 'dj-mix', 'demo']);
const isDistinctRecording = (group: RequestAllReleaseGroup) =>
  (group.secondaryTypes ?? []).some((type) =>
    DISTINCT_SECONDARY_TYPES.has(type.toLowerCase())
  );

// Collections whose songs usually all come from the studio albums.
const COMPILATION_TITLE =
  /\b(?:greatest hits|best of|essential|collection|anthology|singles? pack|box ?set|number ones|video singles|ultimate|hits|edition)\b/i;
const isCompilationLike = (group: RequestAllReleaseGroup) =>
  !isDistinctRecording(group) &&
  ((group.secondaryTypes ?? []).some(
    (type) => type.toLowerCase() === 'compilation'
  ) ||
    COMPILATION_TITLE.test(group.title));

// Bonus-track versions that are not a new song.
const NOT_A_NEW_SONG =
  /\b(?:live|remix(?:es|ed)?|demo|instrumental|karaoke|commentary|voice memo|acoustic|a\s?cappella)\b/i;
// A bonus track that is not a song of its own: a medley or megamix, an edit
// or excerpt, a voice-over or studio session, a re-recording named for its
// year ("Beat It 2008").
const NOT_A_BONUS_SONG =
  /\b(?:medley|megamix|mash-?up|edit|excerpts?|voice[\s-]?over|session|interview|intro|outro)\b|\s(?:19|20)\d\d$/i;
const LATIN_LETTER = /[A-Za-z]/;
// "Ben + The Greatest Show On Earth + In Our Small Way": several songs in one
const isSongMedley = (title: string) => title.split(/\s\+\s|\s\/\s/).length > 1;

/** Earliest first; undated last; otherwise the catalog's own order. */
const byYear = <T extends { year: number | null }>(groups: T[]): T[] =>
  groups
    .map((group, index) => ({ group, index }))
    .sort(
      (a, b) =>
        (a.group.year ?? Number.MAX_SAFE_INTEGER) -
          (b.group.year ?? Number.MAX_SAFE_INTEGER) || a.index - b.index
    )
    .map(({ group }) => group);

const toTracks = (
  value: (RequestAllTrack | string)[] | null | undefined
): RequestAllTrack[] | null => {
  if (!value || value.length === 0) return null;
  const tracks = value
    .map((track) => (typeof track === 'string' ? { title: track } : track))
    .filter((track) => Boolean(track?.title));
  return tracks.length ? tracks : null;
};

const isProtected = (group: RequestAllReleaseGroup) =>
  Boolean(group.inLibrary || group.partial || group.requested);

// ---- the request-all plan ---------------------------------------------------

export interface BuildRequestAllPlanOptions {
  artistName: string;
  releaseGroups: RequestAllReleaseGroup[];
  /** Tracks of a release group; null when they cannot be loaded. */
  loadTracks: (mbid: string) => Promise<(RequestAllTrack | string)[] | null>;
  /** The library's owned-song index (ownedSongKey keys), when available. */
  ownedSongKeys?: ReadonlySet<string> | null;
  /** Songs this user already asked for (requestAllSongKey keys). */
  requestedSongKeys?: ReadonlySet<string> | null;
  /**
   * The requester may make song requests: a partly new single or EP then
   * becomes song requests for just its new songs.
   */
  canRequestSongs?: boolean;
  /** The artist, so soundtrack singles credited to someone else stay out. */
  artistMbid?: string;
  /**
   * Official editions of a release group (bonus tracks of larger editions of
   * albums you have become song requests). Null when unavailable.
   */
  loadEditions?: (mbid: string) => Promise<ReleaseGroupEdition[] | null>;
  maxBonusSongs?: number;
  maxInspected?: number;
  concurrency?: number;
}

export const REQUEST_ALL_MAX_BONUS_SONGS = 30;
const MAX_BONUS_ALBUMS = 20;

export const buildRequestAllPlan = async ({
  artistName,
  releaseGroups,
  loadTracks,
  ownedSongKeys,
  requestedSongKeys,
  canRequestSongs = false,
  artistMbid,
  loadEditions,
  maxBonusSongs = REQUEST_ALL_MAX_BONUS_SONGS,
  maxInspected = REQUEST_ALL_MAX_INSPECTED_RELEASE_GROUPS,
  concurrency = REQUEST_ALL_TRACKLIST_CONCURRENCY,
}: BuildRequestAllPlanOptions): Promise<RequestAllPlan> => {
  const skipped: RequestAllSkip[] = [];
  const skip = (
    group: RequestAllReleaseGroup,
    primaryType: RequestAllPrimaryType,
    reasonCode: RequestAllSkipReasonCode
  ) =>
    skipped.push({
      mbid: group.id,
      title: group.title,
      primaryType,
      reasonCode,
      reason: SKIP_REASONS[reasonCode],
    });
  const haveReason = (
    group: RequestAllReleaseGroup
  ): RequestAllSkipReasonCode | undefined =>
    group.inLibrary
      ? 'owned'
      : group.partial
        ? 'partial'
        : group.requested
          ? 'requested'
          : group.blocklisted
            ? 'blocklisted'
            : isUnofficialReleaseGroup(group)
              ? 'unofficial'
              : undefined;

  // Studio releases only (soundtrack singles of the artist included); live
  // albums and remixes stay out of Get all.
  const eligible = byYear(
    releaseGroups.filter((group) => isStudioReleaseGroup(group, artistMbid))
  );
  const albums = eligible.filter((group) => group.primaryType === 'Album');
  const smaller = eligible.filter((group) => group.primaryType !== 'Album');

  // 1. Albums: one edition per title. Owned, part-owned or requested editions
  // claim the title first; then the earliest missing edition.
  const claimedAlbumKeys = new Set<string>();
  const coveringAlbums: RequestAllReleaseGroup[] = [];
  const haveAlbums: RequestAllReleaseGroup[] = [];
  for (const group of albums) {
    const reason = haveReason(group);
    // an unofficial-looking edition of an album is decided below
    if (!reason || reason === 'unofficial') continue;
    skip(group, 'Album', reason);
    if (reason === 'owned' || reason === 'partial' || reason === 'requested') {
      haveAlbums.push(group);
    }
    if (reason !== 'blocklisted') {
      const key = requestAllAlbumKey(group.title);
      if (key) claimedAlbumKeys.add(key);
    }
    // owned and requested albums bring their songs; a part-owned one only
    // brings what the library has (the owned-song index knows those)
    if (reason === 'owned' || reason === 'requested') {
      coveringAlbums.push(group);
    }
  }
  const plannedAlbums: RequestAllReleaseGroup[] = [];
  for (const group of albums) {
    const reason = haveReason(group);
    if (reason && reason !== 'unofficial') continue;
    const key = requestAllAlbumKey(group.title);
    if (
      (key && claimedAlbumKeys.has(key)) ||
      editionTargetKeys(group.title).some((target) =>
        claimedAlbumKeys.has(target)
      )
    ) {
      skip(group, 'Album', 'sameAlbum');
      continue;
    }
    if (reason === 'unofficial') {
      skip(group, 'Album', 'unofficial');
      continue;
    }
    if (key) claimedAlbumKeys.add(key);
    plannedAlbums.push(group);
    coveringAlbums.push(group);
  }

  // 2. Singles and EPs not already had.
  const candidates: RequestAllReleaseGroup[] = [];
  for (const group of smaller) {
    const reason = haveReason(group);
    const primaryType = asPrimaryType(
      group.primaryType
    ) as RequestAllPrimaryType;
    if (reason) skip(group, primaryType, reason);
    else candidates.push(group);
  }

  const titleOnly = coveringAlbums.length + candidates.length > maxInspected;
  // part-owned albums too: their list is the edition a bonus track is not on
  const partialAlbums =
    canRequestSongs && loadEditions
      ? haveAlbums.filter((group) => !coveringAlbums.includes(group))
      : [];
  const toInspect = [
    ...coveringAlbums.slice(0, maxInspected),
    ...partialAlbums.slice(0, MAX_BONUS_ALBUMS),
    ...(titleOnly ? [] : candidates),
  ];
  const tracklists = new Map<string, RequestAllTrack[] | null>();
  await mapWithConcurrency(toInspect, concurrency, async (group) => {
    const tracks = await loadTracks(group.id).catch(() => null);
    tracklists.set(group.id, toTracks(tracks));
  });

  // Songs that come anyway: every track of a planned/owned/requested album,
  // plus the album titles themselves (a title track, when a list is missing).
  const albumSongs = new Set<string>();
  for (const group of coveringAlbums) {
    for (const track of tracklists.get(group.id) ?? []) {
      const key = requestAllSongKey(track.title);
      if (key) albumSongs.add(key);
    }
    const titleKey = requestAllSongKey(group.title);
    if (titleKey) albumSongs.add(titleKey);
  }
  const isOwnedSong = (title: string, key: string) =>
    Boolean(requestedSongKeys?.has(key)) ||
    (!isVariantKey(key) &&
      Boolean(ownedSongKeys?.has(ownedSongKey(artistName, title))));

  const singleSongs = new Set<string>();
  const plannedSmaller: RequestAllPlanItem[] = [];
  const songs: RequestAllSong[] = [];
  for (const group of candidates) {
    const primaryType = asPrimaryType(
      group.primaryType
    ) as RequestAllPrimaryType;
    // A tracklist that cannot be loaded falls back to the title: a single is
    // usually named after its song.
    const loaded = tracklists.get(group.id) ?? null;
    const releaseSongs = (loaded ?? [{ title: group.title }])
      .map((track) => ({ ...track, key: requestAllSongKey(track.title) }))
      .filter((song) => song.key);
    // another version of a song (remix, dub, instrumental, a cappella, live
    // take) is never a new song to get: remixes stay out of Get all
    const fresh = releaseSongs.filter(
      (song) =>
        !isVariantKey(song.key) &&
        !NOT_A_NEW_SONG.test(song.title) &&
        !NOT_A_BONUS_SONG.test(song.title) &&
        !isSongMedley(song.title) &&
        !albumSongs.has(song.key) &&
        !singleSongs.has(song.key) &&
        !isOwnedSong(song.title, song.key)
    );
    if (releaseSongs.length > 0 && fresh.length === 0) {
      const onlyBySingles = releaseSongs.some(
        (song) =>
          singleSongs.has(song.key) &&
          !albumSongs.has(song.key) &&
          !isOwnedSong(song.title, song.key)
      );
      skip(group, primaryType, onlyBySingles ? 'duplicate' : 'covered');
      continue;
    }
    for (const song of releaseSongs) singleSongs.add(song.key);
    // Partly new (a B-side next to an album song): just the new songs.
    if (canRequestSongs && loaded && fresh.length < releaseSongs.length) {
      skip(group, primaryType, 'newSongsOnly');
      const seen = new Set<string>();
      for (const song of fresh) {
        if (seen.has(song.key)) continue;
        seen.add(song.key);
        songs.push({
          title: song.title,
          artistName,
          fromReleaseMbid: group.id,
          fromReleaseTitle: group.title,
          ...(song.durationMs ? { durationMs: song.durationMs } : {}),
        });
      }
      continue;
    }
    plannedSmaller.push({
      mbid: group.id,
      title: group.title,
      primaryType,
      year: group.year,
      newSongs: fresh.length || undefined,
    });
  }

  // 3. Bonus tracks: songs only on a larger official edition of an album you
  // have (or asked for), as song requests like the B-sides.
  let bonusSongs = 0;
  if (canRequestSongs && loadEditions && maxBonusSongs > 0) {
    const albumsWith = new Map<string, Set<string>>();
    for (const group of coveringAlbums) {
      for (const track of tracklists.get(group.id) ?? []) {
        const key = requestAllSongKey(track.title);
        if (!key) continue;
        const set = albumsWith.get(key) ?? new Set<string>();
        set.add(group.id);
        albumsWith.set(key, set);
      }
    }
    const listed = new Set(songs.map((song) => requestAllSongKey(song.title)));
    const seenTitles = new Set<string>();
    const bonusAlbums = haveAlbums
      .filter((group) => {
        const key = requestAllAlbumKey(group.title);
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      })
      .slice(0, MAX_BONUS_ALBUMS);
    const editionsByAlbum = new Map<string, ReleaseGroupEdition[] | null>();
    await mapWithConcurrency(bonusAlbums, 2, async (group) => {
      editionsByAlbum.set(
        group.id,
        await loadEditions(group.id).catch(() => null)
      );
    });
    for (const group of bonusAlbums) {
      if (bonusSongs >= maxBonusSongs) break;
      const own = tracklists.get(group.id) ?? null;
      const owned = group.inLibrary && Boolean(ownedSongKeys);
      // not on the edition the library has (its own songs) or will get (the
      // catalog's list, which is what a request downloads); with neither
      // known the album is skipped rather than guessed
      if (!owned && !own) continue;
      const ownKeys = new Set(
        (own ?? []).map((track) => requestAllSongKey(track.title))
      );
      // an edition printed in another script (a Japanese pressing) lists the
      // same songs under translated titles
      const latinAlbum = (own ?? []).some((track) =>
        LATIN_LETTER.test(track.title)
      );
      for (const edition of editionsByAlbum.get(group.id) ?? []) {
        for (const track of edition.tracks) {
          if (bonusSongs >= maxBonusSongs) break;
          const key = requestAllSongKey(track.title);
          if (
            !key ||
            isVariantKey(key) ||
            NOT_A_NEW_SONG.test(track.title) ||
            NOT_A_BONUS_SONG.test(track.title) ||
            isSongMedley(track.title) ||
            (latinAlbum && !LATIN_LETTER.test(track.title)) ||
            listed.has(key) ||
            singleSongs.has(key) ||
            Boolean(requestedSongKeys?.has(key)) ||
            isOwnedSong(track.title, key) ||
            ownKeys.has(key) ||
            [...(albumsWith.get(key) ?? [])].some((id) => id !== group.id)
          ) {
            continue;
          }
          listed.add(key);
          bonusSongs += 1;
          songs.push({
            title: track.title,
            artistName,
            fromReleaseMbid: group.id,
            fromReleaseTitle: edition.releaseTitle,
            releaseMbid: edition.releaseMbid,
            ...(track.durationMs ? { durationMs: track.durationMs } : {}),
            reason: `bonus track on ${edition.releaseTitle}`,
          });
        }
      }
    }
  }

  const albumItems: RequestAllPlanItem[] = plannedAlbums.map((group) => ({
    mbid: group.id,
    title: group.title,
    primaryType: 'Album',
    year: group.year,
  }));
  // EPs before singles, each earliest first (the order Aurral gets them)
  const epsAndSingles = [
    ...plannedSmaller.filter((item) => item.primaryType === 'EP'),
    ...plannedSmaller.filter((item) => item.primaryType === 'Single'),
  ];

  return {
    albums: albumItems,
    epsAndSingles,
    songs,
    skipped,
    counts: {
      albums: albumItems.length,
      epsAndSingles: epsAndSingles.length,
      songs: songs.length,
      skipped: skipped.length,
      covered: skipped.filter((item) =>
        COVERED_REASON_CODES.has(item.reasonCode)
      ).length,
      unofficial: skipped.filter((item) => item.reasonCode === 'unofficial')
        .length,
      bonusSongs,
    },
    titleOnly,
  };
};

// ---- display classification ---------------------------------------------------

export type ReleaseRedundancyCode = 'sameAlbum' | 'covered' | 'unofficial';

export interface ReleaseRedundancy {
  code: ReleaseRedundancyCode;
  reason: string;
  coveredBy?: { mbid: string; title: string };
  /** A compilation: how many more albums besides `coveredBy` have its songs. */
  alsoOn?: number;
  /**
   * The covering release is owned or requested: the user will have these
   * songs anyway (a request for this one would be redundant).
   */
  coveredByHave?: boolean;
}

/**
 * Which of an artist's release groups the artist page hides by default, and
 * why. Unlike the request plan, a single is covered when its songs are on any
 * of the artist's studio albums, owned or not: the album is the thing to get.
 * Owned, part-owned and requested releases are never hidden.
 *
 * `tracksOf` answers from what is already known (cached track lists); a
 * release without one is judged by its title.
 */
export const classifyArtistReleaseGroups = ({
  releaseGroups,
  tracksOf,
  artistMbid,
}: {
  releaseGroups: RequestAllReleaseGroup[];
  tracksOf: (mbid: string) => RequestAllTrack[] | null | undefined;
  artistMbid?: string;
}): Map<string, ReleaseRedundancy> => {
  const result = new Map<string, ReleaseRedundancy>();
  const ordered = byYear(releaseGroups);
  const have = (group: RequestAllReleaseGroup) =>
    Boolean(group.inLibrary || group.requested);

  for (const group of ordered) {
    if (!isProtected(group) && isUnofficialReleaseGroup(group)) {
      result.set(group.id, {
        code: 'unofficial',
        reason: SKIP_REASONS.unofficial,
      });
    }
  }

  // Studio albums, one per title: owned > part-owned > requested > earliest.
  const studio = ordered.filter(
    (group) =>
      group.primaryType === 'Album' &&
      !group.secondaryTypes?.length &&
      !result.has(group.id)
  );
  const rank = (group: RequestAllReleaseGroup) =>
    group.inLibrary ? 0 : group.partial ? 1 : group.requested ? 2 : 3;
  const canonicalByKey = new Map<string, RequestAllReleaseGroup>();
  for (const group of [...studio].sort((a, b) => rank(a) - rank(b))) {
    const key = requestAllAlbumKey(group.title);
    if (key && !canonicalByKey.has(key)) canonicalByKey.set(key, group);
  }
  const canonical = new Set<RequestAllReleaseGroup>();
  // the studio album a title is an edition of ("Bad (Special Edition)",
  // "Dangerous: Man in Black", "Bad Special Alternate Edition"), if any
  const editionOfAlbum = (group: RequestAllReleaseGroup) => {
    const key = requestAllAlbumKey(group.title);
    const winner = key ? canonicalByKey.get(key) : undefined;
    if (winner && winner !== group) return winner;
    for (const target of editionTargetKeys(group.title)) {
      const album = canonicalByKey.get(target);
      if (
        album &&
        album !== group &&
        (album.year ?? 0) <= (group.year ?? Number.MAX_SAFE_INTEGER)
      ) {
        return album;
      }
    }
    return undefined;
  };
  for (const group of studio) {
    const coverer = editionOfAlbum(group);
    if (coverer && !isProtected(group)) {
      result.set(group.id, {
        code: 'sameAlbum',
        reason: `Another edition of ${coverer.title}`,
        coveredBy: { mbid: coverer.id, title: coverer.title },
        coveredByHave: have(coverer),
      });
      continue;
    }
    canonical.add(group);
  }
  // An edition of a studio album is that, even when its title also looks like
  // a promo ("Thriller - Deluxe Anniversary Edition"); compilations and
  // soundtracks named as an edition of an album too. Live and remix releases
  // are their own thing.
  for (const group of ordered) {
    if (
      isProtected(group) ||
      canonical.has(group) ||
      (result.has(group.id) && result.get(group.id)?.code !== 'unofficial') ||
      isDistinctRecording(group) ||
      (group.primaryType !== 'Album' && isStudioReleaseGroup(group, artistMbid))
    ) {
      continue;
    }
    const coverer = editionOfAlbum(group);
    if (!coverer) continue;
    result.set(group.id, {
      code: 'sameAlbum',
      reason: `Another edition of ${coverer.title}`,
      coveredBy: { mbid: coverer.id, title: coverer.title },
      coveredByHave: have(coverer),
    });
  }

  // Songs the studio albums (and any owned or requested album) bring.
  const coverers = new Map<
    string,
    { group: RequestAllReleaseGroup; have: boolean }[]
  >();
  const addCover = (key: string, group: RequestAllReleaseGroup) => {
    if (!key) return;
    const list = coverers.get(key) ?? [];
    if (!list.some((entry) => entry.group === group)) {
      list.push({ group, have: have(group) });
      coverers.set(key, list);
    }
  };
  const coveringAlbums = [
    ...canonical,
    ...ordered.filter(
      (group) =>
        group.primaryType === 'Album' &&
        have(group) &&
        !canonical.has(group) &&
        !result.has(group.id)
    ),
  ];
  for (const group of coveringAlbums) {
    for (const track of tracksOf(group.id) ?? []) {
      addCover(requestAllSongKey(track.title), group);
    }
    addCover(requestAllSongKey(group.title), group);
  }
  // Singles and EPs the library has or has asked for bring their songs too:
  // a single whose songs are all on an EP you own is not something to get.
  for (const group of ordered) {
    if (
      (group.primaryType !== 'Single' && group.primaryType !== 'EP') ||
      !have(group) ||
      isDistinctRecording(group) ||
      result.has(group.id)
    ) {
      continue;
    }
    for (const track of toTracks(tracksOf(group.id)) ?? [
      { title: group.title },
    ]) {
      addCover(requestAllSongKey(track.title), group);
    }
  }

  // the album that brings most of these songs, owned first
  const bestCoverer = (keys: string[]) => {
    const tally = new Map<
      RequestAllReleaseGroup,
      { count: number; have: boolean }
    >();
    for (const key of keys) {
      for (const entry of coverers.get(key) ?? []) {
        const current = tally.get(entry.group) ?? {
          count: 0,
          have: entry.have,
        };
        current.count += 1;
        tally.set(entry.group, current);
      }
    }
    const ranked = [...tally.entries()].sort(
      (a, b) => Number(b[1].have) - Number(a[1].have) || b[1].count - a[1].count
    );
    // every other album needed besides the best one
    const rest = new Set<RequestAllReleaseGroup>();
    for (const key of keys) {
      const entries = coverers.get(key) ?? [];
      if (!entries.some((entry) => entry.group === ranked[0][0])) {
        rest.add(entries[0].group);
      }
    }
    return { best: ranked[0][0], alsoOn: rest.size };
  };

  // Compilations, box sets and singles packs whose songs (when their list is
  // known) are all on the studio albums.
  for (const group of ordered) {
    if (
      result.has(group.id) ||
      isProtected(group) ||
      canonical.has(group) ||
      isStudioReleaseGroup(group, artistMbid) ||
      !isCompilationLike(group)
    ) {
      continue;
    }
    const keys = (toTracks(tracksOf(group.id)) ?? [])
      .map((track) => requestAllSongKey(track.title))
      .filter(Boolean);
    if (keys.length === 0 || !keys.every((key) => coverers.has(key))) continue;
    const { best, alsoOn } = bestCoverer(keys);
    result.set(group.id, {
      code: 'covered',
      reason: alsoOn
        ? `Its songs are on ${best.title} and ${alsoOn} more`
        : `On ${best.title}`,
      coveredBy: { mbid: best.id, title: best.title },
      ...(alsoOn ? { alsoOn } : {}),
      coveredByHave: keys.every((key) =>
        (coverers.get(key) ?? []).some((entry) => entry.have)
      ),
    });
  }

  const singleSongs = new Map<string, RequestAllReleaseGroup>();
  for (const group of ordered) {
    if (
      (group.primaryType !== 'Single' && group.primaryType !== 'EP') ||
      !isStudioReleaseGroup(group, artistMbid) ||
      result.has(group.id)
    ) {
      continue;
    }
    const keys = (toTracks(tracksOf(group.id)) ?? [{ title: group.title }])
      .map((track) => requestAllSongKey(track.title))
      .filter(Boolean);
    if (keys.length === 0) continue;
    // its songs, not its remixes and instrumentals, decide
    const songKeys = keys.filter((key) => !isVariantKey(key));
    if (
      !isProtected(group) &&
      songKeys.length > 0 &&
      songKeys.every((key) => coverers.has(key))
    ) {
      const { best } = bestCoverer(songKeys);
      result.set(group.id, {
        code: 'covered',
        reason: `On ${best.title}`,
        coveredBy: { mbid: best.id, title: best.title },
        coveredByHave: songKeys.every((key) =>
          (coverers.get(key) ?? []).some((entry) => entry.have)
        ),
      });
      continue;
    }
    const earlier = keys.every((key) => singleSongs.has(key))
      ? singleSongs.get(keys[0])
      : undefined;
    if (earlier && !isProtected(group)) {
      result.set(group.id, {
        code: 'sameAlbum',
        reason: `Another edition of ${earlier.title}`,
        coveredBy: { mbid: earlier.id, title: earlier.title },
        coveredByHave: have(earlier),
      });
      continue;
    }
    for (const key of keys) {
      if (!singleSongs.has(key)) singleSongs.set(key, group);
    }
  }
  return result;
};

const MAX_INSPECTED_COMPILATIONS = 60;

/**
 * The release groups whose track lists make the classification exact: studio
 * albums first, then singles, then compilations (warmed in the background).
 */
export const releaseGroupsToInspect = (
  releaseGroups: RequestAllReleaseGroup[],
  max = REQUEST_ALL_MAX_INSPECTED_RELEASE_GROUPS,
  artistMbid?: string
): { albums: string[]; singles: string[]; extras: string[] } => {
  const all = byYear(releaseGroups).filter(
    (group) => !isUnofficialReleaseGroup(group)
  );
  const ordered = all.filter((group) =>
    isStudioReleaseGroup(group, artistMbid)
  );
  const extras = all
    .filter(
      (group) =>
        !isStudioReleaseGroup(group, artistMbid) && isCompilationLike(group)
    )
    .map((group) => group.id)
    .slice(0, MAX_INSPECTED_COMPILATIONS);
  const albums = ordered
    .filter((group) => group.primaryType === 'Album')
    .map((group) => group.id)
    .slice(0, max);
  const singles = ordered
    .filter(
      (group) => group.primaryType === 'Single' || group.primaryType === 'EP'
    )
    .map((group) => group.id);
  return {
    albums,
    // too many to inspect: albums only, singles by title
    singles: albums.length + singles.length > max ? [] : singles,
    extras,
  };
};

// ---- track lists (ListenBrainz, cached) ---------------------------------------

const TRACKLIST_TIMEOUT_MS = 8_000;
const TRACKLIST_TTL_MS = 12 * 60 * 60 * 1_000;
const TRACKLIST_MISS_TTL_MS = 60 * 60 * 1_000;
const MAX_CACHED_TRACKLISTS = 4_000;
const tracklistCache = new Map<
  string,
  { tracks: RequestAllTrack[] | null; at: number }
>();
const tracklistLoads = new Map<string, Promise<RequestAllTrack[] | null>>();

export const clearRequestAllTracklistCache = (): void => {
  tracklistCache.clear();
  tracklistLoads.clear();
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), ms);
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

const remember = (mbid: string, tracks: RequestAllTrack[] | null) => {
  tracklistCache.delete(mbid);
  tracklistCache.set(mbid, { tracks, at: Date.now() });
  while (tracklistCache.size > MAX_CACHED_TRACKLISTS) {
    const oldest = tracklistCache.keys().next().value;
    if (oldest === undefined) break;
    tracklistCache.delete(oldest);
  }
};

/**
 * What is already known about a release group's tracks: the list, null when
 * it could not be loaded recently, undefined when it was never asked for.
 */
export const peekReleaseGroupTracks = (
  mbid: string
): RequestAllTrack[] | null | undefined => {
  const cached = tracklistCache.get(mbid);
  if (!cached) return undefined;
  const ttl = cached.tracks ? TRACKLIST_TTL_MS : TRACKLIST_MISS_TTL_MS;
  return Date.now() - cached.at < ttl ? cached.tracks : undefined;
};

/**
 * Tracks of one release group (ListenBrainz, cached). Null when they cannot
 * be loaded; callers then judge the release by its title.
 */
export const loadReleaseGroupTracks = async (
  mbid: string
): Promise<RequestAllTrack[] | null> => {
  const known = peekReleaseGroupTracks(mbid);
  if (known !== undefined) return known;
  const running = tracklistLoads.get(mbid);
  if (running) return running;
  const load = withTimeout(
    new ListenBrainzAPI().getAlbum(mbid),
    TRACKLIST_TIMEOUT_MS
  )
    .then((details) => {
      const tracks = (Array.isArray(details?.mediums) ? details.mediums : [])
        .flatMap((medium) =>
          Array.isArray(medium?.tracks) ? medium.tracks : []
        )
        .flatMap((track) =>
          typeof track?.name === 'string' && track.name
            ? [
                {
                  title: track.name,
                  ...(typeof track.length === 'number' && track.length > 0
                    ? { durationMs: track.length }
                    : {}),
                },
              ]
            : []
        );
      const value = tracks.length ? tracks : null;
      remember(mbid, value);
      return value;
    })
    .catch(() => {
      remember(mbid, null);
      return null;
    })
    .finally(() => tracklistLoads.delete(mbid));
  tracklistLoads.set(mbid, load);
  return load;
};

/** Loads several track lists, a few at a time; never throws. */
export const warmReleaseGroupTracks = async (
  mbids: string[],
  concurrency = REQUEST_ALL_TRACKLIST_CONCURRENCY
): Promise<void> => {
  const todo = mbids.filter(
    (mbid) => peekReleaseGroupTracks(mbid) === undefined
  );
  if (todo.length === 0) return;
  await mapWithConcurrency(todo, concurrency, (mbid) =>
    loadReleaseGroupTracks(mbid)
  );
};

// ---- search and Discover results ------------------------------------------------

const artistResultKey = (name: string | null | undefined) =>
  compactMusicSearchText(normalizeMusicSearchText((name ?? '').trim()));

/**
 * Search and Discover show each album once: same-title editions by the same
 * artist collapse into one card (the owned one, else the first, which the
 * ranking put there), and a single whose song is on an album of the same
 * artist in the results (or in the library) is left out. A release that is
 * the top result, or whose title is exactly what was searched, always stays.
 */
export const collapseRedundantAlbumResults = <
  T extends {
    mbid: string | null;
    title: string;
    artistName: string;
    primaryType: string;
    inLibrary?: boolean;
    partial?: boolean;
  },
>(
  albums: T[],
  options: {
    query?: string;
    keepMbids?: (string | null | undefined)[];
    /** Albums the library has (search's "In your library" albums). */
    ownedAlbums?: { title: string; artistName: string }[];
    /** Songs in the same results, with the album each is on. */
    tracks?: {
      title: string;
      artistName: string;
      albumMbid: string | null;
    }[];
  } = {}
): T[] => {
  const keep = new Set(
    (options.keepMbids ?? [])
      .filter((id): id is string => Boolean(id))
      .map((id) => id.toLowerCase())
  );
  const queryKey = options.query ? requestAllAlbumKey(options.query) : '';
  const mustKeep = (album: T) =>
    Boolean(
      (album.mbid && keep.has(album.mbid.toLowerCase())) ||
      (queryKey && requestAllAlbumKey(album.title) === queryKey)
    );
  const isAlbum = (album: T) => album.primaryType === 'Album';
  const editionKey = (album: T) =>
    `${isAlbum(album) ? 'album' : 'single'}|${artistResultKey(
      album.artistName
    )}|${requestAllAlbumKey(album.title)}`;

  // one card per edition key: owned, then part-owned, then the first
  const winners = new Map<string, T>();
  const rank = (album: T) => (album.inLibrary ? 0 : album.partial ? 1 : 2);
  for (const album of albums) {
    const key = editionKey(album);
    const current = winners.get(key);
    if (!current || rank(album) < rank(current)) winners.set(key, album);
  }

  const albumTitles = new Set<string>();
  const albumIds = new Set<string>();
  for (const album of albums) {
    if (!isAlbum(album)) continue;
    albumTitles.add(
      `${artistResultKey(album.artistName)}|${requestAllSongKey(album.title)}`
    );
    if (album.mbid) albumIds.add(album.mbid.toLowerCase());
  }
  for (const owned of options.ownedAlbums ?? []) {
    albumTitles.add(
      `${artistResultKey(owned.artistName)}|${requestAllSongKey(owned.title)}`
    );
  }
  const albumSongs = new Set(
    (options.tracks ?? [])
      .filter(
        (track) =>
          track.albumMbid && albumIds.has(track.albumMbid.toLowerCase())
      )
      .map(
        (track) =>
          `${artistResultKey(track.artistName)}|${requestAllSongKey(track.title)}`
      )
  );

  return albums.filter((album) => {
    if (album.mbid && keep.has(album.mbid.toLowerCase())) return true;
    if (winners.get(editionKey(album)) !== album) return false;
    if (isAlbum(album) || album.inLibrary || album.partial) return true;
    if (mustKeep(album)) return true;
    const songKey = `${artistResultKey(album.artistName)}|${requestAllSongKey(
      album.title
    )}`;
    return !albumTitles.has(songKey) && !albumSongs.has(songKey);
  });
};

// ---- official editions of a release group (MusicBrainz, cached) ----------------

interface EditionSource {
  getReleaseGroupReleases(options: { releaseGroupId: string }): Promise<
    {
      id: string;
      title: string;
      disambiguation?: string | null;
      trackCount: number;
    }[]
  >;
  getReleaseTracks(options: {
    releaseId: string;
  }): Promise<{ title: string; lengthMs?: number }[]>;
}

const EDITION_TTL_MS = 24 * 60 * 60 * 1_000;
const EDITION_MISS_TTL_MS = 60 * 60 * 1_000;
const EDITION_TIMEOUT_MS = 10_000;
const MAX_EDITIONS_PER_GROUP = 4;
const MAX_CACHED_EDITIONS = 1_000;
const editionCache = new Map<
  string,
  { editions: ReleaseGroupEdition[] | null; at: number }
>();

export const clearReleaseGroupEditionCache = (): void => {
  editionCache.clear();
};

/**
 * The largest official releases (editions) of a release group with their
 * tracks, so a bonus track on a deluxe edition can be found. Cached for a
 * day; null when MusicBrainz cannot answer (then nothing is added).
 */
export const loadReleaseGroupEditions = async (
  source: EditionSource,
  releaseGroupId: string
): Promise<ReleaseGroupEdition[] | null> => {
  const cached = editionCache.get(releaseGroupId);
  if (
    cached &&
    Date.now() - cached.at <
      (cached.editions ? EDITION_TTL_MS : EDITION_MISS_TTL_MS)
  ) {
    return cached.editions;
  }
  let editions: ReleaseGroupEdition[] | null;
  try {
    const releases = await withTimeout(
      source.getReleaseGroupReleases({ releaseGroupId }),
      EDITION_TIMEOUT_MS
    );
    // the biggest editions carry the bonus tracks; one per track count
    const seenCounts = new Set<number>();
    const picked = [...releases]
      .filter((release) => release.trackCount > 0)
      .sort((a, b) => b.trackCount - a.trackCount)
      .filter((release) => {
        if (seenCounts.has(release.trackCount)) return false;
        seenCounts.add(release.trackCount);
        return true;
      })
      .slice(0, MAX_EDITIONS_PER_GROUP);
    editions = [];
    for (const release of picked) {
      const tracks = await withTimeout(
        source.getReleaseTracks({ releaseId: release.id }),
        EDITION_TIMEOUT_MS
      ).catch(() => null);
      if (!tracks?.length) continue;
      editions.push({
        releaseMbid: release.id,
        releaseTitle:
          release.disambiguation &&
          !release.title
            .toLowerCase()
            .includes(release.disambiguation.toLowerCase())
            ? `${release.title} (${release.disambiguation})`
            : release.title,
        tracks: tracks
          .filter((track) => track.title)
          .map((track) => ({
            title: track.title,
            ...(track.lengthMs ? { durationMs: track.lengthMs } : {}),
          })),
      });
    }
  } catch {
    editions = null;
  }
  editionCache.delete(releaseGroupId);
  editionCache.set(releaseGroupId, { editions, at: Date.now() });
  while (editionCache.size > MAX_CACHED_EDITIONS) {
    const oldest = editionCache.keys().next().value;
    if (oldest === undefined) break;
    editionCache.delete(oldest);
  }
  return editions;
};
