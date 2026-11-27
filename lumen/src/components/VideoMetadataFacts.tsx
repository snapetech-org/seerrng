import type { ReactNode } from 'react';
import { formatLocalizedList } from '../../../src/utils/numberHelpers';
import { getSafeHref } from '../../../src/utils/safeUrl';
import type {
  VideoMetadataAttribution,
  VideoMetadataSupplemental,
} from '../api';
import type { LumenLocale, useLumenLocale } from '../i18n';

const sources = {
  tmdb: ['components.MediaDetails.MetadataAttribution.tmdb', 'TMDB'],
  tvdb: ['components.MediaDetails.MetadataAttribution.tvdb', 'TheTVDB.com'],
  tvmaze: [
    'components.MediaDetails.MetadataAttribution.tvmaze',
    'TVmaze (adapted)',
  ],
  wikidata: [
    'components.MediaDetails.MetadataAttribution.wikidata',
    'Wikidata',
  ],
} as const;

const sourceTitles = {
  tmdb: [
    'components.MediaDetails.MetadataAttribution.tmdbTitle',
    'View metadata source on TMDB.',
  ],
  tvdb: [
    'components.MediaDetails.MetadataAttribution.tvdbTitle',
    'Metadata provided by TheTVDB. Attribution required.',
  ],
  tvmaze: [
    'components.MediaDetails.MetadataAttribution.tvmazeTitle',
    'TVmaze metadata is adapted and shared under the CC BY-SA 4.0 license.',
  ],
  wikidata: [
    'components.MediaDetails.MetadataAttribution.wikidataTitle',
    'Wikidata structured data is shared under CC0.',
  ],
} as const;

type Translate = ReturnType<typeof useLumenLocale>['t'];

export function videoMetadataRows(
  metadataSources: VideoMetadataAttribution[] | undefined,
  supplemental: VideoMetadataSupplemental | undefined,
  knownNames: string[],
  locale: LumenLocale,
  t: Translate
): [string, ReactNode][] {
  const rows: [string, ReactNode][] = [];
  const sourceLabel = t(
    'components.MediaDetails.MetadataAttribution.label',
    'Metadata sources'
  );
  let linkedSourceCount = 0;
  const sourceLinks = (metadataSources ?? []).flatMap((source) => {
    const href = getSafeHref(source.url);
    const sourceCopy = sources[source.source];
    const titleCopy = sourceTitles[source.source];
    if (!href || !sourceCopy || !titleCopy) return [];
    const licenseHref = source.licenseUrl
      ? getSafeHref(source.licenseUrl)
      : undefined;
    const index = linkedSourceCount++;
    const separator = index > 0 ? ', ' : null;
    return [
      <span key={`${source.source}-${href}-${index}`}>
        {separator}
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={t(titleCopy[0], titleCopy[1])}
        >
          {t(sourceCopy[0], sourceCopy[1])}
        </a>
        {source.license && licenseHref ? (
          <>
            {' ('}
            <a
              href={licenseHref}
              target="_blank"
              rel="noreferrer"
              title={t(
                'components.MediaDetails.MetadataAttribution.licenseInformation',
                '{license} license information',
                { license: source.license }
              )}
            >
              {source.license}
            </a>
            {')'}
          </>
        ) : source.license ? (
          ` (${source.license})`
        ) : null}
      </span>,
    ];
  });
  if (sourceLinks.length)
    rows.push([
      sourceLabel,
      <span aria-label={sourceLabel}>{sourceLinks}</span>,
    ]);

  const known = new Set(
    knownNames.map((name) => name.trim().toLocaleLowerCase())
  );
  const directors = (supplemental?.directors ?? [])
    .filter(
      (name) => name.trim() && !known.has(name.trim().toLocaleLowerCase())
    )
    .slice(0, 4);
  const writers = (supplemental?.writers ?? [])
    .filter(
      (name) => name.trim() && !known.has(name.trim().toLocaleLowerCase())
    )
    .slice(0, 4);
  if (directors.length)
    rows.push([
      t('components.TvDetails.Layout.director', 'Director'),
      formatLocalizedList(directors, locale),
    ]);
  if (writers.length)
    rows.push([
      t('components.TvDetails.Layout.writers', 'Writers'),
      formatLocalizedList(writers, locale),
    ]);
  return rows;
}
