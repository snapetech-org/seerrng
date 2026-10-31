import ListenBrainzAPI from '@server/api/listenbrainz/index';
import OpenLibraryAPI from '@server/api/openlibrary/index';
import TheMovieDb from '@server/api/themoviedb/index';
import { IssueStatus, IssueType, IssueTypeName } from '@server/constants/issue';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Issue from '@server/entity/Issue';
import IssueComment from '@server/entity/IssueComment';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { MediaRequest } from '@server/entity/MediaRequest';
import { MediaSearchMetadata } from '@server/entity/MediaSearchMetadata';
import { User } from '@server/entity/User';
import {
  normalizeMusicBrainzId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import { Permission } from '@server/lib/permissions';
import { normalizeStashDbId } from '@server/lib/stashdbIdentity';
import { parseBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { sortBy, truncate } from 'lodash';
import { Notification } from '.';
import type {
  NotificationEventDescriptor,
  NotificationExtraLabel,
  NotificationPayload,
} from './agents/agent';
import type { NotificationOutboxIntent } from './outbox';

const getMediaDetails = async (
  media: Media
): Promise<{ title: string; image: string }> => {
  if (media.mediaType === MediaType.MOVIE) {
    const movie = await new TheMovieDb().getMovie({ movieId: media.tmdbId });
    return {
      title: `${movie.title}${
        movie.release_date ? ` (${movie.release_date.slice(0, 4)})` : ''
      }`,
      image: movie.poster_path
        ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${movie.poster_path}`
        : '',
    };
  }
  if (media.mediaType === MediaType.TV) {
    const tv = await new TheMovieDb().getTvShow({ tvId: media.tmdbId });
    return {
      title: `${tv.name}${
        tv.first_air_date ? ` (${tv.first_air_date.slice(0, 4)})` : ''
      }`,
      image: tv.poster_path
        ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${tv.poster_path}`
        : '',
    };
  }
  if (media.mediaType === MediaType.MUSIC && media.mbId) {
    const album = await new ListenBrainzAPI().getAlbum(
      normalizeMusicBrainzId(media.mbId)
    );
    const releaseGroup = album.release_group_metadata.release_group;
    return {
      title: `${releaseGroup.name}${
        releaseGroup.date ? ` (${releaseGroup.date.slice(0, 4)})` : ''
      }`,
      image: album.caa_release_mbid
        ? `https://coverartarchive.org/release/${album.caa_release_mbid}/front-500`
        : '',
    };
  }
  if (media.mediaType === MediaType.BOOK) {
    const identifiers =
      media.identifiers ??
      (await getRepository(MediaIdentifier).find({
        where: { media: { id: media.id } },
      }));
    const openLibraryId = identifiers.find(
      ({ provider }) => provider === MediaIdentifierProvider.OPENLIBRARY
    )?.value;
    if (openLibraryId) {
      const work = await new OpenLibraryAPI().getWork(
        normalizeOpenLibraryWorkId(openLibraryId)
      );
      const releaseYear = work.first_publish_date?.match(/\d{4}/)?.[0];
      const coverId = work.covers?.[0];
      return {
        title: `${work.title}${releaseYear ? ` (${releaseYear})` : ''}`,
        image: coverId
          ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
          : '',
      };
    }
  }
  if (
    media.mediaType === MediaType.COMIC ||
    media.mediaType === MediaType.MAGAZINE
  ) {
    const identifiers =
      media.identifiers ??
      (await getRepository(MediaIdentifier).find({
        where: { media: { id: media.id } },
      }));
    const provider =
      media.mediaType === MediaType.COMIC
        ? MediaIdentifierProvider.COMICVINE
        : MediaIdentifierProvider.LAZYLIBRARIAN;
    const identifier = identifiers.find(
      (candidate) => candidate.provider === provider
    )?.value;
    return {
      title:
        media.externalServiceSlug ??
        identifier ??
        media.mbId ??
        String(media.tmdbId),
      image: '',
    };
  }
  return { title: media.mbId ?? String(media.tmdbId), image: '' };
};

export const buildMediaRequestNotificationPayload = async (
  entity: MediaRequest,
  media: Media,
  type: Notification
): Promise<NotificationPayload> => {
  const mediaType =
    entity.type === MediaType.MOVIE
      ? 'Movie'
      : entity.type === MediaType.TV
        ? 'Series'
        : entity.type === MediaType.MUSIC
          ? 'Music'
          : entity.type === MediaType.COMIC
            ? 'Comic'
            : entity.type === MediaType.MAGAZINE
              ? 'Magazine'
              : entity.type === MediaType.ADULT
                ? 'Adult Scene'
                : 'Book';
  let event: string | undefined;
  let notifyAdmin = true;
  let notifySystem = true;
  switch (type) {
    case Notification.MEDIA_AVAILABLE:
      event = `${entity.is4k ? '4K ' : ''}${mediaType} Now Available`;
      notifyAdmin = false;
      break;
    case Notification.MEDIA_APPROVED:
      event = `${entity.is4k ? '4K ' : ''}${mediaType} Request Approved`;
      notifyAdmin = false;
      break;
    case Notification.MEDIA_DECLINED:
      event = `${entity.is4k ? '4K ' : ''}${mediaType} Request Declined`;
      notifyAdmin = false;
      break;
    case Notification.MEDIA_PENDING:
      event = `New ${entity.is4k ? '4K ' : ''}${mediaType} Request`;
      break;
    case Notification.MEDIA_AUTO_REQUESTED:
      event = `${entity.is4k ? '4K ' : ''}${mediaType} Request Automatically Submitted`;
      notifyAdmin = false;
      notifySystem = false;
      break;
    case Notification.MEDIA_AUTO_APPROVED:
      event = `${entity.is4k ? '4K ' : ''}${mediaType} Request Automatically Approved`;
      break;
    case Notification.MEDIA_FAILED:
      event = `${entity.is4k ? '4K ' : ''}${mediaType} Request Failed`;
      break;
  }
  const eventKinds: Partial<
    Record<Notification, NotificationEventDescriptor['kind']>
  > = {
    [Notification.MEDIA_AVAILABLE]: 'available',
    [Notification.MEDIA_APPROVED]: 'approved',
    [Notification.MEDIA_DECLINED]: 'declined',
    [Notification.MEDIA_PENDING]: 'pending',
    [Notification.MEDIA_AUTO_REQUESTED]: 'autoRequested',
    [Notification.MEDIA_AUTO_APPROVED]: 'autoApproved',
    [Notification.MEDIA_FAILED]: 'failed',
  };
  const eventKind = eventKinds[type];
  const base = {
    media,
    request: entity,
    notifyAdmin,
    notifySystem,
    notifyUser: notifyAdmin ? undefined : entity.requestedBy,
    event,
    eventMessage: eventKind
      ? { kind: eventKind, mediaType: entity.type, is4k: entity.is4k }
      : undefined,
  };
  const notificationMediaUrl = (mediaUrl: string): string =>
    type === Notification.MEDIA_AVAILABLE &&
    Number.isSafeInteger(entity.id) &&
    entity.id > 0
      ? `/requests/status?requestId=${entity.id}`
      : mediaUrl;
  if (entity.type === MediaType.MOVIE) {
    const movie = await new TheMovieDb().getMovie({ movieId: media.tmdbId });
    return {
      ...base,
      mediaUrl: notificationMediaUrl(`/movie/${media.tmdbId}`),
      subject: `${movie.title}${
        movie.release_date ? ` (${movie.release_date.slice(0, 4)})` : ''
      }`,
      message: truncate(movie.overview, {
        length: 500,
        separator: /\s/,
        omission: '…',
      }),
      image: `https://image.tmdb.org/t/p/w600_and_h900_bestv2${movie.poster_path}`,
    };
  }
  if (entity.type === MediaType.TV) {
    const tv = await new TheMovieDb().getTvShow({ tvId: media.tmdbId });
    return {
      ...base,
      mediaUrl: notificationMediaUrl(`/tv/${media.tmdbId}`),
      subject: `${tv.name}${
        tv.first_air_date ? ` (${tv.first_air_date.slice(0, 4)})` : ''
      }`,
      message: truncate(tv.overview, {
        length: 500,
        separator: /\s/,
        omission: '…',
      }),
      image: `https://image.tmdb.org/t/p/w600_and_h900_bestv2${tv.poster_path}`,
      extra: [
        {
          name: 'Requested Seasons',
          label: 'requestedSeasons',
          value: entity.seasons
            .map(({ seasonNumber }) => seasonNumber)
            .join(', '),
        },
      ],
    };
  }
  if (entity.type === MediaType.MUSIC && media.mbId) {
    const mbId = normalizeMusicBrainzId(media.mbId);
    const album = await new ListenBrainzAPI().getAlbum(mbId);
    const releaseGroup = album.release_group_metadata.release_group;
    const artist = album.release_group_metadata.artist;
    const releaseYear = releaseGroup.date?.slice(0, 4);
    return {
      ...base,
      mediaUrl: notificationMediaUrl(`/music/${mbId}`),
      subject: `${releaseGroup.name}${releaseYear ? ` (${releaseYear})` : ''}`,
      message: artist.name,
      image: album.caa_release_mbid
        ? `https://coverartarchive.org/release/${album.caa_release_mbid}/front-500`
        : undefined,
      extra: [{ name: 'Artist', label: 'artist', value: artist.name }],
    };
  }
  if (entity.type === MediaType.BOOK) {
    const mediaWithIdentifiers =
      media.identifiers !== undefined
        ? media
        : await getRepository(Media).findOne({
            where: { id: media.id },
            relations: { identifiers: true },
          });
    const openLibraryId = mediaWithIdentifiers?.identifiers?.find(
      ({ provider }) => provider === MediaIdentifierProvider.OPENLIBRARY
    )?.value;
    if (!openLibraryId) {
      const bookshelfId = mediaWithIdentifiers?.identifiers?.find(
        ({ provider }) => provider === MediaIdentifierProvider.BOOKSHELF
      )?.value;
      const metadata =
        mediaWithIdentifiers?.searchMetadata ??
        (await getRepository(MediaSearchMetadata).findOne({
          where: { mediaId: media.id },
        }));
      const bookshelfBook = bookshelfId
        ? parseBookshelfBookId(bookshelfId)
        : undefined;
      const title = metadata?.title?.trim() || bookshelfBook?.foreignBookId;
      const author = metadata?.author?.trim();

      if (!bookshelfId || !bookshelfBook) {
        throw new Error('Book request has no supported metadata identifier.');
      }

      return {
        ...base,
        mediaUrl: notificationMediaUrl(
          `/book/${encodeURIComponent(bookshelfId)}`
        ),
        subject: title || 'Book request',
        subjectMessage: title ? undefined : 'bookRequest',
        message: author || metadata?.publisher || undefined,
        image: undefined,
        extra: metadata?.publisher
          ? [
              {
                name: 'Publisher',
                label: 'publisher',
                value: metadata.publisher,
              },
            ]
          : undefined,
      };
    }
    const normalizedId = normalizeOpenLibraryWorkId(openLibraryId);
    const openLibrary = new OpenLibraryAPI();
    const [work, editions] = await Promise.all([
      openLibrary.getWork(normalizedId),
      openLibrary.getWorkEditions(normalizedId).catch(() => ({
        size: 0,
        entries: [],
      })),
    ]);
    const description =
      typeof work.description === 'string'
        ? work.description
        : work.description?.value;
    const releaseYear = work.first_publish_date?.match(/\d{4}/)?.[0];
    const coverId = work.covers?.[0];
    const isbn =
      editions.entries.find(({ isbn_13 }) => isbn_13?.[0])?.isbn_13?.[0] ??
      editions.entries.find(({ isbn_10 }) => isbn_10?.[0])?.isbn_10?.[0];
    return {
      ...base,
      mediaUrl: notificationMediaUrl(`/book/${normalizedId}`),
      subject: `${work.title}${releaseYear ? ` (${releaseYear})` : ''}`,
      message: description
        ? truncate(description, {
            length: 500,
            separator: /\s/,
            omission: '…',
          })
        : undefined,
      image: coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : undefined,
      extra: isbn ? [{ name: 'ISBN', value: isbn }] : undefined,
    };
  }
  if (entity.type === MediaType.COMIC || entity.type === MediaType.MAGAZINE) {
    const { title, image } = await getMediaDetails(media);
    const mediaUrl =
      entity.type === MediaType.COMIC
        ? media.identifiers?.find(
            (identifier) =>
              identifier.provider === MediaIdentifierProvider.COMICVINE
          )?.value
        : (media.externalServiceSlug ??
          media.identifiers?.find(
            (identifier) =>
              identifier.provider === MediaIdentifierProvider.LAZYLIBRARIAN
          )?.value);
    return {
      ...base,
      mediaUrl:
        notificationMediaUrl(
          mediaUrl ? `/${entity.type}/${encodeURIComponent(mediaUrl)}` : ''
        ) || undefined,
      subject: title,
      message: `${mediaType} request details are available in SeerrNG.`,
      bodyMessage:
        entity.type === MediaType.COMIC
          ? 'comicRequestDetails'
          : 'magazineRequestDetails',
      image,
    };
  }
  if (entity.type === MediaType.ADULT) {
    const stashDbId = normalizeStashDbId(
      media.identifiers?.find(
        (identifier) => identifier.provider === MediaIdentifierProvider.STASHDB
      )?.value
    );
    return {
      ...base,
      mediaUrl: stashDbId
        ? notificationMediaUrl(`/adult/${encodeURIComponent(stashDbId)}`)
        : undefined,
      subject: media.externalServiceSlug ?? stashDbId ?? 'Adult scene request',
      subjectMessage:
        media.externalServiceSlug == null && stashDbId == null
          ? 'adultSceneRequest'
          : undefined,
      message: `${mediaType} request details are available in SeerrNG.`,
      bodyMessage: 'adultRequestDetails',
      image: undefined,
    };
  }
  throw new Error(`Unsupported media notification request ${entity.id}.`);
};

const hydrateMediaRequestIntent = async (
  type: Notification,
  requestId: number
): Promise<NotificationPayload | undefined> => {
  const request = await getRepository(MediaRequest).findOne({
    where: { id: requestId },
    relations: { media: { identifiers: true, searchMetadata: true } },
  });
  // The request was deleted after its durable notification was queued. There
  // is no current payload to send, so the outbox should retire this stale row.
  if (!request) return undefined;
  return buildMediaRequestNotificationPayload(request, request.media, type);
};

const hydrateMediaAvailabilitySubscriptionIntent = async (
  type: Notification,
  mediaId: number,
  userId: number
): Promise<NotificationPayload | undefined> => {
  if (type !== Notification.MEDIA_AVAILABLE) {
    return undefined;
  }

  const [media, user] = await Promise.all([
    getRepository(Media).findOne({
      where: { id: mediaId },
      relations: { identifiers: true, searchMetadata: true },
    }),
    getRepository(User).findOne({
      where: { id: userId },
      relations: { settings: true },
    }),
  ]);
  if (
    !media ||
    !user ||
    ![MediaType.MOVIE, MediaType.TV].includes(media.mediaType)
  ) {
    return undefined;
  }

  const { title, image } = await getMediaDetails(media);
  const mediaType = media.mediaType === MediaType.MOVIE ? 'Movie' : 'Series';

  return {
    event: `${mediaType} Now Available`,
    eventMessage: {
      kind: 'available',
      mediaType: media.mediaType,
      is4k: false,
    },
    subject: title,
    notifySystem: false,
    notifyAdmin: false,
    notifyUser: user,
    media,
    mediaUrl: `/${media.mediaType}/${media.tmdbId}`,
    image,
    availabilitySubscription: true,
  };
};

const hydrateIssueIntent = async (
  type: Notification,
  issueId: number,
  modifiedById?: number
): Promise<NotificationPayload | undefined> => {
  const issue = await getRepository(Issue).findOneBy({ id: issueId });
  // A deleted issue cannot produce a useful notification payload.
  if (!issue) return undefined;
  if (modifiedById !== undefined) {
    const modifiedBy = await getRepository(User).findOneBy({
      id: modifiedById,
    });
    // The actor is optional. Keep the issue event deliverable when the actor
    // account has since been removed, while omitting that stale reference.
    issue.modifiedBy = modifiedBy ?? undefined;
  }
  issue.status =
    type === Notification.ISSUE_RESOLVED
      ? IssueStatus.RESOLVED
      : IssueStatus.OPEN;
  const { title, image } = await getMediaDetails(issue.media);
  const [firstComment] = sortBy(issue.comments, 'id');
  if (!firstComment) {
    throw new Error(`Notification issue ${issue.id} has no comments.`);
  }
  const extra: {
    name: string;
    value: string;
    label?: NotificationExtraLabel;
  }[] = [];
  if (issue.media.mediaType === MediaType.TV && issue.problemSeason > 0) {
    extra.push({
      name: 'Affected Season',
      label: 'affectedSeason',
      value: String(issue.problemSeason),
    });
    if (issue.problemEpisode > 0) {
      extra.push({
        name: 'Affected Episode',
        label: 'affectedEpisode',
        value: String(issue.problemEpisode),
      });
    }
  }
  const action =
    type === Notification.ISSUE_CREATED
      ? 'Reported'
      : type === Notification.ISSUE_RESOLVED
        ? 'Resolved'
        : 'Reopened';
  return {
    event: `${type === Notification.ISSUE_CREATED ? 'New ' : ''}${
      issue.issueType !== IssueType.OTHER
        ? `${IssueTypeName[issue.issueType]} `
        : ''
    }Issue ${action}`,
    issueEventMessage: {
      kind:
        type === Notification.ISSUE_CREATED
          ? 'created'
          : type === Notification.ISSUE_RESOLVED
            ? 'resolved'
            : 'reopened',
      issueType:
        issue.issueType === IssueType.VIDEO
          ? 'video'
          : issue.issueType === IssueType.AUDIO
            ? 'audio'
            : issue.issueType === IssueType.SUBTITLES
              ? 'subtitles'
              : 'other',
    },
    subject: title,
    message: firstComment.message,
    issue,
    media: issue.media,
    image,
    extra,
    notifyAdmin: true,
    notifySystem: true,
    notifyUser:
      !issue.createdBy.hasPermission(Permission.MANAGE_ISSUES) &&
      issue.modifiedBy?.id !== issue.createdBy.id &&
      (type === Notification.ISSUE_RESOLVED ||
        type === Notification.ISSUE_REOPENED)
        ? issue.createdBy
        : undefined,
  };
};

const hydrateIssueCommentIntent = async (
  commentId: number
): Promise<NotificationPayload | undefined> => {
  const comment = await getRepository(IssueComment).findOne({
    where: { id: commentId },
    relations: { issue: true },
  });
  // Deleted comments and orphaned issue references cannot be hydrated.
  if (!comment) return undefined;
  if (!comment.issue) return undefined;
  const issue = await getRepository(Issue).findOneBy({
    id: comment.issue.id,
  });
  if (!issue) return undefined;
  const [firstComment] = sortBy(issue.comments, 'id');
  if (!firstComment || comment.id === firstComment.id) {
    return undefined;
  }
  const { title, image } = await getMediaDetails(issue.media);
  return {
    event: `New Comment on ${
      issue.issueType !== IssueType.OTHER
        ? `${IssueTypeName[issue.issueType]} `
        : ''
    }Issue`,
    issueEventMessage: {
      kind: 'comment',
      issueType:
        issue.issueType === IssueType.VIDEO
          ? 'video'
          : issue.issueType === IssueType.AUDIO
            ? 'audio'
            : issue.issueType === IssueType.SUBTITLES
              ? 'subtitles'
              : 'other',
    },
    subject: title,
    message: firstComment.message,
    comment,
    issue,
    media: issue.media,
    image,
    notifyAdmin: true,
    notifySystem: true,
    notifyUser:
      !issue.createdBy.hasPermission(Permission.MANAGE_ISSUES) &&
      issue.createdBy.id !== comment.user.id
        ? issue.createdBy
        : undefined,
  };
};

export const hydrateNotificationIntent = (
  type: Notification,
  intent: NotificationOutboxIntent
): Promise<NotificationPayload | undefined> => {
  switch (intent.kind) {
    case 'media-request':
      return hydrateMediaRequestIntent(type, intent.requestId);
    case 'media-availability-subscription':
      return hydrateMediaAvailabilitySubscriptionIntent(
        type,
        intent.mediaId,
        intent.userId
      );
    case 'issue':
      return hydrateIssueIntent(type, intent.issueId, intent.modifiedById);
    case 'issue-comment':
      return hydrateIssueCommentIntent(intent.commentId);
  }
};
