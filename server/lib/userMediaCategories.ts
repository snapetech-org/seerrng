import {
  DEFAULT_USER_ENABLED_MEDIA_CATEGORIES,
  MEDIA_CATEGORY_KEYS,
  type EnabledMediaCategories,
  type MediaCategoryKey,
} from '@server/constants/mediaCategories';
import type { User } from '@server/entity/User';
import { isMediaCategoryEnabled } from '@server/lib/mediaCategories';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';

export const getUserEnabledMediaCategories = (
  user?: User
): EnabledMediaCategories => {
  if (user?.hasPermission?.(Permission.ADMIN)) {
    return Object.fromEntries(
      MEDIA_CATEGORY_KEYS.map((category) => [category, true])
    ) as EnabledMediaCategories;
  }

  const defaults = {
    ...DEFAULT_USER_ENABLED_MEDIA_CATEGORIES,
    ...getSettings().main.defaultEnabledMediaCategories,
  };

  return Object.fromEntries(
    MEDIA_CATEGORY_KEYS.map((category) => [
      category,
      user?.settings?.enabledMediaCategories?.[category] ?? defaults[category],
    ])
  ) as EnabledMediaCategories;
};

export const isUserMediaCategoryEnabled = (
  user: User | undefined,
  category: MediaCategoryKey
): boolean =>
  isMediaCategoryEnabled(category) &&
  getUserEnabledMediaCategories(user)[category];
