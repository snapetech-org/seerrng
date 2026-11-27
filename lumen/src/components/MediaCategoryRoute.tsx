import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isAdministrator, useAuth } from '../auth';
import type { PublicSettings } from '../hooks';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { usePrefs } from '../settings';
import { fullSeerrUrl } from './Shell';
import { ServiceNote } from './extra';

type Category = 'movie' | 'tv' | 'ebook' | 'audiobook';
const labels: Record<Category, [string, string]> = {
  movie: ['components.Layout.Sidebar.browsemovies', 'Movies'],
  tv: ['components.Layout.Sidebar.browsetv', 'Series'],
  ebook: ['components.Layout.Sidebar.browsebooks', 'Ebooks'],
  audiobook: ['components.Layout.Sidebar.browseaudiobooks', 'Audiobooks'],
};

export function MediaCategoryRoute({
  categories: requestedCategories,
  children,
}: {
  categories: Category[] | 'book-detail' | 'book-recommendations';
  children: ReactNode;
}) {
  const location = useLocation();
  const categories: Category[] =
    requestedCategories === 'book-detail'
      ? [
          new URLSearchParams(location.search).get('f') === 'audio'
            ? 'audiobook'
            : 'ebook',
        ]
      : requestedCategories === 'book-recommendations'
        ? [
            new URLSearchParams(location.search).get('format') === 'audiobook'
              ? 'audiobook'
              : 'ebook',
          ]
        : requestedCategories;
  const pub = useApi<PublicSettings>('/settings/public');
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const mine = useApi<{ enabledMediaCategories?: Record<string, boolean> }>(
    user ? `/user/${user.id}/settings/main` : null
  );
  const userSettled = user !== undefined && (!user || !!mine.data);
  const enabled = pub.data?.enabledMediaCategories || {};
  const personal = mine.data?.enabledMediaCategories || {};
  const visible = categories.filter(
    (key) => enabled[key] !== false && personal[key] !== false
  );
  const { seerrPublicUrl } = usePrefs();
  const locked =
    pub.data?.lockLumenForNonAdmins && !isAdministrator(user?.permissions);

  if (!pub.data)
    return pub.error ? (
      <ServiceNote
        error={pub.error}
        what={t('lumen.adminCategories.categoriesWhat', 'media categories')}
        retry={pub.reload}
      />
    ) : (
      <div className="detail-loading" aria-busy="true" />
    );
  if (user && !mine.data && mine.error)
    return (
      <ServiceNote
        error={mine.error}
        what={t('lumen.adminCategories.categoriesWhat', 'media categories')}
        retry={mine.reload}
      />
    );
  if (!userSettled) return <div className="detail-loading" aria-busy="true" />;
  if (visible.length) return <>{children}</>;

  const title = categories
    .map((category) => t(...labels[category]))
    .join(` ${t('lumen.shell.or', 'or')} `);
  return (
    <div className="empty">
      <b>{title}</b>
      <p>
        {t(
          'lumen.category.disabledForAccount',
          'This category is turned off for your account.'
        )}
      </p>
      {t(
        'lumen.category.adminHelp',
        'An admin can enable it in SeerrNG under Settings › General › Media categories.'
      )}{' '}
      <Link to="/" style={{ color: 'var(--accent)' }}>
        {t('lumen.category.backDiscover', 'Back to Discover')}
      </Link>
      {!locked && (
        <>
          {' '}
          {t('lumen.shell.or', 'or')}{' '}
          <a
            href={fullSeerrUrl(seerrPublicUrl)}
            style={{ color: 'var(--accent)' }}
          >
            {t('lumen.shell.openFullSeerrNG', 'open full SeerrNG')}
          </a>
        </>
      )}
      .
    </div>
  );
}
