export type ManagedMediaType =
  'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';

export function canonicalMediaId(
  mediaType: ManagedMediaType,
  input: string | number
) {
  const value = String(input).trim();
  switch (mediaType) {
    case 'movie':
    case 'tv': {
      const id = Number(value);
      return /^[1-9]\d*$/.test(value) &&
        Number.isSafeInteger(id) &&
        id <= 1_000_000_000
        ? String(id)
        : undefined;
    }
    case 'music':
      return /^[A-Za-z0-9_-]{1,128}$/.test(value)
        ? value.toLowerCase()
        : undefined;
    case 'book': {
      const workId = value.replace(/^\/?works\//i, '').toUpperCase();
      return /^OL\d{1,124}W$/.test(workId) ? workId : undefined;
    }
    case 'comic':
      return /^\d{1,18}$/.test(value) ? value : undefined;
    case 'magazine': {
      const title = value
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      return title.length > 0 &&
        title.length <= 256 &&
        title !== '.' &&
        title !== '..'
        ? title
        : undefined;
    }
  }
}
