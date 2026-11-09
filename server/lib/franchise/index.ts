import AnilistAPI from '@server/api/anilist';
import type {
  AnilistRelationEdge,
  AnilistRelationType,
} from '@server/api/anilist/interfaces';
import { getRepository } from '@server/datasource';
import MediaRelation, {
  type RelationConfidence,
  type RelationKind,
} from '@server/entity/MediaRelation';
import { allowedByCurrentContentPolicy } from '@server/lib/contentRestriction';
import { findAnilistIdForTmdbShow } from '@server/lib/continuation';
import logger from '@server/logger';
import { isInternalPath } from '@server/utils/internalPath';

export type FranchiseGroup =
  | 'source'
  | 'adaptation'
  | 'prequel'
  | 'sequel'
  | 'side-story'
  | 'soundtrack'
  | 'related';

export interface FranchiseItem {
  group: FranchiseGroup;
  relation: RelationKind;
  title: string;
  mediaType:
    'anime' | 'manga' | 'novel' | 'movie' | 'tv' | 'game' | 'album' | 'book';
  format?: string;
  year?: number;
  imageUrl?: string;
  /** Where the person can open or request it in this server. */
  href: string;
  confidence: RelationConfidence;
  evidence?: string;
  source: string;
  verified: boolean;
  relationId?: number;
}

export interface FranchiseResult {
  anchor: { mediaType: string; id: string; title: string };
  items: FranchiseItem[];
  /** Shown to the person so uncertain links are never silent. */
  notes: ('no-anilist-match' | 'curated-links-only')[];
}

const RELATION_MAP: Partial<
  Record<AnilistRelationType, { relation: RelationKind; group: FranchiseGroup }>
> = {
  ADAPTATION: { relation: 'source-material', group: 'source' },
  SOURCE: { relation: 'source-material', group: 'source' },
  PREQUEL: { relation: 'prequel', group: 'prequel' },
  SEQUEL: { relation: 'sequel', group: 'sequel' },
  SIDE_STORY: { relation: 'side-story', group: 'side-story' },
  SPIN_OFF: { relation: 'side-story', group: 'side-story' },
  PARENT: { relation: 'same-franchise', group: 'related' },
  ALTERNATIVE: { relation: 'same-franchise', group: 'related' },
};

const titleOf = (edge: AnilistRelationEdge) =>
  edge.node.title?.english || edge.node.title?.romaji || 'Untitled';

const kindOf = (edge: AnilistRelationEdge): FranchiseItem['mediaType'] =>
  edge.node.type === 'MANGA'
    ? edge.node.format === 'NOVEL'
      ? 'novel'
      : 'manga'
    : 'anime';

const searchHref = (title: string) =>
  `/search?query=${encodeURIComponent(title)}`;

const storeEdges = async (
  anchorId: number,
  items: FranchiseItem[],
  edges: AnilistRelationEdge[]
) => {
  const repository = getRepository(MediaRelation);
  for (const edge of edges) {
    const mapped = RELATION_MAP[edge.relationType];
    if (!mapped) continue;
    await repository
      .upsert(
        {
          fromType: 'anime',
          fromId: String(anchorId),
          toType: kindOf(edge),
          toId: String(edge.node.id),
          relation: mapped.relation,
          confidence: 'high',
          evidence: `AniList relation ${edge.relationType}`,
          source: 'anilist',
          updatedAt: new Date(),
        },
        ['fromType', 'fromId', 'toType', 'toId', 'relation']
      )
      .catch(() => undefined);
  }
  void items;
};

export const getFranchise = async (options: {
  mediaType: 'tv' | 'anime';
  id: string;
  title?: string;
  language?: string;
}): Promise<FranchiseResult> => {
  const notes: FranchiseResult['notes'] = [];
  let anilistId: number | undefined =
    options.mediaType === 'anime' ? Number(options.id) : undefined;
  if (options.mediaType === 'tv') {
    anilistId = (
      await findAnilistIdForTmdbShow(Number(options.id), options.language)
    ).anilistId;
  }

  const items: FranchiseItem[] = [];
  let title = options.title ?? '';
  if (anilistId) {
    const anchor = await new AnilistAPI()
      .getMediaWithRelations(anilistId)
      .catch((error) => {
        logger.debug('AniList franchise lookup failed', {
          label: 'Franchise',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
    if (anchor && !allowedByCurrentContentPolicy(anchor))
      throw Object.assign(new Error('Not found.'), { status: 404 });
    if (anchor) {
      title = anchor.title?.english || anchor.title?.romaji || title;
      const edges = anchor.relations?.edges ?? [];
      const rejected = new Set(
        (
          await getRepository(MediaRelation).find({
            where: {
              fromType: 'anime',
              fromId: String(anilistId),
              rejected: true,
            },
          })
        ).map((row) => row.toId)
      );
      for (const edge of edges) {
        const mapped = RELATION_MAP[edge.relationType];
        if (
          !mapped ||
          rejected.has(String(edge.node.id)) ||
          !allowedByCurrentContentPolicy(edge.node)
        )
          continue;
        items.push({
          group: mapped.group,
          relation: mapped.relation,
          title: titleOf(edge),
          mediaType: kindOf(edge),
          format: edge.node.format ?? undefined,
          year: edge.node.startDate?.year ?? undefined,
          imageUrl:
            edge.node.coverImage?.large ??
            edge.node.coverImage?.medium ??
            undefined,
          href: searchHref(titleOf(edge)),
          confidence: 'high',
          evidence: `AniList lists this as ${edge.relationType.toLowerCase().replace('_', ' ')}`,
          source: 'anilist',
          verified: false,
        });
      }
      await storeEdges(anilistId, items, edges);
    }
  } else {
    notes.push('no-anilist-match');
  }

  // Curated links (administrators) and previously verified relations.
  const curated = await getRepository(MediaRelation).find({
    where: [
      { fromType: options.mediaType, fromId: options.id, rejected: false },
      ...(anilistId
        ? [
            {
              fromType: 'anime',
              fromId: String(anilistId),
              source: 'curated',
              rejected: false,
            },
          ]
        : []),
    ],
  });
  for (const row of curated) {
    if (row.source !== 'curated' && !row.verified) continue;
    const data = (row.data ?? {}) as {
      title?: string;
      href?: string;
      imageUrl?: string;
    };
    items.push({
      group:
        row.relation === 'source-material'
          ? 'source'
          : row.relation === 'soundtrack'
            ? 'soundtrack'
            : row.relation === 'sequel'
              ? 'sequel'
              : row.relation === 'prequel'
                ? 'prequel'
                : row.relation === 'side-story'
                  ? 'side-story'
                  : row.relation === 'adaptation'
                    ? 'adaptation'
                    : 'related',
      relation: row.relation,
      title: data.title ?? row.toId,
      mediaType: row.toType as FranchiseItem['mediaType'],
      imageUrl: data.imageUrl,
      href: isInternalPath(data.href)
        ? data.href
        : searchHref(data.title ?? row.toId),
      confidence: row.confidence,
      evidence: row.evidence ?? undefined,
      source: row.source,
      verified: row.verified,
      relationId: row.id,
    });
  }
  if (!items.length && !anilistId) notes.push('curated-links-only');

  return {
    anchor: { mediaType: options.mediaType, id: options.id, title },
    items,
    notes,
  };
};
