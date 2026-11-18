import { connectionHostsPath, type Host } from '../api';
import { useApi } from '../hooks';

export function SavedConnectionHost({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (hostname: string) => void;
}) {
  const hosts = useApi<Host[]>(connectionHostsPath);
  if (!hosts.data?.length) return null;

  return (
    <label className="set cfg-row">
      <span>Saved Connection Host</span>
      <select
        className="cfg-select"
        disabled={disabled}
        value=""
        onChange={(event) => {
          if (event.target.value) onSelect(event.target.value);
        }}
      >
        <option value="">Choose a Saved Host</option>
        {hosts.data.map(({ name, hostname }) => (
          <option key={name} value={hostname}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
