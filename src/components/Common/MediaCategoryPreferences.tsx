import SettingsField from '@app/components/Settings/SettingsField';
import SettingsFormRow from '@app/components/Settings/SettingsFormRow';
import defineMessages from '@app/utils/defineMessages';
import type { MediaCategoryKey } from '@server/constants/mediaCategories';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Common.MediaCategoryPreferences', {
  description:
    'Choose which configured categories this user can browse, search, and request.',
  categoryDescription:
    'Show {category} browsing, search and request options to this user.',
  movie: 'Movies',
  tv: 'Series',
  music: 'Music',
  ebook: 'Books',
  audiobook: 'Audiobooks',
  comic: 'Comics',
  magazine: 'Magazines',
  adult: 'Adult',
  sports: 'Sports',
  retro: 'Emulation (Retro)',
  modern: 'Emulation (Modern)',
  game: 'PC Games',
});

const categories: MediaCategoryKey[] = [
  'movie',
  'tv',
  'music',
  'ebook',
  'audiobook',
  'comic',
  'magazine',
  'adult',
  'sports',
  'retro',
  'modern',
  'game',
];

interface MediaCategoryPreferencesProps {
  fieldPrefix: string;
  disabled?: boolean;
  testIdPrefix: string;
  onChange?: () => void;
}

const MediaCategoryPreferences = ({
  fieldPrefix,
  disabled = false,
  testIdPrefix,
  onChange,
}: MediaCategoryPreferencesProps) => {
  const intl = useIntl();

  return (
    <div className="settings-group-content">
      <p className="settings-group-description">
        {intl.formatMessage(messages.description)}
      </p>
      {categories.map((category) => {
        const label = intl.formatMessage(messages[category]);
        const fieldName = `${fieldPrefix}.${category}`;

        return (
          <SettingsFormRow
            key={category}
            htmlFor={fieldName}
            label={label}
            description={intl.formatMessage(messages.categoryDescription, {
              category: label,
            })}
            labelClassName="checkbox-label"
            className="settings-form-row-compact-description"
          >
            <SettingsField
              type="checkbox"
              id={fieldName}
              name={fieldName}
              disabled={disabled}
              onChange={onChange}
              data-testid={`${testIdPrefix}-${category}`}
            />
          </SettingsFormRow>
        );
      })}
    </div>
  );
};

export default MediaCategoryPreferences;
