import { Link } from 'react-router-dom';
import { IssueStatus } from '../../../server/constants/issue';
import type { MediaInfo } from '../api';
import { useAuth } from '../auth';
import { useLumenLocale } from '../i18n';
import { canReadIssues } from '../issuePermissions';

const ISSUE_TYPE_FALLBACKS = ['Issue', 'Video', 'Audio', 'Subtitles', 'Other'];

export default function OpenIssueReports({
  issues,
  id,
}: {
  issues: MediaInfo['issues'];
  id: string;
}) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
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
            {issue.comments?.[0]?.message && (
              <p className="det">{issue.comments[0].message}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
