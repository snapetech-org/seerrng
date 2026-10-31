import axios from 'axios';
import { useCallback } from 'react';
import useSWR from 'swr';

export type FollowKind =
  | 'narrator'
  | 'author'
  | 'series-language'
  | 'edition'
  | 'expansion'
  | 'artist-release-type'
  | 'patch-project'
  | 'franchise'
  | 'tmdb-person'
  | 'tmdb-studio'
  | 'tmdb-network'
  | 'tmdb-genre';

export interface FollowView {
  id: number;
  kind: FollowKind;
  subjectKey: string;
  subjectLabel: string;
  conditions: Record<string, unknown> | null;
  notify: boolean;
  autoRequest: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface FollowInput {
  kind: FollowKind;
  subjectKey: string;
  subjectLabel: string;
  conditions?: {
    language?: string;
    production?: 'solo' | 'full-cast' | 'any';
    includeTypes?: string[];
    excludeTypes?: string[];
    ref?: Record<string, string | number | boolean>;
  };
  notify?: boolean;
  autoRequest?: boolean;
}

const useFollows = () => {
  const { data, mutate } = useSWR<{ results: FollowView[] }>('/api/v1/follow');

  const find = useCallback(
    (kind: FollowKind, subjectKey: string) =>
      data?.results.find(
        (follow) => follow.kind === kind && follow.subjectKey === subjectKey
      ),
    [data]
  );

  const follow = useCallback(
    async (input: FollowInput) => {
      await axios.post('/api/v1/follow', input);
      await mutate();
    },
    [mutate]
  );

  const unfollow = useCallback(
    async (id: number) => {
      await axios.delete(`/api/v1/follow/${id}`);
      await mutate();
    },
    [mutate]
  );

  const update = useCallback(
    async (id: number, patch: { notify?: boolean; autoRequest?: boolean }) => {
      await axios.patch(`/api/v1/follow/${id}`, patch);
      await mutate();
    },
    [mutate]
  );

  return { follows: data?.results, find, follow, unfollow, update, mutate };
};

export default useFollows;
