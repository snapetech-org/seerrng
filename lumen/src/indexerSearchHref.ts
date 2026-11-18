export const getIndexerSearchHref = (
  category: string,
  title: string
): string | undefined => {
  const sanitizedTitle = Array.from(title, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
      ? ' '
      : character;
  }).join('');
  const query = sanitizedTitle.replace(/\s+/g, ' ').trim().slice(0, 256).trim();
  if (query.length < 2) return undefined;

  const params = new URLSearchParams({ category, query });
  return `/indexer-search?${params.toString()}`;
};
