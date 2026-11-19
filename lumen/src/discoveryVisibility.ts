import { MediaStatus, type TitleResult } from './api';
import { canManageBlocklist } from './blocklist';
import type { PublicSettings } from './hooks';

export function discoveryVisibility(
  settings: PublicSettings | null,
  permissions: unknown
) {
  return {
    hideAvailable: settings?.hideAvailable === true,
    hideRequested: settings?.hideRequested === true,
    hideBlocklisted:
      settings?.hideBlocklisted === true || !canManageBlocklist(permissions),
  };
}

export function showDiscoveryTitle(
  title: Pick<TitleResult, 'mediaInfo'>,
  {
    hideAvailable,
    hideRequested,
    hideBlocklisted,
  }: ReturnType<typeof discoveryVisibility>
) {
  const media = title.mediaInfo;
  return (
    (!hideAvailable ||
      (media?.status !== MediaStatus.AVAILABLE &&
        media?.status !== MediaStatus.PARTIAL)) &&
    (!hideRequested || media?.hasActiveRequest !== true) &&
    (!hideBlocklisted || media?.status !== MediaStatus.BLOCKLISTED)
  );
}
