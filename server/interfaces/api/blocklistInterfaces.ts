import type { MediaType } from '@server/constants/media';
import type { User } from '@server/entity/User';
import type { PaginatedResponse } from '@server/interfaces/api/common';

export interface BlocklistItem {
  tmdbId: number;
  externalId?: string | null;
  externalProvider?: string | null;
  mediaType: MediaType;
  title?: string;
  createdAt?: Date;
  user?: User;
  blocklistedTags?: string;
}

export interface BlocklistResultsResponse extends PaginatedResponse {
  results: BlocklistItem[];
  counts: {
    all: number;
    manual: number;
    blocklistedTags: number;
  };
}

export interface BlocklistCountResponse {
  count: number;
}
