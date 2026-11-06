/** A request may opt into future seasons, but cannot bypass an enrollment policy. */
export const validateFutureSeasonPreference = (
  value: unknown,
  mediaType: unknown
): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean')
    return 'monitorFutureSeasons must be a boolean.';
  if (mediaType !== 'tv')
    return 'Future-season monitoring is only valid for TV requests.';
  return undefined;
};

export const resolveFutureSeasonMonitoring = (
  preference: boolean | null | undefined,
  restricted: boolean,
  inherited: 'all' | 'none'
): { monitorNewItems: 'all' | 'none'; enableFutureSeasons: boolean } => ({
  monitorNewItems: restricted
    ? 'none'
    : preference == null
      ? inherited
      : preference
        ? 'all'
        : 'none',
  // An opt-out never disables monitoring established by another requester or Sonarr.
  enableFutureSeasons: !restricted && preference === true,
});
