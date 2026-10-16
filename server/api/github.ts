import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import { getHttpErrorDetails } from '@server/utils/httpError';
import ExternalAPI from './externalapi';

const SEERRNG_REPO = '/repos/snapetech-org/seerrng';

interface GitHubRelease {
  name: string;
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
}

interface GithubCommit {
  sha: string;
  commit: {
    message: string;
  };
}

const MAX_GITHUB_RESULTS = 100;
const MAX_GITHUB_TEXT_LENGTH = 10_000;

const clampTake = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_GITHUB_RESULTS, Math.max(1, Math.trunc(value)))
    : 20;

export const sanitizeGithubReleases = (
  value: unknown,
  take = 20
): GitHubRelease[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, clampTake(take))
    .flatMap((release) => {
      if (!release || typeof release !== 'object') {
        return [];
      }

      const rawRelease = release as Record<string, unknown>;
      if (
        typeof rawRelease.name !== 'string' ||
        typeof rawRelease.tag_name !== 'string'
      ) {
        return [];
      }

      return [
        {
          name: rawRelease.name.slice(0, MAX_GITHUB_TEXT_LENGTH),
          tag_name: rawRelease.tag_name.slice(0, 128),
          prerelease: rawRelease.prerelease === true,
          draft: rawRelease.draft === true,
        },
      ];
    });

export const sanitizeGithubCommits = (
  value: unknown,
  take = 20
): GithubCommit[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, clampTake(take))
    .flatMap((rawCommit) => {
      if (!rawCommit || typeof rawCommit !== 'object') {
        return [];
      }
      const commit = rawCommit as Record<string, unknown>;
      if (
        typeof commit.sha !== 'string' ||
        !commit.commit ||
        typeof commit.commit !== 'object' ||
        typeof (commit.commit as Record<string, unknown>).message !== 'string'
      ) {
        return [];
      }
      return [
        {
          sha: commit.sha.slice(0, 128),
          commit: {
            message: (
              (commit.commit as Record<string, unknown>).message as string
            ).slice(0, MAX_GITHUB_TEXT_LENGTH),
          },
        },
      ];
    });

class GithubAPI extends ExternalAPI {
  constructor() {
    super(
      'https://api.github.com',
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        nodeCache: cacheManager.getCache('github').data,
      }
    );
  }

  public async getSeerrReleases({
    take = 20,
  }: {
    take?: number;
  } = {}): Promise<GitHubRelease[]> {
    try {
      const boundedTake = clampTake(take);
      const data = await this.get<unknown>(`${SEERRNG_REPO}/releases`, {
        params: {
          per_page: boundedTake,
        },
      });

      return sanitizeGithubReleases(data, boundedTake);
    } catch (e) {
      logger.warn(
        "Failed to retrieve GitHub releases. This may be an issue on GitHub's end. SeerrNG can't check if it's on the latest version.",
        { label: 'GitHub API', ...getHttpErrorDetails(e) }
      );
      return [];
    }
  }

  public async getSeerrCommits({
    take = 20,
    branch = 'main',
  }: {
    take?: number;
    branch?: string;
  } = {}): Promise<GithubCommit[]> {
    try {
      const boundedTake = clampTake(take);
      const data = await this.get<unknown>(`${SEERRNG_REPO}/commits`, {
        params: {
          per_page: boundedTake,
          branch:
            typeof branch === 'string' && branch.length <= 128
              ? branch
              : 'main',
        },
      });

      return sanitizeGithubCommits(data, boundedTake);
    } catch (e) {
      logger.warn(
        "Failed to retrieve GitHub commits. This may be an issue on GitHub's end. SeerrNG can't check if it's on the latest version.",
        { label: 'GitHub API', ...getHttpErrorDetails(e) }
      );
      return [];
    }
  }
}

export default GithubAPI;
