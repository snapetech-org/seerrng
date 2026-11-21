import { lazy, Suspense, useEffect, useState } from 'react';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';

const releasesUrl =
  'https://api.github.com/repos/snapetech-org/seerrng/releases?per_page=20';
const releasePage = 'https://github.com/snapetech-org/seerrng/releases/tag/';
const Markdown = lazy(() => import('react-markdown'));

function releaseLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

interface Release {
  tag: string;
  title: string;
  notes: string;
}

function readReleases(value: unknown): Release[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { tag_name: tag, name, body } = entry as Record<string, unknown>;
    if (
      typeof tag !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(tag)
    )
      return [];
    return [
      {
        tag,
        title:
          typeof name === 'string' && name.trim() ? name.slice(0, 512) : tag,
        notes: typeof body === 'string' ? body.slice(0, 256 * 1024) : '',
      },
    ];
  });
}

function ReleaseRow({
  release,
  latest,
  installed,
}: {
  release: Release;
  latest: boolean;
  installed: string;
}) {
  const { t } = useLumenLocale();
  const [expanded, setExpanded] = useState(false);
  const { tag, title, notes } = release;

  return (
    <li className="set">
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          {title}
          {latest
            ? ` · ${t('components.Settings.SettingsAbout.Releases.latestversion', 'Latest')}`
            : ''}
          {tag.replace(/^v/, '') === installed.replace(/^v/, '')
            ? ` · ${t('components.Settings.SettingsAbout.Releases.installedversion', 'Installed')}`
            : ''}
        </summary>
        {expanded && notes && (
          <div className="ov long">
            <Suspense
              fallback={
                <p role="status">
                  {t(
                    'lumen.adminAbout.releaseHistory.loadingNotes',
                    'Loading release notes…'
                  )}
                </p>
              }
            >
              <Markdown
                skipHtml
                disallowedElements={['img']}
                urlTransform={releaseLink}
              >
                {notes}
              </Markdown>
            </Suspense>
          </div>
        )}
        <a className="go" href={releasePage + encodeURIComponent(tag)}>
          {t(
            'components.Settings.SettingsAbout.Releases.viewongithub',
            'View on GitHub'
          )}
        </a>
      </details>
    </li>
  );
}

export default function ReleaseHistory({ installed }: { installed: string }) {
  const { t } = useLumenLocale();
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState<Release[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || releases || failed) return;
    const controller = new AbortController();
    fetch(releasesUrl, { credentials: 'omit', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Release history unavailable');
        const rows = readReleases(await response.json());
        if (!controller.signal.aborted) setReleases(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, releases, failed]);

  return (
    <Section
      title={t('lumen.adminAbout.releaseHistory.title', 'Release History')}
      action={
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open
            ? t('lumen.adminAbout.releaseHistory.hide', 'Hide Releases')
            : t('lumen.adminAbout.releaseHistory.show', 'Show Releases')}
        </button>
      }
    >
      {open && (
        <>
          {failed ? (
            <p className="note" role="alert">
              {t(
                'lumen.adminAbout.releaseHistory.failure',
                'Release history could not be loaded.'
              )}{' '}
              <button
                className="btn btn-quiet btn-sm"
                type="button"
                onClick={() => setFailed(false)}
              >
                {t('lumen.adminAbout.releaseHistory.retry', 'Retry')}
              </button>
            </p>
          ) : !releases ? (
            <p className="note" role="status">
              {t(
                'lumen.adminAbout.releaseHistory.loading',
                'Loading releases…'
              )}
            </p>
          ) : releases.length === 0 ? (
            <p className="note">
              {t(
                'components.Settings.SettingsAbout.Releases.releasedataMissing',
                'No releases available.'
              )}
            </p>
          ) : (
            <ul className="setlist">
              {releases.map((release, index) => (
                <ReleaseRow
                  key={release.tag}
                  release={release}
                  latest={index === 0}
                  installed={installed}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
