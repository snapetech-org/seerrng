type Translate = (
  id: string,
  fallback?: string,
  values?: Record<string, string | number>
) => string;

export const seasonList = (n: number[], t?: Translate) => {
  const a = [...n].sort((x, y) => x - y);
  const runs: string[] = [];
  for (let i = 0; i < a.length;) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    runs.push(j > i ? `${a[i]}–${a[j]}` : `${a[i]}`);
    i = j + 1;
  }
  const numbers = runs.join(', ');
  if (!t) return (a.length === 1 ? 'Season ' : 'Seasons ') + numbers;
  return a.length === 1
    ? t('lumen.requestSummary.season', 'Season {numbers}', { numbers })
    : t('lumen.requestSummary.seasons', 'Seasons {numbers}', { numbers });
};

export function seriesRequestSummary(
  title: string,
  result: { seasons?: { seasonNumber: number }[] } | undefined,
  is4k = false,
  t?: Translate
) {
  const accepted = [
    ...new Set(
      result?.seasons
        ?.map(({ seasonNumber }) => seasonNumber)
        .filter((number) => Number.isSafeInteger(number) && number >= 0)
    ),
  ];
  const name = is4k
    ? t
      ? t('lumen.requestSummary.title4k', '{title} in 4K', { title })
      : `${title} in 4K`
    : title;
  if (!t)
    return accepted.length
      ? `Requested ${name} · ${seasonList(accepted)}`
      : `Request submitted for ${name}`;
  return accepted.length
    ? t(
        'lumen.requestSummary.requestedSeasons',
        'Requested {title} · {seasons}',
        {
          title: name,
          seasons: seasonList(accepted, t),
        }
      )
    : t('lumen.requestSummary.submitted', 'Request submitted for {title}', {
        title: name,
      });
}
