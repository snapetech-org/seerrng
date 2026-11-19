import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';
import { ServiceNote } from './extra';

const path = '/live-tv/sports';
const limit = 20;
interface Team {
  dataset: string;
  team: string;
  league?: string;
}
interface Follow extends Team {
  id: number;
}
const identity = (team: Team) =>
  JSON.stringify([team.dataset, team.team.toLowerCase()]);

export default function FollowedTeams({ canRequest }: { canRequest: boolean }) {
  const { t } = useLumenLocale();
  const teams = useApi<{
    configured: boolean;
    enabled?: boolean;
    teams: Team[];
  }>(path + '/teams');
  const follows = useApi<{ results: Follow[] }>(path + '/follows', {
    keepDuringRefresh: true,
  });
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const current = follows.data?.results ?? [];
  const followed = new Set(current.map(identity));
  const available = [
    ...new Map(
      (teams.data?.teams ?? []).map((team) => [identity(team), team])
    ).values(),
  ].filter((team) => !followed.has(identity(team)));
  const target = available.find((team) => identity(team) === selected);
  const canFollow =
    canRequest && !!follows.data && !follows.error && current.length < limit;

  async function update(remove?: Follow) {
    if (pending.current || (!remove && (!target || !canFollow))) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (remove) {
        await api(
          `${path}/follows/${remove.id}`,
          { method: 'DELETE' },
          'empty'
        );
      } else if (target) {
        const { dataset, team } = target;
        await api(path + '/follows', {
          method: 'POST',
          body: JSON.stringify({ dataset, team }),
        });
        setSelected('');
      }
      follows.reload();
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t(
            'lumen.recordings.followUpdateFailed',
            'Could not update the team follow.'
          )
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t('components.LiveTv.FollowedTeams.title', 'Followed Teams')}
    >
      <p className="note">
        {t(
          'components.LiveTv.FollowedTeams.description',
          'SeerrNG requests recordings when Tunerr matches upcoming games. Your usual recording approval rules apply.'
        )}
      </p>
      <ServiceNote
        what={t('components.LiveTv.FollowedTeams.title', 'followed teams')}
        error={follows.error}
        retry={follows.reload}
      />
      {!follows.data && !follows.error && (
        <p className="note" role="status">
          {t('lumen.recordings.loadingTeams', 'Loading followed teams…')}
        </p>
      )}
      {follows.data && !current.length && (
        <p className="note">
          {t(
            'components.LiveTv.FollowedTeams.none',
            'You are following no teams.'
          )}
        </p>
      )}
      {!!current.length && (
        <div className="setlist">
          {current.map((follow) => (
            <div className="set" key={follow.id}>
              <span>
                <b>{follow.team}</b>
                <small>{follow.dataset.toUpperCase()}</small>
              </span>
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={busy}
                aria-label={t(
                  'components.LiveTv.FollowedTeams.unfollow',
                  'Unfollow {team}',
                  { team: follow.team }
                )}
                onClick={() => void update(follow)}
              >
                {t(
                  'components.LiveTv.FollowedTeams.unfollow',
                  'Unfollow {team}',
                  { team: follow.team }
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      <ServiceNote
        what={t('lumen.recordings.teamSchedules', 'team schedules')}
        error={teams.error}
        retry={teams.reload}
      />
      {!teams.data && !teams.error && (
        <p className="note" role="status">
          {t('lumen.recordings.loadingSchedules', 'Loading team schedules…')}
        </p>
      )}
      {teams.data &&
        (teams.data.configured &&
        teams.data.enabled !== false &&
        teams.data.teams.length ? (
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">
                {t('components.LiveTv.FollowedTeams.team', 'Team')}
              </span>
              <select
                value={target ? selected : ''}
                disabled={busy || !canFollow || !available.length}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">
                  {t('components.LiveTv.FollowedTeams.choose', 'Choose a Team')}
                </option>
                {available.map((team) => (
                  <option key={identity(team)} value={identity(team)}>
                    {team.team} ({(team.league || team.dataset).toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy || !canFollow || !target}
              onClick={() => void update()}
            >
              {t('components.LiveTv.FollowedTeams.follow', 'Follow')}
            </button>
          </div>
        ) : (
          <p className="note">
            {t(
              'components.LiveTv.FollowedTeams.unavailable',
              'Team schedules are unavailable. An administrator can enable sports automation in Tunerr.'
            )}
          </p>
        ))}
      {current.length >= limit && (
        <p className="note">
          {t(
            'lumen.recordings.maxFollowedTeams',
            'You can follow up to 20 teams.'
          )}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
    </Section>
  );
}
