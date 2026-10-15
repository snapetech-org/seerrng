import type {
  AlbumResult,
  ArtistResult,
  BookResult,
  MovieResult,
  PersonResult,
  TvResult,
} from '@server/models/Search';

export type AssociationMediaType = 'movie' | 'tv' | 'album' | 'artist' | 'book';

export type AssociationEdgeType =
  'similar' | 'recommended' | 'shared-person' | 'shared-genre';

export type AssociationReasonKey =
  | 'sharesGenre'
  | 'similarToneAudience'
  | 'oftenRecommended'
  | 'nearbyListenerOverlap'
  | 'similarArtist'
  | 'alsoByAuthor'
  | 'sameAuthor'
  | 'personScoredThis'
  | 'personWorkedOnSound'
  | 'personAppearsInThis'
  | 'personWorkedOnThis'
  | 'personConnectedToThis'
  | 'personAlsoMakesMusic';

export type AssociationNode =
  | MovieResult
  | TvResult
  | AlbumResult
  | ArtistResult
  | BookResult
  | PersonResult;

export interface AssociationEdge {
  /** Normalized 0..1 relevance, used for ordering and graph styling. */
  weight: number;
  type: AssociationEdgeType;
  /** Human-readable explanation, e.g. "Trent Reznor scored both". */
  reason: string;
  /** Stable translation key for app-generated reason text. */
  reasonKey?: AssociationReasonKey;
  /** Interpolation values for the translation key. */
  reasonValues?: Record<string, string>;
  node: AssociationNode;
}

export interface AssociationGraph {
  root: {
    mediaType: AssociationMediaType;
    id: string;
    title: string;
  };
  edges: AssociationEdge[];
}

export interface AssociationOptions {
  /** Include low-confidence shared-genre/tag edges. */
  includeWeak?: boolean;
  /** Hard cap on returned edges. */
  limit?: number;
}

export const ASSOCIATION_LIMITS = {
  MAX_SAME_MEDIUM: 60,
  MAX_CAST: 8,
  MAX_CREW_SOUND: 4,
  MAX_CROSS_EDGES: 12,
  MAX_WEAK_EDGES: 8,
  DEFAULT_TOTAL: 40,
} as const;
