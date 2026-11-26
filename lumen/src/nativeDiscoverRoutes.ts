const isId = (value: string) =>
  /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 1_000_000_000;
const LANGUAGE = /^[a-z]{2}$/i;

/** Map native SeerrNG Discover bookmarks into the equivalent Lumen catalog view. */
export function nativeDiscoverDestination(
  pathname: string,
  search: string,
  hash = ''
): string {
  const path = pathname.replace(/\/$/, '') || '/';
  const params = new URLSearchParams(search);
  let destination: string | undefined;
  const setFilter = (target: string, key: string, value: string) => {
    params.set(key, value);
    destination = target;
  };

  if (path === '/discover/movies') destination = '/movies';
  else if (path === '/discover/tv') destination = '/series';
  else if (path === '/discover/movies/genres') destination = '/movies/genres';
  else if (path === '/discover/tv/genres') destination = '/series/genres';
  else if (path === '/discover/trending') destination = '/trending';
  else if (path === '/discover/watchlist') destination = '/watchlist/discover';
  else if (path === '/discover/providers') destination = '/providers';
  else if (path === '/discover/book-recommendations')
    destination = '/books/recommendations';
  else if (path === '/discover/collectors') destination = '/music/collectors';
  else if (path === '/discover/music') destination = '/music';
  else if (path === '/discover/comics') destination = '/comics';
  else if (path === '/discover/magazines') destination = '/magazines';
  else if (path === '/discover/sports') destination = '/sports';
  else if (path === '/discover/adult') destination = '/adult';
  else if (path === '/discover/games') destination = '/games/discovery';
  else if (path === '/discover/patches') destination = '/patches';
  else if (path === '/discover/audiobooks') destination = '/audiobooks';
  else if (path === '/discover/books') {
    destination =
      params.get('format') === 'audiobook' ? '/audiobooks' : '/books';
    params.delete('format');
  } else if (path.startsWith('/discover/list/')) {
    const id = path.slice('/discover/list/'.length);
    if (isId(id)) destination = `/list/${id}`;
  } else if (path === '/discover/movies/upcoming') {
    params.set('media', 'movie');
    destination = '/soon';
  } else if (path === '/discover/tv/upcoming') {
    params.set('media', 'tv');
    destination = '/soon';
  } else {
    const match = path.match(
      /^\/discover\/(movies|tv)\/(genre|studio|network|language)$/
    );
    if (
      match &&
      (match[2] === 'genre' || match[2] === 'studio' || match[2] === 'network')
    ) {
      const key = match[2] === 'genre' ? 'genre' : match[2];
      const id = params.get(key) ?? '';
      if (isId(id))
        setFilter(match[1] === 'movies' ? '/movies' : '/series', key, id);
    } else {
      const detail = path.match(
        /^\/discover\/(movies|tv)\/(genre|studio|network|language)\/([^/]+)$/
      );
      if (detail) {
        const [, media, kind, rawValue] = detail;
        let value: string;
        try {
          value = decodeURIComponent(rawValue);
        } catch {
          value = '';
        }
        if (kind === 'language' && LANGUAGE.test(value))
          setFilter(
            media === 'movies' ? '/movies' : '/series',
            'language',
            value.toLowerCase()
          );
        else if (
          (kind === 'genre' || kind === 'studio' || kind === 'network') &&
          isId(value)
        )
          setFilter(
            media === 'movies' ? '/movies' : '/series',
            kind === 'genre' ? 'genre' : kind,
            value
          );
      } else if (
        path === '/discover/movies/keyword' ||
        path === '/discover/tv/keyword'
      ) {
        const ids = params.get('keywords') ?? '';
        if (
          /^\d{1,10}(?:[,|]\d{1,10}){0,49}$/.test(ids) &&
          ids.split(/[,|]/).every((id) => Number(id) <= 1_000_000_000)
        )
          destination = path.includes('/movies/') ? '/movies' : '/series';
      }
    }
  }

  if (!destination) destination = '/';
  if (
    (destination === '/movies' || destination === '/series') &&
    params.get('show') === 'plex'
  )
    params.set('show', 'have');
  const query = params.toString();
  return `${destination}${query ? `?${query}` : ''}${hash}`;
}
