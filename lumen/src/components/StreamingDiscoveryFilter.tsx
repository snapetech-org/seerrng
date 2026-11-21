import { useState } from 'react';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';

interface Provider {
  id: number;
  name: string;
}

export function StreamingDiscoveryFilter({
  kind,
  region,
  providers,
  exclude,
  apply,
}: {
  kind: 'movie' | 'tv';
  region: string;
  providers: string[];
  exclude: boolean;
  apply: (region: string, providers: string[], exclude: boolean) => void;
}) {
  const [draftRegion, setRegion] = useState(region);
  const [draftProviders, setProviders] = useState(providers);
  const [draftExclude, setExclude] = useState(exclude);
  const validRegion = /^[A-Z]{2}$/.test(draftRegion);
  const catalog = useApi<Provider[]>(
    validRegion
      ? `/watchproviders/${kind === 'movie' ? 'movies' : 'tv'}?watchRegion=${draftRegion}`
      : null
  );
  const options = new Map(
    (Array.isArray(catalog.data) ? catalog.data : []).map(({ id, name }) => [
      String(id),
      name,
    ])
  );
  for (const id of draftProviders) {
    if (!options.has(id)) options.set(id, `Provider #${id}`);
  }
  return (
    <form
      aria-label="Streaming Service Filter"
      onSubmit={(event) => {
        event.preventDefault();
        if (validRegion && draftProviders.length <= 50)
          apply(draftRegion, draftProviders, draftExclude);
      }}
    >
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">Streaming Region</span>
          <input
            className="cfg-input"
            value={draftRegion}
            maxLength={2}
            pattern="[A-Z]{2}"
            required
            onChange={(event) => {
              setRegion(event.target.value.toUpperCase());
              setProviders([]);
            }}
          />
        </label>
        <label className="sel">
          <span className="lbl">Provider Match</span>
          <select
            value={draftExclude ? 'exclude' : 'include'}
            onChange={(event) => setExclude(event.target.value === 'exclude')}
          >
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </select>
        </label>
        <button
          className="btn btn-tonal btn-sm"
          disabled={
            !validRegion || !draftProviders.length || draftProviders.length > 50
          }
        >
          Apply Streaming Filter
        </button>
        {!!providers.length && (
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            onClick={() => apply(region, [], false)}
          >
            Clear Streaming Filter
          </button>
        )}
      </div>
      <div className="setlist">
        <div className="set cfg-stack">
          <span>
            <b>Streaming Services</b>
            <small>
              Select up to 50 services. {draftProviders.length} selected.
            </small>
          </span>
          <div
            className="setlist picklist"
            role="group"
            aria-label="Streaming Services"
          >
            {[...options].map(([id, name]) => (
              <label className="set pick" key={id}>
                <b>{name}</b>
                <input
                  type="checkbox"
                  checked={draftProviders.includes(id)}
                  onChange={(event) =>
                    setProviders(
                      event.target.checked
                        ? [...draftProviders, id]
                        : draftProviders.filter((item) => item !== id)
                    )
                  }
                />
              </label>
            ))}
          </div>
        </div>
      </div>
      {validRegion && !catalog.data && !catalog.error && (
        <p className="note" role="status">
          Loading streaming services…
        </p>
      )}
      <ServiceNote
        error={catalog.error}
        what="streaming services"
        retry={catalog.reload}
      />
    </form>
  );
}
