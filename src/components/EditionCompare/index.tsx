import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CoverImage from '@app/components/Common/CoverImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import FollowButton from '@app/components/Following/FollowButton';
import useBookEditions from '@app/hooks/useBookEditions';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type {
  EditionCard,
  NarratorSeriesPlan,
} from '@server/lib/editionCompare';
import axios from 'axios';
import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

export type EditionPolicy = 'only' | 'either' | 'alongside';

export interface EditionChoice {
  /** Provider edition id, sent as preferredEditionId. */
  editionId?: string;
  policy: EditionPolicy;
  variantKey?: string;
}

const messages = defineMessages('components.EditionCompare', {
  heading: 'Choose a Version',
  loading: 'Comparing editions…',
  editionLoadFailed:
    'Edition options could not be loaded. You can still submit this request without choosing a version.',
  seriesLoadFailed:
    'Narrator comparison could not be loaded. You can still request individual books.',
  retry: 'Retry',
  automatic: 'Best available match',
  automaticHelp: 'Let the library pick the edition it finds first.',
  narrators: 'Narrated by {names}',
  unknownNarrator: 'Narrator not listed',
  soloNarrator: 'Single Narrator',
  fullCast: 'Full Cast',
  abridged: 'Abridged',
  unabridged: 'Unabridged',
  duration: '{hours}h {minutes}m',
  inLibrary: 'Selected in Library',
  owned: 'Already Have It',
  unknown: 'Not listed: {fields}',
  unknownNarrators: 'narrators',
  unknownProduction: 'production',
  unknownAbridged: 'abridgement',
  unknownDuration: 'length',
  unknownLanguage: 'language',
  unknownReleaseDate: 'release date',
  policy: 'If You Already Have a Version',
  only: 'Only this version',
  onlyHelp: 'Use this edition instead of the one the library has selected.',
  either: 'Either of these',
  eitherHelp: 'Accept whichever listed edition is found first.',
  alongside: 'Keep this alongside the existing version',
  alongsideHelp: 'Track this performance as an additional version.',
  alongsideUnsupported:
    'This library cannot track a second version, so the choices above replace the current one.',
  followNarrator: 'Follow {narrator}',
  collect: 'Collect With {narrator}',
  collecting: 'The series now prefers {narrator}.',
  collectFailed: 'The narrator preference could not be saved.',
  seriesHeading: 'Collect This Series With One Narrator',
  seriesIntro:
    'Pick a narrator to see which volumes exist in that performance, which are missing, and which only exist in another one.',
  seriesUnsupported:
    'Narrator comparison across a series needs a newer Chaptarr.',
  covered: '{covered} of {total} volumes',
  missing: '{count, plural, one {# volume missing} other {# volumes missing}}',
  haveOwned: '{count, plural, one {# already owned} other {# already owned}}',
  otherOnly:
    '{count, plural, one {# volume only exists with another narrator} other {# volumes only exist with another narrator}}',
  complete: 'Complete Set',
  waitOrSettle:
    'You can wait for the missing volumes in this narration, or accept another narrator for them.',
  musicHeading: 'Compare Releases',
  musicStandard: 'Standard',
  musicDeluxe: 'Deluxe',
  musicRemaster: 'Remaster',
  musicExpanded: 'Expanded',
  musicAnniversary: 'Anniversary',
  musicOther: 'Other Release',
  tracks: '{count, plural, one {# track} other {# tracks}}',
  extraTracks: 'Adds: {titles}',
  missingTracks: 'Lacks: {titles}',
  mastering:
    'Mastering is not identified from file names or formats, only from the release’s own notes.',
  requestRelease: 'Request This Release',
  releaseRequested: 'Requested {title}.',
  releaseRequestFailed: 'This release could not be requested.',
  noRelease: 'No other releases are listed for this album.',
});

const formatDuration = (seconds: number, intl: ReturnType<typeof useIntl>) =>
  intl.formatMessage(messages.duration, {
    hours: Math.floor(seconds / 3600),
    minutes: Math.round((seconds % 3600) / 60),
  });

const unknownLabels = {
  narrators: messages.unknownNarrators,
  production: messages.unknownProduction,
  abridged: messages.unknownAbridged,
  duration: messages.unknownDuration,
  language: messages.unknownLanguage,
  releaseDate: messages.unknownReleaseDate,
} as const;

interface EditionCardPickerProps {
  bookId?: string;
  mediaId?: number;
  format: 'ebook' | 'audiobook';
  title: string;
  author?: string;
  foreignBookId?: string;
  value: EditionChoice;
  onChange: (choice: EditionChoice) => void;
}

/**
 * Edition and narration cards for the request modal. Unknown details stay
 * visibly unknown. Returns nothing when the catalog lists no editions.
 */
