// Adapted from selmant/foreseerr, copyright (c) 2026 Selman Trabzon. MIT licensed.
// See NOTICE.md for attribution and license terms.
export const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
export const ANILIST_OAUTH_AUTHORIZE_URL =
  'https://anilist.co/api/v2/oauth/authorize';
export const ANILIST_OAUTH_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';
export const ANILIST_OAUTH_PIN_REDIRECT = 'https://anilist.co/api/v2/oauth/pin';

export type AnilistMediaFormat =
  'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC' | string;

export type AnilistMediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export type AnilistMediaListStatus =
  'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

export type AnilistMediaSort =
  'TRENDING_DESC' | 'POPULARITY_DESC' | 'SCORE_DESC';

export interface AnilistTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

export interface AnilistMedia {
  isAdult?: boolean;
  genres?: string[];
  tags?: { name: string }[];
  id: number;
  idMal?: number | null;
  title?: AnilistTitle | null;
  format?: AnilistMediaFormat | null;
  episodes?: number | null;
  seasonYear?: number | null;
  startDate?: { year?: number | null } | null;
  coverImage?: {
    large?: string | null;
    medium?: string | null;
  } | null;
}

export type AnilistRelationType =
  | 'ADAPTATION'
  | 'SOURCE'
  | 'PREQUEL'
  | 'SEQUEL'
  | 'PARENT'
  | 'SIDE_STORY'
  | 'SPIN_OFF'
  | 'ALTERNATIVE'
  | 'SUMMARY'
  | 'CHARACTER'
  | 'CONTAINS'
  | 'COMPILATION'
  | 'OTHER';

export interface AnilistRelationNode extends AnilistMedia {
  type?: 'ANIME' | 'MANGA' | null;
}

export interface AnilistRelationEdge {
  relationType: AnilistRelationType;
  node: AnilistRelationNode;
}

export interface AnilistMediaWithRelations extends AnilistMedia {
  type?: 'ANIME' | 'MANGA' | null;
  relations?: { edges?: AnilistRelationEdge[] | null } | null;
}

export interface AnilistPageInfo {
  currentPage?: number;
  hasNextPage?: boolean;
  lastPage?: number;
  perPage?: number;
  total?: number;
}

export interface AnilistMediaPage {
  pageInfo: AnilistPageInfo;
  media: AnilistMedia[];
}

export interface AnilistMediaListEntry {
  id: number;
  status?: AnilistMediaListStatus | null;
  progress?: number | null;
  score?: number | null;
  scoreRaw?: number | null;
  media?: AnilistMedia | null;
}

export interface AnilistMediaListGroup {
  name: string;
  isCustomList?: boolean | null;
  status?: AnilistMediaListStatus | null;
  entries?: AnilistMediaListEntry[] | null;
}

export interface AnilistMediaListCollection {
  lists: AnilistMediaListGroup[];
}

export interface AnilistViewer {
  id: number;
  name: string;
}

export interface AnilistTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface AnilistTokenState {
  accessToken: string;
  expiresAt: number;
}

export interface AnilistDiscoverItem {
  anilistId: number;
  tmdbId?: number;
  mediaType: 'movie' | 'tv';
  title: string;
  image?: string;
}

export interface AnilistListSummary {
  name: string;
  status: AnilistMediaListStatus | null;
  isCustomList: boolean;
  itemCount: number;
}
