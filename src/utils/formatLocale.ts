const regionSubtag = /^[A-Z]{2}$|^\d{3}$/;
const scriptSubtag = /^[A-Z][a-z]{3}$/;

export const getFormatRegionFromLocale = (locale: string): string | null => {
  const region = locale.split('-').find((part) => regionSubtag.test(part));
  return region?.toUpperCase() ?? null;
};

export const getRegionalFormatLocale = (
  displayLocale: string,
  region?: string | null
): string => {
  if (!region || !regionSubtag.test(region)) return displayLocale;

  const [language, ...subtags] = displayLocale.split('-');
  const script = subtags.find((part) => scriptSubtag.test(part));
  const sourceRegion = getFormatRegionFromLocale(displayLocale);
  const preservedScript =
    script ??
    (language.toLowerCase() === 'zh'
      ? sourceRegion === 'TW' || sourceRegion === 'HK'
        ? 'Hant'
        : 'Hans'
      : undefined);

  return [language, preservedScript, region.toUpperCase()]
    .filter(Boolean)
    .join('-');
};
