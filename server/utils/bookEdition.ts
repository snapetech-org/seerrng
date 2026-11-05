/**
 * Open Library edition IDs describe ISBN metadata, not a provider's recording.
 * Older clients persist these with preferredIsbn13; keep their request semantics.
 */
export const isProviderBookEdition = (id?: string | null): boolean =>
  !!id?.trim() && !/^(?:\/?books\/)?OL\d+M$/i.test(id.trim());
