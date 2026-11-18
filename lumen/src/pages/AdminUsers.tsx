import { Link, useSearchParams } from 'react-router-dom';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

interface DirectoryUser {
  id: number;
  displayName: string;
  email?: string;
  permissions: number;
  requestCount?: number;
}

const pageSize = 25;
const sorts = {
  displayname: 'Name',
  requests: 'Request Count',
  created: 'Date Added',
  updated: 'Last Updated',
  usertype: 'Account Type',
  role: 'Role',
};

export default function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') ?? '').slice(0, 200);
  const requestedSort = params.get('sort') ?? '';
  const sort = Object.hasOwn(sorts, requestedSort)
    ? requestedSort
    : 'displayname';
  const direction = params.get('direction') === 'desc' ? 'desc' : 'asc';
  const rawPage = params.get('page') ?? '';
  const page = /^[1-9]\d{0,3}$/.test(rawPage) ? Number(rawPage) : 1;
  const query = new URLSearchParams({
    take: String(pageSize),
    skip: String((page - 1) * pageSize),
    sort,
    sortDirection: direction,
  });
  if (search) query.set('q', search);
  const { data, error, reload } = useApi<{
    pageInfo: { pages: number; results: number };
    results: DirectoryUser[];
  }>(`/user?${query}`, { currentPathOnly: true, keepDuringRefresh: true });

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  return (
    <>
      <header className="ph">
        <h1>Users</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
        <button className="btn btn-quiet btn-sm" onClick={reload}>
          Refresh
        </button>
      </div>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          update(
            'q',
            String(new FormData(event.currentTarget).get('q') ?? '').trim()
          );
        }}
      >
        <label className="sel">
          <span className="lbl">Search Users</span>
          <input
            className="cfg-json"
            key={search}
            name="q"
            defaultValue={search}
            maxLength={200}
          />
        </label>
        <button className="btn btn-tonal btn-sm">Search</button>
        <label className="sel">
          <span className="lbl">Sort By</span>
          <select
            value={sort}
            onChange={(event) => update('sort', event.target.value)}
          >
            {Object.entries(sorts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="sel">
          <span className="lbl">Sort Direction</span>
          <select
            value={direction}
            onChange={(event) => update('direction', event.target.value)}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </form>
      <ServiceNote error={error} what="users" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading users…
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">No users match this search.</p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results.map((user) => (
            <li className="set" key={user.id}>
              <div>
                <b>{user.displayName}</b>
                {user.email && user.email !== user.displayName && (
                  <small>{user.email}</small>
                )}
              </div>
              <div>
                <small>
                  {user.id === 1
                    ? 'Owner'
                    : (user.permissions & 2) !== 0
                      ? 'Administrator'
                      : (user.permissions & 8) !== 0
                        ? 'User Manager'
                        : 'Member'}
                </small>
                {user.requestCount !== undefined && (
                  <small>{user.requestCount.toLocaleString()} requests</small>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || (data?.pageInfo.pages ?? 0) > 1) && (
        <div className="toolbar">
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1}
            onClick={() => update('page', page === 2 ? '' : String(page - 1))}
          >
            Previous Page
          </button>
          <span>Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={!data || page >= Math.min(9999, data.pageInfo.pages)}
            onClick={() => update('page', String(page + 1))}
          >
            Next Page
          </button>
        </div>
      )}
    </>
  );
}
