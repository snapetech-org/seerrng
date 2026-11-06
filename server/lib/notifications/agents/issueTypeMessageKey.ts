import { IssueType } from '@server/constants/issue';
import type Issue from '@server/entity/Issue';

export type IssueTypeMessageKey = 'video' | 'audio' | 'subtitles' | 'other';

/** Convert the persisted numeric issue type to its ICU select key. */
export const getIssueTypeMessageKey = (
  issueType: Issue['issueType']
): IssueTypeMessageKey => {
  switch (issueType) {
    case IssueType.VIDEO:
      return 'video';
    case IssueType.AUDIO:
      return 'audio';
    case IssueType.SUBTITLES:
      return 'subtitles';
    case IssueType.OTHER:
    default:
      return 'other';
  }
};
