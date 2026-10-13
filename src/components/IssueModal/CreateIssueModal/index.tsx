import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import {
  CompactSelect,
  type CompactSelectOption,
} from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import IssueMediaSummary from '@app/components/IssueDetails/IssueMediaSummary';
import {
  getReportableIssueQualities,
  getReportableIssueSeasons,
} from '@app/components/IssueDetails/issueMediaFormat';
import SeriesEpisodeSelector from '@app/components/IssueModal/CreateIssueModal/SeriesEpisodeSelector';
import {
  getIssueOptionsForMediaType,
  getIssueSubtypeOptionsForMediaType,
} from '@app/components/IssueModal/constants';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { getIssueListHref } from '@app/utils/issueNavigation';
import { PaperAirplaneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { ArrowRightCircleIcon } from '@heroicons/react/24/solid';
import { IssueType, MAX_ISSUE_MESSAGE_LENGTH } from '@server/constants/issue';
import type Issue from '@server/entity/Issue';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import type { BookDetails } from '@server/models/Book';
import type { ComicDetails } from '@server/models/Comic';
import type { MagazineDetails } from '@server/models/Magazine';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { Field, Formik } from 'formik';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.IssueModal.CreateIssueModal', {
  validationMessageRequired: 'You must provide a description',
  validationMessageLength:
    'Description must be {maxLength, number} characters or fewer',
  whatswrong: "What's wrong?",
  providedetail:
    'Please provide a detailed explanation of the issue you encountered.',
  quality: 'Quality',
  issueType: 'Issue Type',
  issueReason: 'Reason',
  hd: 'HD',
  ultraHd: '4K',
  noAvailableQuality: 'No available quality',
  selectepisode: 'Select at least one affected season or episode',
  toastSuccessCreate:
    'Issue report for <strong>{title}</strong> submitted successfully!',
  toastFailedCreate: 'Something went wrong while submitting the issue.',
  toastviewdetails: 'View Details',
  reportissue: 'Report an Issue',
  submitissue: 'Submit Issue',
});

type IssueMediaDetails =
  | MovieDetails
  | TvDetails
  | MusicDetails
  | BookDetails
  | ComicDetails
  | MagazineDetails;

const isMusic = (media: IssueMediaDetails): media is MusicDetails => {
  return (media as MusicDetails).mediaType === 'album';
};

const isBook = (media: IssueMediaDetails): media is BookDetails => {
  return (media as BookDetails).mediaType === 'book';
};

const isComic = (media: IssueMediaDetails): media is ComicDetails => {
  return (media as ComicDetails).mediaType === 'comic';
};

const isMagazine = (media: IssueMediaDetails): media is MagazineDetails => {
  return (media as MagazineDetails).mediaType === 'magazine';
};

const isMovie = (movie: IssueMediaDetails): movie is MovieDetails => {
  if (isMusic(movie) || isBook(movie) || isComic(movie) || isMagazine(movie)) {
    return false;
  }

  return (movie as MovieDetails).title !== undefined;
};

interface CreateIssueModalProps {
  mediaType: 'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';
  tmdbId?: number;
  mediaId?: number;
  title?: string;
  backdrop?: string;
  onCancel?: () => void;
}