export const EditionCardPicker = ({
  bookId,
  mediaId,
  format,
  title,
  author,
  foreignBookId,
  value,
  onChange,
}: EditionCardPickerProps) => {
  const intl = useIntl();
  const { data, error, mutate } = useBookEditions({
    bookId,
    mediaId,
    format,
    title,
    author,
    foreignBookId,
  });

  const hasLibraryVersion = !!data?.editions.some(
    (card) => card.selected || card.owned
  );
  const alongsideAvailable = !!data?.supportsAlongside && hasLibraryVersion;

  // A second version only makes sense when the library holds one already.
  useEffect(() => {
    if (data && value.policy === 'alongside' && !alongsideAvailable) {
      onChange({ ...value, policy: 'only' });
    }
  }, [data, alongsideAvailable, onChange, value]);

  if (error && !data) {
    return (
      <div className="app-card-inset card-layout">
        <p className="card-body-text" role="alert">
          {intl.formatMessage(messages.editionLoadFailed)}
        </p>
        <Button
          type="button"
          buttonType="ghost"
          buttonSize="sm"
          buttonIcon="retry"
          onClick={() => void mutate()}
        >
          {intl.formatMessage(messages.retry)}
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="card-subheading" role="status">
        <LoadingSpinner /> {intl.formatMessage(messages.loading)}
      </p>
    );
  }
  if (data.editions.length < 2) return null;

  const select = (card?: EditionCard) =>
    onChange({
      editionId: card?.id,
      policy: value.policy,
      variantKey: card?.narrators.join(', ') || card?.id,
    });

  return (
    <section className="app-card-inset card-layout">
      <h3 className="card-title">{intl.formatMessage(messages.heading)}</h3>
      <ul
        className="card-list"
        data-list-layout="choices"
        role="radiogroup"
        aria-label={intl.formatMessage(messages.heading)}
      >
        <li>
          <label
            className="app-card-sub card-layout media-choice-card"
            data-choice-selected={!value.editionId}
            aria-label={intl.formatMessage(messages.automatic)}
          >
            <input
              type="radio"
              name="edition-card"
              checked={!value.editionId}
              onChange={() => select(undefined)}
            />
            <div data-card-part="body">
              <p className="card-title">
                {intl.formatMessage(messages.automatic)}
              </p>
              <p className="card-subheading">
                {intl.formatMessage(messages.automaticHelp)}
              </p>
            </div>
          </label>
        </li>
        {data.editions.map((card) => (
          <li key={card.id}>
            <label
              className="app-card-sub card-layout media-choice-card"
              data-choice-selected={value.editionId === card.id}
            >
              <input
                type="radio"
                name="edition-card"
                checked={value.editionId === card.id}
                disabled={card.requestable === false}
                onChange={() => select(card)}
              />
              <CoverImage src={card.imageUrl} alt="" />
              <div data-card-part="body">
                <p className="card-title">{card.title}</p>
                {data.format === 'audiobook' && (
                  <p className="card-body-text">
                    {card.narrators.length
                      ? intl.formatMessage(messages.narrators, {
                          names: card.narrators.join(', '),
                        })
                      : intl.formatMessage(messages.unknownNarrator)}
                  </p>
                )}
                <div className="media-fact-row">
                  {card.production !== 'unknown' && (
                    <Badge badgeType="primary">
                      {intl.formatMessage(
                        card.production === 'full-cast'
                          ? messages.fullCast
                          : messages.soloNarrator
                      )}
                    </Badge>
                  )}
                  {card.abridged !== 'unknown' && (
                    <Badge
                      badgeType={
                        card.abridged === 'abridged' ? 'warning' : 'default'
                      }
                    >
                      {intl.formatMessage(
                        card.abridged === 'abridged'
                          ? messages.abridged
                          : messages.unabridged
                      )}
                    </Badge>
                  )}
                  {card.selected && (
                    <Badge badgeType="success">
                      {intl.formatMessage(messages.inLibrary)}
                    </Badge>
                  )}
                  {card.owned && (
                    <Badge badgeType="success">
                      {intl.formatMessage(messages.owned)}
                    </Badge>
                  )}
                </div>
                <p className="card-subheading">
                  {[
                    card.language,
                    card.durationSeconds
                      ? formatDuration(card.durationSeconds, intl)
                      : undefined,
                    card.publisher,
                    card.releaseDate?.slice(0, 4),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {card.unknownFields.length > 0 && (
                  <p className="card-subheading">
                    {intl.formatMessage(messages.unknown, {
                      fields: card.unknownFields
                        .map((field) =>
                          intl.formatMessage(
                            unknownLabels[
                              field as keyof typeof unknownLabels
                            ] ?? messages.unknownLanguage
                          )
                        )
                        .join(', '),
                    })}
                  </p>
                )}
                {card.narrators.length === 1 && data.format === 'audiobook' && (
                  <FollowButton
                    label={intl.formatMessage(messages.followNarrator, {
                      narrator: card.narrators[0],
                    })}
                    input={{
                      kind: 'narrator',
                      subjectKey: `narrator:${card.narrators[0].toLowerCase()}`,
                      subjectLabel: card.narrators[0],
                    }}
                  />
                )}
              </div>
            </label>
          </li>
        ))}
      </ul>

      {value.editionId && hasLibraryVersion && (
        <fieldset className="choice-group">
          <legend className="card-subheading">
            {intl.formatMessage(messages.policy)}
          </legend>
          {(['only', 'either', 'alongside'] as const).map((policy) => (
            <label
              key={policy}
              className="card-body-text"
              title={
                policy === 'alongside' && !alongsideAvailable
                  ? intl.formatMessage(messages.alongsideUnsupported)
                  : undefined
              }
            >
              <input
                type="radio"
                name="edition-policy"
                disabled={policy === 'alongside' && !alongsideAvailable}
                checked={value.policy === policy}
                onChange={() => onChange({ ...value, policy })}
              />
              <span>
                {intl.formatMessage(messages[policy])}
                <br />
                <span className="card-subheading">
                  {intl.formatMessage(
                    policy === 'only'
                      ? messages.onlyHelp
                      : policy === 'either'
                        ? messages.eitherHelp
                        : messages.alongsideHelp
                  )}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
};

interface SeriesNarratorPlannerProps {
  title: string;
  authorId?: number;
}

interface SeriesNarratorResponse {
  supported: boolean;
  matrix?: {
    books: { bookId: number; title: string; position?: number }[];
  };
  plans: NarratorSeriesPlan[];
}

/** "Collect this series with the same narrator." */
export const SeriesNarratorPlanner = ({
  title,
  authorId,
}: SeriesNarratorPlannerProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { addToast } = useToasts();
  const canCollect = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const collect = async (narrator: string) => {
    try {
      await axios.post('/api/v1/editions/series-narrators/prefer', {
        title,
        authorId,
        narrator,
      });
      addToast(intl.formatMessage(messages.collecting, { narrator }), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch {
      addToast(intl.formatMessage(messages.collectFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };
  const params = new URLSearchParams({ title });
  if (authorId) params.set('authorId', String(authorId));
  const { data, error, mutate } = useSWR<SeriesNarratorResponse>(
    `/api/v1/editions/series-narrators?${params}`
  );
  if (error && !data) {
    return (
      <section className="app-card-main card-layout">
        <h2 className="page-heading">
          {intl.formatMessage(messages.seriesHeading)}
        </h2>
        <p className="card-body-text" role="alert">
          {intl.formatMessage(messages.seriesLoadFailed)}
        </p>
        <Button
          type="button"
          buttonType="ghost"
          buttonSize="sm"
          buttonIcon="retry"
          onClick={() => void mutate()}
        >
          {intl.formatMessage(messages.retry)}
        </Button>
      </section>
    );
  }
  if (!data) return null;
  if (!data.supported || data.plans.length === 0) return null;
  const titles = new Map(
    data.matrix?.books.map((book) => [book.bookId, book.title])
  );

  return (
    <section className="app-card-main card-layout">
      <h2 className="page-heading">
        {intl.formatMessage(messages.seriesHeading)}
      </h2>
      <p className="card-body-text">
        {intl.formatMessage(messages.seriesIntro)}
      </p>
      <ul className="card-list" data-list-layout="choices">
        {data.plans.map((plan) => (
          <li key={plan.narrator}>
            <article className="app-card-sub card-layout">
              <div className="media-fact-row">
                <h3 className="card-title">{plan.narrator}</h3>
                {plan.production === 'full-cast' && (
                  <Badge badgeType="primary">
                    {intl.formatMessage(messages.fullCast)}
                  </Badge>
                )}
                {plan.complete && (
                  <Badge badgeType="success">
                    {intl.formatMessage(messages.complete)}
                  </Badge>
                )}
              </div>
              <p className="card-body-text">
                {intl.formatMessage(messages.covered, {
                  covered: plan.covered.length,
                  total: plan.totalBooks,
                })}
              </p>
              {plan.owned.length > 0 && (
                <p className="card-subheading">
                  {intl.formatMessage(messages.haveOwned, {
                    count: plan.owned.length,
                  })}
                </p>
              )}
              {plan.missing.length > 0 && (
                <>
                  <p className="card-subheading">
                    {intl.formatMessage(messages.missing, {
                      count: plan.missing.length,
                    })}
                    {': '}
                    {plan.missing
                      .map((id) => titles.get(id))
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {plan.otherPerformanceOnly.length > 0 && (
                    <p className="card-subheading">
                      {intl.formatMessage(messages.otherOnly, {
                        count: plan.otherPerformanceOnly.length,
                      })}
                    </p>
                  )}
                  <p className="card-subheading">
                    {intl.formatMessage(messages.waitOrSettle)}
                  </p>
                </>
              )}
              <div className="app-action-row">
                {canCollect && (
                  <Button
                    type="button"
                    buttonType="primary"
                    buttonSize="sm"
                    onClick={() => void collect(plan.narrator)}
                  >
                    {intl.formatMessage(messages.collect, {
                      narrator: plan.narrator,
                    })}
                  </Button>
                )}
                <FollowButton
                  label={intl.formatMessage(messages.followNarrator, {
                    narrator: plan.narrator,
                  })}
                  input={{
                    kind: 'narrator',
                    subjectKey: `narrator:${plan.narrator.toLowerCase()}`,
                    subjectLabel: plan.narrator,
                  }}
                />
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
};

interface MusicVariant {
  releaseId: string;
  title: string;
  disambiguation?: string;
  year?: number;
  formats: string[];
  edition:
    'standard' | 'deluxe' | 'remaster' | 'expanded' | 'anniversary' | 'other';
  trackCount: number;
  extraTracks: string[];
  missingTracks: string[];
  evidence: string[];
  isStandard: boolean;
}

const editionLabels = {
  standard: messages.musicStandard,
  deluxe: messages.musicDeluxe,
  remaster: messages.musicRemaster,
  expanded: messages.musicExpanded,
  anniversary: messages.musicAnniversary,
  other: messages.musicOther,
} as const;

/** Standard vs deluxe vs remaster, with the real track differences. */
export const MusicEditionCompare = ({
  releaseGroupId,
}: {
  releaseGroupId: string;
}) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { addToast } = useToasts();
  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_MUSIC],
    { type: 'or' }
  );
  const requestRelease = async (variant: MusicVariant) => {
    try {
      await axios.post('/api/v1/request', {
        mediaType: 'music',
        mediaId: releaseGroupId,
        variantKey: variant.releaseId,
      });
      addToast(
        intl.formatMessage(messages.releaseRequested, { title: variant.title }),
        {
          appearance: 'success',
          autoDismiss: true,
        }
      );
    } catch {
      addToast(intl.formatMessage(messages.releaseRequestFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };
  const { data } = useSWR<{
    variants: MusicVariant[];
  }>(`/api/v1/collectors/variants/${encodeURIComponent(releaseGroupId)}`, {
    revalidateOnFocus: false,
  });
  if (!data || data.variants.length < 2) return null;

  return (
    <section className="app-card-main card-layout">
      <h2 className="page-heading">
        {intl.formatMessage(messages.musicHeading)}
      </h2>
      <ul className="card-list" data-list-layout="choices">
        {data.variants.map((variant) => (
          <li key={variant.releaseId}>
            <article className="app-card-sub card-layout">
              <div className="media-fact-row">
                <h3 className="card-title">{variant.title}</h3>
                <Badge badgeType={variant.isStandard ? 'default' : 'primary'}>
                  {intl.formatMessage(editionLabels[variant.edition])}
                </Badge>
              </div>
              <p className="card-subheading">
                {[
                  variant.disambiguation,
                  variant.year,
                  variant.formats.join(', '),
                  intl.formatMessage(messages.tracks, {
                    count: variant.trackCount,
                  }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {variant.extraTracks.length > 0 && (
                <p className="card-body-text">
                  {intl.formatMessage(messages.extraTracks, {
                    titles: variant.extraTracks.slice(0, 8).join(' · '),
                  })}
                </p>
              )}
              {variant.missingTracks.length > 0 && (
                <p className="card-body-text">
                  {intl.formatMessage(messages.missingTracks, {
                    titles: variant.missingTracks.slice(0, 8).join(' · '),
                  })}
                </p>
              )}
              {variant.evidence.map((line) => (
                <p key={line} className="card-subheading">
                  {line}
                </p>
              ))}
              {canRequest && (
                <div className="app-action-row">
                  <Button
                    buttonType="primary"
                    buttonSize="sm"
                    onClick={() => void requestRelease(variant)}
                  >
                    {intl.formatMessage(messages.requestRelease)}
                  </Button>
                </div>
              )}
            </article>
          </li>
        ))}
      </ul>
      <p className="card-subheading">
        {intl.formatMessage(messages.mastering)}
      </p>
    </section>
  );
};
