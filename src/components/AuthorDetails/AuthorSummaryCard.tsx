import CollectionOverview from '@app/components/CollectionDetails/CollectionOverview';
import CachedImage from '@app/components/Common/CachedImage';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { AuthorDetails } from '@server/models/Book';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AuthorDetails.AuthorSummaryCard', {
  bibliographyTitle: '{authorName} bibliography',
  overview: 'Overview',
  dates: 'Dates',
  bibliographySize: 'Bibliography size',
  selectionSize: 'Selection size',
});

export default function AuthorSummaryCard({
  author,
  selectionSize,
}: {
  author: AuthorDetails;
  selectionSize?: { selected: number; visible: number };
}) {
  const intl = useIntl();
  return (
    <section className="app-card-sub detail-item-surface detail-summary-card collection-summary-header">
      <div className="collection-summary-poster">
        <CachedImage
          type="book"
          src={author.posterPath || '/images/seerr_poster_not_found.png'}
          alt=""
          fill
          sizes="80px"
          className="collection-summary-poster-image"
        />
      </div>
      <div className="collection-summary-details">
        <h1 className="collection-summary-title">
          {intl.formatMessage(messages.bibliographyTitle, {
            authorName: author.name,
          })}
        </h1>
        <dl className="collection-summary-table detail-card-heading-spacing">
          <dt className="collection-summary-overview-label">
            {intl.formatMessage(messages.overview)}:
          </dt>
          <dd className="collection-summary-overview-value bibliography-overview-clamp">
            <CollectionOverview text={author.biography || '—'} />
          </dd>
          <dt className="collection-summary-genres-label">
            {intl.formatMessage(messages.dates)}:
          </dt>
          <dd className="collection-summary-genres-value">
            {[author.birthDate, author.deathDate].filter(Boolean).join(' – ') ||
              intl.formatMessage(globalMessages.notavailable)}
          </dd>
          <div className="collection-summary-size">
            <dt className="collection-summary-size-label">
              {intl.formatMessage(messages.bibliographySize)}:
            </dt>
            <dd className="collection-summary-size-value">
              {intl.formatNumber(author.pagination.totalItems)}
            </dd>
            {selectionSize && (
              <>
                <dt className="collection-summary-selection-label">
                  {intl.formatMessage(messages.selectionSize)}:
                </dt>
                <dd className="collection-summary-selection-value">
                  {intl.formatNumber(selectionSize.selected)} /{' '}
                  {intl.formatNumber(selectionSize.visible)}
                </dd>
              </>
            )}
          </div>
        </dl>
      </div>
    </section>
  );
}
