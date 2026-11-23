import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { IssueStatus } from '../../../server/constants/issue';
import type { MediaInfo } from '../api';
import { useAuth } from '../auth';
import { useLumenLocale } from '../i18n';
import { canReadIssues, canViewIssueReporter } from '../issuePermissions';

const EmbeddedIssueDiscussion = lazy(() =>
  import('../pages/Issues').then((module) => ({
    default: module.EmbeddedIssueDiscussion,
  }))
);

const ISSUE_TYPE_FALLBACKS = ['Issue', 'Video', 'Audio', 'Subtitles', 'Other'];
const ISSUE_REASON_MESSAGES: Record<string, { key: string; fallback: string }> =
  {
    missing_content: {
      key: 'components.IssueModal.issueReasonMissingContent',
      fallback: 'Missing content',
    },
    missing_issue: {
      key: 'components.IssueModal.issueReasonMissingIssue',
      fallback: 'Missing issue',
    },
    wrong_edition: {
      key: 'components.IssueModal.issueReasonWrongEdition',
      fallback: 'Wrong edition or variant',
    },
    wrong_issue: {
      key: 'components.IssueModal.issueReasonWrongIssue',
      fallback: 'Wrong issue or date',
    },
    damaged_file: {
      key: 'components.IssueModal.issueReasonDamagedFile',
      fallback: 'Damaged or unreadable file',
    },
    incorrect_metadata: {
      key: 'components.IssueModal.issueReasonIncorrectMetadata',
      fallback: 'Incorrect title or metadata',
    },
    other: { key: 'components.IssueModal.issueOther', fallback: 'Other' },
  };
const ISSUE_REASONS_BY_MEDIA: Record<string, string[]> = {
  book: [
    'missing_content',
    'wrong_edition',
    'damaged_file',
    'incorrect_metadata',
    'other',
  ],
  comic: [
    'missing_issue',
    'wrong_edition',
    'damaged_file',
    'incorrect_metadata',
    'other',
  ],
  magazine: [
    'missing_issue',
    'wrong_issue',
    'damaged_file',
    'incorrect_metadata',
    'other',
  ],
};

export default function OpenIssueReports({
  issues,
  id,
  mediaType,
}: {
  issues: MediaInfo['issues'];
  id: string;
  mediaType: 'book' | 'comic' | 'magazine' | 'music';
}) {
  const { user } = useAuth();
  const { locale, t } = useLumenLocale();
  const canViewReporter = canViewIssueReporter(user?.permissions);
  const [expandedIssueId, setExpandedIssueId] = useState<number>();
  const openIssues = canReadIssues(user?.permissions)
    ? (issues ?? []).filter((issue) => issue.status === IssueStatus.OPEN)
    : [];

  if (!openIssues.length) return null;

  return (
    <section aria-labelledby={id}>
      <div className="sec-head">
        <h2 id={id}>{t('lumen.issues.openIssues', 'Open Issues')}</h2>
      </div>
      <ul className="setlist">
        {openIssues.map((issue) => (
          <li key={issue.id} className="set">
            <div>
              <Link to={`/issues/${issue.id}`}>
                {t(
                  `lumen.issues.type.${issue.issueType}`,
                  ISSUE_TYPE_FALLBACKS[issue.issueType] ?? 'Issue'
                )}{' '}
                #{issue.id}
              </Link>
            </div>
            {issue.issueSubtype &&
              ISSUE_REASONS_BY_MEDIA[mediaType]?.includes(
                issue.issueSubtype
              ) && (
                <p className="det">
                  {t('components.IssueList.IssueItem.issuereason', 'Reason')}:{' '}
                  {t(
                    ISSUE_REASON_MESSAGES[issue.issueSubtype].key,
                    ISSUE_REASON_MESSAGES[issue.issueSubtype].fallback
                  )}
                </p>
              )}
            {(issue.createdAt || issue.createdBy?.displayName) && (
              <p className="det">
                {issue.createdAt && (
                  <>
                    {t('lumen.issues.field.createdDate', 'Created Date')}:{' '}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                    }).format(new Date(issue.createdAt))}
                  </>
                )}
                {issue.createdAt && issue.createdBy?.displayName ? ' · ' : ''}
                {issue.createdBy?.displayName && (
                  <>
                    {t('lumen.issues.field.createdBy', 'Created By')}:{' '}
                    {canViewReporter ? (
                      issue.createdBy.id ? (
                        <Link to={`/users/${issue.createdBy.id}`}>
                          {issue.createdBy.displayName}
                        </Link>
                      ) : (
                        issue.createdBy.displayName
                      )
                    ) : (
                      t('lumen.issues.unavailable', 'Not available')
                    )}
                  </>
                )}
              </p>
            )}
            {issue.comments?.[0]?.message && (
              <p className="det">{issue.comments[0].message}</p>
            )}
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              aria-expanded={expandedIssueId === issue.id}
              aria-controls={`${id}-discussion-${issue.id}`}
              onClick={() =>
                setExpandedIssueId((current) =>
                  current === issue.id ? undefined : issue.id
                )
              }
            >
              {expandedIssueId === issue.id
                ? t('lumen.issues.hideDetails', 'Hide Details')
                : t('lumen.issues.viewDiscussion', 'View Discussion')}
            </button>
            {expandedIssueId === issue.id && (
              <section
                id={`${id}-discussion-${issue.id}`}
                aria-label={t('lumen.issues.issueDetails', 'Issue Details')}
              >
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      {t('lumen.issues.loadingIssue', 'Loading issue…')}
                    </p>
                  }
                >
                  <EmbeddedIssueDiscussion id={issue.id} />
                </Suspense>
              </section>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
