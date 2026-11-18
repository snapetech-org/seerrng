export const mediaCategoryLabels = {
  movie: 'Movies',
  tv: 'Series',
  music: 'Music',
  ebook: 'Ebooks',
  audiobook: 'Audiobooks',
  comic: 'Comics',
  magazine: 'Magazines',
  adult: 'Adult',
  sports: 'Sports',
  retro: 'Retro Software',
  modern: 'Modern Software',
  game: 'Games',
};

export default function MediaCategorySwitches({
  values,
  disabled,
  disableUnavailable = false,
  onChange,
}: {
  values: Record<string, boolean | undefined>;
  disabled: boolean;
  disableUnavailable?: boolean;
  onChange: (key: string, enabled: boolean) => void;
}) {
  return (
    <div className="setlist" role="group" aria-label="Enabled Media Categories">
      {Object.entries(mediaCategoryLabels).map(([key, label]) => (
        <label className="set" key={key}>
          <span>{label}</span>
          <input
            type="checkbox"
            disabled={
              disabled || (disableUnavailable && values[key] === undefined)
            }
            checked={values[key] ?? false}
            onChange={(event) => onChange(key, event.target.checked)}
          />
        </label>
      ))}
    </div>
  );
}
