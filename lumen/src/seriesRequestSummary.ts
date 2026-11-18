export const seasonList = (n: number[]) => {
  const a = [...n].sort((x, y) => x - y);
  const runs: string[] = [];
  for (let i = 0; i < a.length;) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    runs.push(j > i ? `${a[i]}–${a[j]}` : `${a[i]}`);
    i = j + 1;
  }
  return (a.length === 1 ? 'Season ' : 'Seasons ') + runs.join(', ');
};

export function seriesRequestSummary(
  title: string,
  result: { seasons?: { seasonNumber: number }[] } | undefined,
  is4k = false
) {
  const accepted = [
    ...new Set(
      result?.seasons
        ?.map(({ seasonNumber }) => seasonNumber)
        .filter((number) => Number.isSafeInteger(number) && number >= 0)
    ),
  ];
  const name = title + (is4k ? ' in 4K' : '');
  return accepted.length
    ? `Requested ${name} · ${seasonList(accepted)}`
    : `Request submitted for ${name}`;
}
