import { useEffect, useState } from 'react';
import { Section } from './cards';

const releasesUrl =
  'https://api.github.com/repos/snapetech-org/seerrng/releases?per_page=20';
const releasePage = 'https://github.com/snapetech-org/seerrng/releases/tag/';

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

export default function ReleaseHistory({ installed }: { installed: string }) {
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
      title="Release History"
      action={
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide Releases' : 'Show Releases'}
        </button>
      }
    >
      {open && (
        <>
          {failed ? (
            <p className="note" role="alert">
              Release history could not be loaded.{' '}
              <button
                className="btn btn-quiet btn-sm"
                type="button"
                onClick={() => setFailed(false)}
              >
                Retry
              </button>
            </p>
          ) : !releases ? (
            <p className="note" role="status">
              Loading releases…
            </p>
          ) : releases.length === 0 ? (
            <p className="note">No releases available.</p>
          ) : (
            <ul className="setlist">
              {releases.map(({ tag, title, notes }, index) => (
                <li className="set" key={tag}>
                  <details>
                    <summary>
                      {title}
                      {index === 0 ? ' · Latest' : ''}
                      {tag.replace(/^v/, '') === installed.replace(/^v/, '')
                        ? ' · Installed'
                        : ''}
                    </summary>
                    {notes && <p className="ov long">{notes}</p>}
                    <a
                      className="go"
                      href={releasePage + encodeURIComponent(tag)}
                    >
                      View on GitHub
                    </a>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