const CreateIssueModal = ({
  onCancel,
  mediaType,
  tmdbId,
  mediaId,
  title,
  backdrop,
}: CreateIssueModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const detailUrl =
    mediaType === 'movie' || mediaType === 'tv'
      ? tmdbId
        ? `/api/v1/${mediaType}/${tmdbId}`
        : null
      : mediaType === 'magazine' && title
        ? `/api/v1/magazine/${encodeApiPathSegment(title)}`
        : null;
  const { data, error } = useSWR<IssueMediaDetails>(detailUrl);

  if (!tmdbId && !mediaId) {
    return null;
  }

  const resolvedMediaId = mediaId ?? data?.mediaInfo?.id;
  const resolvedBackdrop =
    backdrop ??
    (data
      ? isMusic(data)
        ? (data.artistBackdrop ?? data.artistThumb ?? data.posterPath)
        : isBook(data) || isComic(data) || isMagazine(data)
          ? data.posterPath
          : data.backdropPath
            ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data.backdropPath}`
            : data.posterPath
              ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data.posterPath}`
              : undefined
      : undefined);
  const resolvedTitle =
    title ??
    (data
      ? isMovie(data) ||
        isMusic(data) ||
        isBook(data) ||
        isComic(data) ||
        isMagazine(data)
        ? data.title
        : data.name
      : undefined);
  const issueOptions = getIssueOptionsForMediaType(mediaType);
  const issueSubtypeOptions = getIssueSubtypeOptionsForMediaType(mediaType);
  const orderedIssueOptions = [
    IssueType.OTHER,
    IssueType.AUDIO,
    IssueType.VIDEO,
    IssueType.SUBTITLES,
  ].flatMap((issueType) =>
    issueOptions.filter((option) => option.issueType === issueType)
  );
  const defaultIssueType = IssueType.OTHER;
  const issueTypeOptions: CompactSelectOption[] = orderedIssueOptions.map(
    (option) => ({
      value: option.issueType.toString(),
      label: intl.formatMessage(option.name),
    })
  );
  const issueSubtypeSelectOptions: CompactSelectOption[] =
    issueSubtypeOptions.map((option) => ({
      value: option.value,
      label: intl.formatMessage(option.name),
    }));
  const reportableQualities = getReportableIssueQualities(data?.mediaInfo);
  const hasReportableVideoQuality = reportableQualities.length > 0;
  const initialIs4k = reportableQualities[0] === '4k';
  const qualityOptions = (['hd', '4k'] as const).map((quality) => ({
    value: quality,
    disabled: !reportableQualities.includes(quality),
    label: intl.formatMessage(
      quality === '4k' ? messages.ultraHd : messages.hd
    ),
  }));
  const getReportableSeasons = (is4k: boolean) =>
    getReportableIssueSeasons(data?.mediaInfo?.seasons, is4k);
  const initialReportableSeasons = getReportableSeasons(initialIs4k);

  const CreateIssueModalSchema = Yup.object().shape({
    issueType: Yup.number()
      .oneOf(orderedIssueOptions.map((option) => option.issueType))
      .required(),
    issueSubtype: issueSubtypeOptions.length
      ? Yup.string()
          .oneOf(issueSubtypeOptions.map((option) => option.value))
          .required()
      : Yup.string().notRequired(),
    message: Yup.string()
      .max(
        MAX_ISSUE_MESSAGE_LENGTH,
        intl.formatMessage(messages.validationMessageLength, {
          maxLength: MAX_ISSUE_MESSAGE_LENGTH,
        })
      )
      .required(intl.formatMessage(messages.validationMessageRequired)),
    problemEpisodeSelections:
      mediaType === 'tv'
        ? Yup.array()
            .of(
              Yup.object({
                seasonNumber: Yup.number().integer().min(0).required(),
                episodeNumbers: Yup.array().of(Yup.number().integer().min(1)),
              })
            )
            .min(1, intl.formatMessage(messages.selectepisode))
        : Yup.array(),
  });

  return (
    <Formik
      enableReinitialize
      initialValues={{
        issueType: defaultIssueType,
        issueSubtype: issueSubtypeOptions.length ? 'other' : '',
        message: '',
        is4k: initialIs4k,
        activeSeason: initialReportableSeasons[0] ?? -1,
        problemEpisodeSelections: [] as SeasonEpisodeSelection[],
      }}
      validationSchema={CreateIssueModalSchema}
      onSubmit={async (values) => {
        try {
          const newIssue = await axios.post<Issue>('/api/v1/issue', {
            issueType: values.issueType,
            ...(issueSubtypeOptions.length
              ? { issueSubtype: values.issueSubtype }
              : {}),
            message: values.message,
            mediaId: resolvedMediaId,
            is4k: values.is4k,
            problemSeason:
              values.problemEpisodeSelections[0]?.seasonNumber ?? 0,
            problemEpisode:
              values.problemEpisodeSelections[0]?.episodeNumbers?.[0] ?? 0,
            problemEpisodes:
              values.problemEpisodeSelections[0]?.episodeNumbers ?? [],
            problemEpisodeSelections: values.problemEpisodeSelections,
          });

          if (resolvedTitle) {
            addToast(
              <>
                <div>
                  {intl.formatMessage(messages.toastSuccessCreate, {
                    title: resolvedTitle,
                    strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
                  })}
                </div>
                <Link href={getIssueListHref(newIssue.data.id)} legacyBehavior>
                  <Button as="a" className="mt-4">
                    <span>{intl.formatMessage(messages.toastviewdetails)}</span>
                    <ArrowRightCircleIcon />
                  </Button>
                </Link>
              </>,
              {
                appearance: 'success',
                autoDismiss: true,
              }
            );

            mutate('/api/v1/issue/count');
          }

          if (onCancel) {
            onCancel();
          }
        } catch {
          addToast(intl.formatMessage(messages.toastFailedCreate), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      }}
    >
      {({
        handleSubmit,
        values,
        setFieldValue,
        errors,
        touched,
        isSubmitting,
      }) => {
        const issueTypeSelect = (
          <CompactSelect
            className="compact-select-warning"
            label={intl.formatMessage(messages.issueType)}
            value={values.issueType.toString()}
            options={issueTypeOptions}
            onChange={(issueType) =>
              void setFieldValue('issueType', Number(issueType) as IssueType)
            }
            defaultValue={defaultIssueType.toString()}
          />
        );
        const issueSubtypeSelect = issueSubtypeOptions.length ? (
          <CompactSelect
            label={intl.formatMessage(messages.issueReason)}
            value={values.issueSubtype}
            options={issueSubtypeSelectOptions}
            onChange={(issueSubtype) =>
              void setFieldValue('issueSubtype', issueSubtype)
            }
            defaultValue="other"
          />
        ) : null;

        return (
          <Modal
            backgroundClickable
            onCancel={onCancel}
            title={intl.formatMessage(messages.reportissue)}
            hideActions
            loading={!!detailUrl && !data && !error}
            backdrop={resolvedBackdrop}
            backdropFull
            dialogClass="artwork-form-main-card app-card-main refreshed-card-surface refreshed-detail-text"
          >
            {data && (
              <IssueMediaSummary
                data={data}
                mediaType={mediaType}
                is4k={values.is4k}
                artwork={backdrop}
                embedded
                rightDetails={[
                  { label: 'Status', value: 'Ready to Report' },
                  ...(mediaType === 'movie' || mediaType === 'tv'
                    ? [
                        {
                          label: 'Quality',
                          value: hasReportableVideoQuality
                            ? values.is4k
                              ? intl.formatMessage(messages.ultraHd)
                              : intl.formatMessage(messages.hd)
                            : intl.formatMessage(messages.noAvailableQuality),
                        },
                      ]
                    : []),
                ]}
                footer={
                  <>
                    {(mediaType === 'movie' || mediaType === 'tv') && (
                      <MediaQualitySelect
                        purpose="issue"
                        label={intl.formatMessage(messages.quality)}
                        value={values.is4k ? '4k' : 'hd'}
                        options={qualityOptions}
                        onChange={(quality) => {
                          const nextIs4k = quality === '4k';
                          if (nextIs4k === values.is4k) return;
                          const seasons = getReportableSeasons(nextIs4k);
                          void setFieldValue('is4k', nextIs4k);
                          void setFieldValue('activeSeason', seasons[0] ?? -1);
                          void setFieldValue('problemEpisodeSelections', []);
                        }}
                      />
                    )}
                    {issueTypeSelect}
                    {issueSubtypeSelect}
                  </>
                }
              />
            )}

            {!data && issueTypeSelect}
            {!data && issueSubtypeSelect}

            {mediaType === 'tv' &&
              data &&
              !isMovie(data) &&
              !isMusic(data) &&
              !isBook(data) &&
              !isComic(data) &&
              !isMagazine(data) && (
                <>
                  <SeriesEpisodeSelector
                    tvId={data.id}
                    seasons={data.seasons.filter((season) =>
                      getReportableSeasons(values.is4k).includes(
                        season.seasonNumber
                      )
                    )}
                    activeSeason={values.activeSeason}
                    selections={values.problemEpisodeSelections}
                    onActiveSeasonChange={(seasonNumber) =>
                      void setFieldValue('activeSeason', seasonNumber)
                    }
                    onSelectionsChange={(selections) =>
                      void setFieldValue('problemEpisodeSelections', selections)
                    }
                  />
                  {touched.problemEpisodeSelections &&
                    errors.problemEpisodeSelections && (
                      <div className="mt-1 text-xs text-red-300">
                        {String(errors.problemEpisodeSelections)}
                      </div>
                    )}
                </>
              )}

            <div className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="message"
                  className="text-xs font-semibold text-gray-100"
                >
                  {intl.formatMessage(messages.whatswrong)}
                  <span className="label-required">*</span>
                </label>
                <Field
                  as="textarea"
                  rows={3}
                  name="message"
                  id="message"
                  className="max-h-32 w-full resize-none overflow-y-auto rounded-md border-gray-600 bg-gray-900/60 text-sm text-gray-100 placeholder:text-gray-500"
                  placeholder={intl.formatMessage(messages.providedetail)}
                />
                {errors.message &&
                  touched.message &&
                  typeof errors.message === 'string' && (
                    <div className="error">{errors.message}</div>
                  )}
              </div>
            </div>

            <div className="mt-[5px] flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                onClick={onCancel}
                data-testid="modal-cancel-button"
                buttonType="danger"
                buttonSize="standard"
              >
                <span className="inline-flex items-center gap-1.5 [&_svg]:!m-0">
                  <XMarkIcon aria-hidden="true" />
                  <span>{intl.formatMessage(globalMessages.cancel)}</span>
                </span>
              </Button>
              <Button
                type="button"
                onClick={() => handleSubmit()}
                data-testid="modal-ok-button"
                buttonType="success"
                buttonSize="standard"
                disabled={
                  isSubmitting ||
                  ((mediaType === 'movie' || mediaType === 'tv') &&
                    !hasReportableVideoQuality)
                }
              >
                <span className="inline-flex items-center gap-1.5 [&_svg]:!m-0">
                  <PaperAirplaneIcon aria-hidden="true" />
                  <span>{intl.formatMessage(messages.submitissue)}</span>
                </span>
              </Button>
            </div>
          </Modal>
        );
      }}
    </Formik>
  );
};

export default CreateIssueModal;
