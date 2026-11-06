import defineMessages from '@app/utils/defineMessages';
import { getSafeHref } from '@app/utils/safeUrl';
import type {
  VideoMetadataAttribution as VideoMetadataSource,
  VideoMetadataSourceName,
} from '@server/models/VideoMetadata';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MediaDetails.MetadataAttribution', {
  label: 'Metadata sources',
  licenseInformation: '{license} license information',
  tmdb: 'TMDB',
  tvdb: 'TheTVDB.com',
  tvmaze: 'TVmaze (adapted)',
  wikidata: 'Wikidata',
  tmdbTitle: 'View metadata source on TMDB.',
  tvdbTitle: 'Metadata provided by TheTVDB. Attribution required.',
  tvmazeTitle:
    'TVmaze metadata is adapted and shared under the CC BY-SA 4.0 license.',
  wikidataTitle: 'Wikidata structured data is shared under CC0.',
});

const sourceLabels: Record<VideoMetadataSourceName, keyof typeof messages> = {
  tmdb: 'tmdb',
  tvdb: 'tvdb',
  tvmaze: 'tvmaze',
  wikidata: 'wikidata',
};

const sourceTitles: Record<VideoMetadataSourceName, keyof typeof messages> = {
  tmdb: 'tmdbTitle',
  tvdb: 'tvdbTitle',
  tvmaze: 'tvmazeTitle',
  wikidata: 'wikidataTitle',
};

const MetadataAttribution = ({
  sources,
}: {
  sources?: VideoMetadataSource[];
}) => {
  const intl = useIntl();
  const links = (sources ?? []).flatMap((source) => {
    const href = getSafeHref(source.url);
    return href ? [{ ...source, href }] : [];
  });

  if (links.length === 0) {
    return null;
  }

  return (
    <aside
      className="media-metadata-attribution"
      aria-label={intl.formatMessage(messages.label)}
    >
      <span className="media-metadata-attribution-label">
        {intl.formatMessage(messages.label)}:
      </span>
      <ul className="media-metadata-attribution-links">
        {links.map((source) => (
          <li key={`${source.source}-${source.href}`}>
            <a
              className="media-metadata-attribution-link"
              href={source.href}
              target="_blank"
              rel="noreferrer"
              title={intl.formatMessage(messages[sourceTitles[source.source]])}
            >
              {intl.formatMessage(messages[sourceLabels[source.source]])}
            </a>
            {source.license && source.licenseUrl && (
              <>
                {' ('}
                <a
                  className="media-metadata-attribution-link"
                  href={getSafeHref(source.licenseUrl)}
                  target="_blank"
                  rel="noreferrer"
                  title={intl.formatMessage(messages.licenseInformation, {
                    license: source.license,
                  })}
                >
                  {source.license}
                </a>
                {')'}
              </>
            )}
            {source.license && !source.licenseUrl && ` (${source.license})`}
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default MetadataAttribution;
