import Button from '@app/components/Common/Button';
import SettingsFormRow from '@app/components/Settings/SettingsFormRow';
import messages from '@app/components/WatchSessions/messages';
import type { WatchSessionFilters } from '@app/components/WatchSessions/types';
import type { TmdbGenre } from '@server/api/themoviedb/interfaces';
import axios from 'axios';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useIntl, type MessageDescriptor } from 'react-intl';
import useSWR from 'swr';

export interface SessionFormValues {
  title: string;
  filters: WatchSessionFilters;
}

interface SessionFormProps {
  initialTitle?: string;
  initialFilters?: WatchSessionFilters;
  submitLabel: MessageDescriptor;
  savingLabel: MessageDescriptor;
  onSubmit: (values: SessionFormValues) => Promise<void>;
}

const SessionForm = ({
  initialTitle = '',
  initialFilters,
  submitLabel,
  savingLabel,
  onSubmit,
}: SessionFormProps) => {
  const intl = useIntl();
  const [title, setTitle] = useState(initialTitle);
  const [genreIds, setGenreIds] = useState<number[]>(
    initialFilters?.genreIds ?? []
  );
  const [ranking, setRanking] = useState<WatchSessionFilters['ranking']>(
    initialFilters?.ranking ?? 'popularity.desc'
  );
  const [yearFrom, setYearFrom] = useState(
    initialFilters?.releaseYearFrom?.toString() ?? ''
  );
  const [yearTo, setYearTo] = useState(
    initialFilters?.releaseYearTo?.toString() ?? ''
  );
  const [minimumRating, setMinimumRating] = useState(
    initialFilters?.minimumRating?.toString() ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const { data: genres } = useSWR<TmdbGenre[]>('/api/v1/genres/movie');

  const selectedGenres = (event: ChangeEvent<HTMLSelectElement>) => {
    setGenreIds(
      Array.from(event.target.selectedOptions)
        .map((option) => Number(option.value))
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .slice(0, 5)
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setSaving(true);
    const filters: WatchSessionFilters = {
      genreIds,
      ranking,
      ...(yearFrom ? { releaseYearFrom: Number(yearFrom) } : {}),
      ...(yearTo ? { releaseYearTo: Number(yearTo) } : {}),
      ...(minimumRating ? { minimumRating: Number(minimumRating) } : {}),
    };

    try {
      await onSubmit({ title, filters });
    } catch (error) {
      const apiMessage = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      setFormError(apiMessage ?? intl.formatMessage(messages.networkError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <SettingsFormRow
        htmlFor="watch-session-title"
        label={intl.formatMessage(messages.sessionName)}
      >
        <input
          id="watch-session-title"
          name="title"
          type="text"
          maxLength={80}
          required
          value={title}
          placeholder={intl.formatMessage(messages.sessionNamePlaceholder)}
          onChange={(event) => setTitle(event.target.value)}
        />
      </SettingsFormRow>

      <h3 className="card-subheading">
        {intl.formatMessage(messages.filters)}
      </h3>
      <SettingsFormRow
        htmlFor="watch-session-genres"
        label={intl.formatMessage(messages.genres)}
        description={intl.formatMessage(messages.genresHelp)}
      >
        <select
          id="watch-session-genres"
          multiple
          size={6}
          value={genreIds.map(String)}
          onChange={selectedGenres}
        >
          {(genres ?? []).map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.name}
            </option>
          ))}
        </select>
      </SettingsFormRow>

      <SettingsFormRow
        htmlFor="watch-session-ranking"
        label={intl.formatMessage(messages.ranking)}
      >
        <select
          id="watch-session-ranking"
          value={ranking}
          onChange={(event) =>
            setRanking(event.target.value as WatchSessionFilters['ranking'])
          }
        >
          <option value="popularity.desc">
            {intl.formatMessage(messages.popularity)}
          </option>
          <option value="vote_average.desc">
            {intl.formatMessage(messages.highestRated)}
          </option>
          <option value="primary_release_date.desc">
            {intl.formatMessage(messages.newest)}
          </option>
        </select>
      </SettingsFormRow>

      <SettingsFormRow
        htmlFor="watch-session-year-from"
        label={intl.formatMessage(messages.yearFrom)}
      >
        <input
          id="watch-session-year-from"
          type="number"
          min={1870}
          max={2100}
          value={yearFrom}
          onChange={(event) => setYearFrom(event.target.value)}
        />
      </SettingsFormRow>

      <SettingsFormRow
        htmlFor="watch-session-year-to"
        label={intl.formatMessage(messages.yearTo)}
      >
        <input
          id="watch-session-year-to"
          type="number"
          min={1870}
          max={2100}
          value={yearTo}
          onChange={(event) => setYearTo(event.target.value)}
        />
      </SettingsFormRow>

      <SettingsFormRow
        htmlFor="watch-session-minimum-rating"
        label={intl.formatMessage(messages.minimumRating)}
      >
        <input
          id="watch-session-minimum-rating"
          type="number"
          min={0}
          max={9.9}
          step={0.1}
          value={minimumRating}
          onChange={(event) => setMinimumRating(event.target.value)}
        />
      </SettingsFormRow>

      {formError && (
        <p className="page-error-message" role="alert">
          {formError}
        </p>
      )}
      <div className="app-action-row">
        <Button type="submit" buttonType="success" disabled={saving}>
          {intl.formatMessage(saving ? savingLabel : submitLabel)}
        </Button>
      </div>
    </form>
  );
};

export default SessionForm;
