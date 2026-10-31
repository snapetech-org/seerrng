import type { WatchSessionFilters } from '@server/entity/WatchSession';

export type { WatchSessionFilters };

export interface WatchSessionSummary {
  id: number;
  title: string;
  status: 'draft' | 'active';
  ownerId: number;
  memberCount: number;
  expiresAt: string;
  createdAt: string;
}

export interface WatchSessionDetail extends WatchSessionSummary {
  filters: WatchSessionFilters;
  ownerName: string;
  startedAt: string | null;
  ownPreferences: {
    includeWatchlistContributions: boolean;
  };
  members: {
    id: number;
    displayName: string;
    avatar: string | null;
    isOwner: boolean;
  }[];
}

export interface SessionMovie {
  candidateId: number;
  id: number;
  title: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  overview?: string;
  voteAverage: number;
  genres: { id: number; name: string }[];
}

export interface SessionMovieBallot extends SessionMovie {
  decision: 'want' | 'pass';
}

export interface WatchSessionInvite {
  id: number;
  createdAt: string;
  expiresAt: string;
  status: 'open' | 'claimed' | 'expired' | 'revoked';
}
