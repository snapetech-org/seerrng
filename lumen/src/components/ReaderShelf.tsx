import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, ApiError, readerServiceUrl } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

const settingsPath = '/settings/reader-delivery';
const names = { grimmory: 'Grimmory', bookorbit: 'BookOrbit' } as const;
type Provider = keyof typeof names;
interface Target {
  type: 'author' | 'book-series' | 'comic-series';
  id: string;
  name: string;
}

interface Grouping {
  targetType: Target['type'];
  targetId: string;
  provider: Provider;
  isPublic: boolean;
  syncToKobo: boolean;
  countVerified: boolean;
  lastMatchCount: number;
  serviceUrl: string;
}

interface Preview {
  matchedCount: number;
  ruleSummary: string;
  sampleTitles: string[];
}

function ShelfEditor({
  target,
  preferred,
  configured,
  groupings,
  pending,
}: {
  target: Target;
  preferred: Provider;
  configured: Record<Provider, boolean>;
  groupings: Grouping[];
  pending: { current: boolean };
}) {
  const [provider, setProvider] = useState(
    configured[preferred]
      ? preferred
      : configured.grimmory
        ? 'grimmory'
        : 'bookorbit'
  );
  const existingFor = (provider: Provider) =>
    groupings.find(
      (grouping) =>
        grouping.provider === provider &&
        grouping.targetType === target.type &&
        grouping.targetId === target.id
    );
  const existing = existingFor(provider);
  const [isPublic, setPublic] = useState(existing?.isPublic ?? true);
  const [syncToKobo, setSyncToKobo] = useState(existing?.syncToKobo ?? false);
  const [preview, setPreview] = useState<Preview>();
  const [allowEmpty, setAllowEmpty] = useState(false);
  const [result, setResult] = useState<{
    grouping: Grouping;
    warning?: string;
  }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(save: boolean) {
    if (
      pending.current ||
      (save && (!preview || (!preview.matchedCount && !allowEmpty)))
    )
      return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (save) {
        setResult(
          await api<{ grouping: Grouping; warning?: string }>(
            settingsPath + '/groupings',
            {
              method: 'POST',
              body: JSON.stringify({
                provider,
                target,
                isPublic,
                syncToKobo: provider === 'bookorbit' && syncToKobo,
                allowEmpty,
              }),
            }
          )
        );
      } else {
        setPreview(undefined);
        setAllowEmpty(false);
        setPreview(
          await api<Preview>(settingsPath + '/groupings/preview', {
            method: 'POST',
            body: JSON.stringify({ provider, target }),
          })
        );
      }
    } catch (failure) {
      if (
        save &&
        failure instanceof ApiError &&
        failure.code === 'empty-match'
      ) {
        setPreview({ matchedCount: 0, ruleSummary: '', sampleTitles: [] });
        setAllowEmpty(false);
      }
      setError(
        friendlyError(
          failure,
          save
            ? 'Could not save the reader shelf.'
            : 'Could not check the reader library.'
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const href = result && readerServiceUrl(result.grouping.serviceUrl)?.href;

  return result ? (
    <>
      <p role="status">Reader shelf saved</p>
      <p className="note">
        {result.grouping.countVerified
          ? `${result.grouping.lastMatchCount} items confirmed.`
          : `${result.grouping.lastMatchCount} preview matches. The reader has yet to confirm the final count.`}
      </p>
      {result.warning && <p className="note">{result.warning}</p>}
      <div className="toolbar">
        {href && (
          <a className="btn btn-tonal btn-sm" href={href}>
            Open {names[provider]}
          </a>
        )}
      </div>
    </>
  ) : (
    <>
      <p className="note">
        Create a shelf that updates as matching titles enter the reader library.
      </p>
      <div className="setlist">
        <label className="set cfg-row">
          <span>Reader Service</span>
          <select
            className="cfg-select"
            disabled={busy}
            value={provider}
            onChange={(event) => {
              const next = event.target.value as Provider;
              const grouping = existingFor(next);
              setProvider(next);
              setPublic(grouping?.isPublic ?? true);
              setSyncToKobo(grouping?.syncToKobo ?? false);
              setPreview(undefined);
              setAllowEmpty(false);
              setError(undefined);
            }}
          >
            <option value="grimmory" disabled={!configured.grimmory}>
              Grimmory
            </option>
            <option value="bookorbit" disabled={!configured.bookorbit}>
              BookOrbit
            </option>
          </select>
        </label>
        <label className="set cfg-row">
          <span>
            Share With Other Reader Users
            {provider === 'bookorbit' && existing && (
              <small>BookOrbit locks visibility after creation.</small>
            )}
          </span>
          <input
            type="checkbox"
            checked={isPublic}
            disabled={busy || (provider === 'bookorbit' && !!existing)}
            onChange={(event) => setPublic(event.target.checked)}
          />
        </label>
        {provider === 'bookorbit' && (
          <label className="set cfg-row">
            <span>Sync to Kobo</span>
            <input
              type="checkbox"
              checked={syncToKobo}
              disabled={busy}
              onChange={(event) => setSyncToKobo(event.target.checked)}
            />
          </label>
        )}
      </div>
      {preview && (
        <>
          <p role="status">{preview.matchedCount} current matches</p>
          {preview.ruleSummary && <p className="note">{preview.ruleSummary}</p>}
          {!!preview.sampleTitles.length && (
            <ul>
              {preview.sampleTitles.map((title, index) => (
                <li key={index}>{title}</li>
              ))}
            </ul>
          )}
          {!preview.matchedCount && (
            <label className="set cfg-row">
              <span>Create an Empty Shelf for Future Matches</span>
              <input
                type="checkbox"
                checked={allowEmpty}
                disabled={busy}
                onChange={(event) => setAllowEmpty(event.target.checked)}
              />
            </label>
          )}
        </>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <button
          type="button"
          className="btn btn-tonal btn-sm"
          disabled={busy}
          onClick={() => void run(false)}
        >
          Preview Matches
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !preview || (!preview.matchedCount && !allowEmpty)}
          onClick={() => void run(true)}
        >
          {existing ? 'Save Shelf Updates' : 'Create Shelf'}
        </button>
      </div>
    </>
  );
}

function ShelfSheet({ target, close }: { target: Target; close: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const settings = useApi<{
    preferredProvider: Provider;
    grimmoryUrl: string;
    bookorbitUrl: string;
  }>(settingsPath);
  const groupings = useApi<Grouping[]>(settingsPath + '/groupings');
  const pending = useRef(false);
  const dismiss = () => {
    if (!pending.current) close();
  };
  useDialog(dialog, dismiss);

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Reader Shelf"
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>Reader Shelf</h3>
            <p className="note">{target.name}</p>
          </header>
          <ServiceNote
            what="reader connections"
            error={settings.error}
            retry={settings.reload}
          />
          <ServiceNote
            what="reader shelves"
            error={groupings.error}
            retry={groupings.reload}
          />
          {settings.data && groupings.data ? (
            settings.data.grimmoryUrl || settings.data.bookorbitUrl ? (
              <ShelfEditor
                target={target}
                preferred={settings.data.preferredProvider}
                configured={{
                  grimmory: !!settings.data.grimmoryUrl,
                  bookorbit: !!settings.data.bookorbitUrl,
                }}
                groupings={groupings.data}
                pending={pending}
              />
            ) : (
              <Link className="go" to="/admin/reader-delivery">
                Configure Reader Delivery
              </Link>
            )
          ) : (
            !settings.error &&
            !groupings.error && (
              <p className="note" role="status">
                Loading reader settings…
              </p>
            )
          )}
          <div className="toolbar">
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={dismiss}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ReaderShelf({ target }: { target: Target }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!isAdministrator(user?.permissions) || !target.id || !target.name)
    return null;
  return (
    <>
      <button
        className="btn btn-tonal btn-sm"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Manage Reader Shelf
      </button>
      {open && <ShelfSheet target={target} close={() => setOpen(false)} />}
    </>
  );
}
