import { useId } from 'react';
import { useLumenLocale } from '../i18n';

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

const mediaCategoryDescriptionIds: Partial<
  Record<keyof typeof mediaCategoryLabels, string>
> = {
  movie: 'movieDescription',
  tv: 'tvDescription',
  music: 'musicDescription',
  ebook: 'ebookDescription',
  audiobook: 'audiobookDescription',
  comic: 'comicDescription',
  magazine: 'magazineDescription',
  retro: 'retroDescription',
  modern: 'modernDescription',
  game: 'gameDescription',
};

export default function MediaCategorySwitches({
  values,
  disabled,
  disableUnavailable = false,
  showDescriptions = false,
  onChange,
}: {
  values: Record<string, boolean | undefined>;
  disabled: boolean;
  disableUnavailable?: boolean;
  showDescriptions?: boolean;
  onChange: (key: string, enabled: boolean) => void;
}) {
  const { t } = useLumenLocale();
  const id = useId();
  return (
    <div
      className="setlist"
      role="group"
      aria-label={t(
        'components.Settings.SettingsCategories.groupTitle',
        'Enabled Media Categories'
      )}
    >
      {Object.entries(mediaCategoryLabels).map(([key, label]) => {
        const category = key as keyof typeof mediaCategoryLabels;
        const descriptionId = mediaCategoryDescriptionIds[category];
        const labelId =
          category === 'sports'
            ? 'lumen.mediaCategory.sports'
            : `components.Settings.SettingsCategories.${category}`;
        const localizedLabel = t(labelId, label);
        const description =
          showDescriptions && descriptionId
            ? t(
                `components.Settings.SettingsCategories.${descriptionId}`,
                `${label} discovery and requests.`
              )
            : undefined;
        const descriptionElementId = `${id}-${category}-description`;
        return (
          <label className="set" key={key}>
            <span>
              {localizedLabel}
              {description && (
                <small id={descriptionElementId}>{description}</small>
              )}
            </span>
            <input
              type="checkbox"
              aria-label={localizedLabel}
              aria-describedby={description ? descriptionElementId : undefined}
              disabled={
                disabled || (disableUnavailable && values[key] === undefined)
              }
              checked={values[key] ?? false}
              onChange={(event) => onChange(key, event.target.checked)}
            />
          </label>
        );
      })}
    </div>
  );
}
