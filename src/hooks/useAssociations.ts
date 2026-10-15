import type { AssociationReasonKey } from '@server/lib/associations/types';
import type {
  AlbumResult,
  ArtistResult,
  BookResult,
  MovieResult,
  PersonResult,
  TvResult,
} from '@server/models/Search';
import useSWR from 'swr';

export type { AssociationReasonKey } from '@server/lib/associations/types';

export type AssociationMediaType = 'movie' | 'tv' | 'album' | 'artist' | 'book';

export type AssociationEdgeType =
  'similar' | 'recommended' | 'shared-person' | 'shared-genre';

export type AssociationNode =
  | MovieResult
  | TvResult
  | AlbumResult
  | ArtistResult
  | BookResult
  | PersonResult;

export interface AssociationEdge {
  weight: number;
  type: AssociationEdgeType;
  reason: string;
  reasonKey?: AssociationReasonKey;
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

export const SUPPORTED_ASSOCIATION_TYPES = new Set<AssociationMediaType>([
  'movie',
  'tv',
  'album',
  'artist',
  'book',
]);

export const toAssociationMediaType = (
  mediaType: string
): AssociationMediaType | null =>
  SUPPORTED_ASSOCIATION_TYPES.has(mediaType as AssociationMediaType)
    ? (mediaType as AssociationMediaType)
    : null;

interface UseAssociationsOptions {
  enabled?: boolean;
  includeWeak?: boolean;
}

const useAssociations = (
  mediaType: AssociationMediaType | null,
  id: string | number | null | undefined,
  { enabled = true, includeWeak = false }: UseAssociationsOptions = {}
) => {
  const key =
    enabled && mediaType && id != null && id !== ''
      ? `/api/v1/association/${mediaType}/${encodeURIComponent(
          String(id)
        )}${includeWeak ? '?includeWeak=true' : ''}`
      : null;

  const { data, error, isLoading } = useSWR<AssociationGraph>(key, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    shouldRetryOnError: false,
  });

  return {
    graph: data,
    edges: data?.edges ?? [],
    isLoading: !!key && isLoading,
    isError: !!error,
    hasStrongEdges: (data?.edges ?? []).some(
      (e) => e.type === 'similar' || e.type === 'shared-person'
    ),
  };
};

export default useAssociations;
