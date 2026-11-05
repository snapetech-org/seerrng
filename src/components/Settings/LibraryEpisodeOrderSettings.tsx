import defineMessages from '@app/utils/defineMessages';
import { MetadataProviderType } from '@server/constants/metadata';
import type { Library } from '@server/lib/settings';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Settings.LibraryEpisodeOrder', {
  title: 'Episode Numbering Order',
  description:
    'Choose the episode numbering used by each library. Availability appears only when this matches the selected TV or anime metadata provider.',
  label: 'Episode Order for {library}',
  notConfigured: 'Not Configured',
  tmdb: 'TMDB',
  tvdb: 'TheTVDB',
  help: 'Choose the provider used by this library. Leave this unconfigured when the library order is unknown or does not match SeerrNG.',
});

interface LibraryEpisodeOrderSettingsProps {
  libraries: Library[];
  disabled?: boolean;
  onChange: (
    libraryId: string,
    provider: MetadataProviderType | undefined
  ) => void;
}

const LibraryEpisodeOrderSettings = ({
  libraries,
  disabled = false,
  onChange,
}: LibraryEpisodeOrderSettingsProps) => {
  const intl = useIntl();
  const showLibraries = libraries.filter((library) => library.type === 'show');

  if (showLibraries.length === 0) return null;

  return (
    <section className="app-card-sub settings-group-card">
      <h3 className="heading">{intl.formatMessage(messages.title)}</h3>
      <p className="description">{intl.formatMessage(messages.description)}</p>
      <div className="settings-group-content">
        {showLibraries.map((library) => {
          const id = `episode-order-${library.id}`;
          return (
            <div className="form-row" key={library.id}>
              <label htmlFor={id}>
                {intl.formatMessage(messages.label, { library: library.name })}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id={id}
                    value={library.episodeOrderProvider ?? 'none'}
                    disabled={disabled}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      onChange(
                        library.id,
                        value === 'none'
                          ? undefined
                          : (value as MetadataProviderType)
                      );
                    }}
                  >
                    <option value="none">
                      {intl.formatMessage(messages.notConfigured)}
                    </option>
                    <option value={MetadataProviderType.TMDB}>
                      {intl.formatMessage(messages.tmdb)}
                    </option>
                    <option value={MetadataProviderType.TVDB}>
                      {intl.formatMessage(messages.tvdb)}
                    </option>
                  </select>
                </div>
                <p className="settings-form-row-description">
                  {intl.formatMessage(messages.help)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default LibraryEpisodeOrderSettings;
