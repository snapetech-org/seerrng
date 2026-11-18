import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon } from '../icons';
import { canSearchIndexers } from '../indexerPermissions';
import { getIndexerSearchHref } from '../indexerSearchHref';

export default function IndexerSearchLink({
  category,
  title,
  standalone = false,
}: {
  category: string;
  title?: string;
  standalone?: boolean;
}) {
  const { user } = useAuth();
  const href = title ? getIndexerSearchHref(category, title) : undefined;
  if (!href || !canSearchIndexers(user?.permissions)) return null;

  const link = (
    <Link className="btn btn-quiet btn-sm" to={href}>
      <Icon name="search" size="sm" />
      Search Prowlarr
    </Link>
  );
  return standalone ? <div className="dstatus">{link}</div> : link;
}
