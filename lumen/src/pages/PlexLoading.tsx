import { useEffect } from 'react';
import { useLumenLocale } from '../i18n';

export default function PlexLoading() {
  const { t } = useLumenLocale();

  useEffect(() => {
    const complete = new URLSearchParams(window.location.search).get(
      'complete'
    );
    if (complete === '1') window.close();
  }, []);

  return (
    <main className="boot boot-note" role="status" aria-busy="true">
      {t('lumen.login.plexLoading', 'Completing Plex sign-in…')}
    </main>
  );
}
