import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';

export interface DownloadPathMapping {
  serviceType: string;
  serviceId?: number;
  remoteRoot: string;
  localRoot: string;
}

const format = (value: DownloadPathMapping[]) => JSON.stringify(value, null, 2);

export default function DownloadPathMappings({
  initial,
}: {
  initial: DownloadPathMapping[];
}) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState(() => format(initial));
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || draft.trim() === saved) return;
    setNotice('');
    setFailure('');
    let mappings: unknown;
    try {
      mappings = JSON.parse(draft);
    } catch {
      setFailure(
        t(
          'lumen.adminGeneral.downloadMappings.jsonError',
          'Enter a JSON array of path mappings.'
        )
      );
      return;
    }
    if (!Array.isArray(mappings) || mappings.length > 100) {
      setFailure(
        t(
          'lumen.adminGeneral.downloadMappings.jsonError',
          'Enter a JSON array with at most 100 path mappings.'
        )
      );
      return;
    }

    pending.current = true;
    setBusy(true);
    try {
      const result = await api<{
        downloadPathMappings?: DownloadPathMapping[];
      }>('/settings/main', {
        method: 'POST',
        body: JSON.stringify({ downloadPathMappings: mappings }),
      });
      if (!Array.isArray(result.downloadPathMappings)) {
        throw new Error(
          t(
            'lumen.adminGeneral.downloadMappings.confirmFailure',
            'Could not confirm the saved path mappings.'
          )
        );
      }
      const updated = format(result.downloadPathMappings);
      setDraft(updated);
      setSaved(updated);
      forget('/settings/main');
      setNotice(
        t(
          'lumen.adminGeneral.downloadMappings.saved',
          'Library path mappings saved.'
        )
      );
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t(
            'lumen.adminGeneral.downloadMappings.saveFailure',
            'Could not save library path mappings.'
          ),
          (id, fallback) => t(id, fallback)
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t('lumen.adminGeneral.downloadMappings.title', 'Download Copies')}
    >
      <form onSubmit={(event) => void save(event)}>
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              <b>
                {t(
                  'lumen.adminGeneral.downloadMappings.field',
                  'Library Path Mappings'
                )}
              </b>
              <small>
                {t(
                  'lumen.adminGeneral.downloadMappings.help',
                  'Enter a JSON array with serviceType, optional serviceId, remoteRoot, and localRoot. Use narrow library roots mounted read-only inside SeerrNG.'
                )}
              </small>
            </span>
            <textarea
              className="cfg-json"
              aria-label={t(
                'lumen.adminGeneral.downloadMappings.field',
                'Library Path Mappings'
              )}
              rows={8}
              spellCheck={false}
              value={draft}
              disabled={busy}
              onChange={(event) => {
                setDraft(event.target.value);
                setNotice('');
                setFailure('');
              }}
            />
          </label>
        </div>
        <div className="toolbar">
          <button
            className="btn btn-tonal btn-sm"
            disabled={busy || draft.trim() === saved}
          >
            {t(
              'lumen.adminGeneral.downloadMappings.saveButton',
              'Save Library Path Mappings'
            )}
          </button>
        </div>
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}
        {failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )}
      </form>
    </Section>
  );
}
