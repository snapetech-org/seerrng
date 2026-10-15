import type { Tag } from '@server/api/servarr/base';

export type RequesterTagClient = {
  getTags: () => Promise<Tag[]>;
  createTag: (options: { label: string }) => Promise<Tag>;
};

export type RequesterTagFailureStage = 'lookup' | 'create';

export type RequesterTagResolution = {
  tags: number[];
  created: boolean;
  failureStage?: RequesterTagFailureStage;
};

export const resolveRequesterTag = async (
  client: RequesterTagClient,
  currentTags: number[],
  userId: number,
  label: string
): Promise<RequesterTagResolution> => {
  const tags = [...currentTags];
  let failureStage: RequesterTagFailureStage = 'lookup';

  try {
    const serverTags = await client.getTags();
    const tag =
      serverTags.find((serverTag) =>
        serverTag.label.startsWith(`${userId}-`)
      ) ??
      serverTags.find((serverTag) =>
        serverTag.label.startsWith(`${userId} - `)
      );

    let requesterTag = tag;
    let created = false;

    if (!requesterTag) {
      failureStage = 'create';
      requesterTag = await client.createTag({ label });
      created = true;
    }

    if (!Number.isSafeInteger(requesterTag.id) || requesterTag.id <= 0) {
      return { tags, created, failureStage };
    }

    if (!tags.includes(requesterTag.id)) {
      tags.push(requesterTag.id);
    }

    return { tags, created };
  } catch {
    return { tags, created: false, failureStage };
  }
};
