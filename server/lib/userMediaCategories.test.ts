import { DEFAULT_USER_ENABLED_MEDIA_CATEGORIES } from '@server/constants/mediaCategories';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getUserEnabledMediaCategories,
  isUserMediaCategoryEnabled,
} from './userMediaCategories';

test('merges user choices over administrator defaults and keeps admins unrestricted', (t) => {
  const settings = getSettings();
  const originalDefaults = { ...settings.main.defaultEnabledMediaCategories };
  const originalEnabled = { ...settings.main.enabledMediaCategories };
  t.after(() => {
    settings.main.defaultEnabledMediaCategories = originalDefaults;
    settings.main.enabledMediaCategories = originalEnabled;
  });

  settings.main.defaultEnabledMediaCategories = {
    ...DEFAULT_USER_ENABLED_MEDIA_CATEGORIES,
    movie: false,
    music: false,
  };
  settings.main.enabledMediaCategories = {
    ...originalEnabled,
    movie: true,
  };

  const user = new User({
    permissions: Permission.REQUEST,
    settings: new UserSettings({
      enabledMediaCategories: { movie: true, tv: false },
    }),
  });
  const administrator = new User({ permissions: Permission.ADMIN });
  const preferences = getUserEnabledMediaCategories(user);

  assert.equal(preferences.movie, true);
  assert.equal(preferences.tv, false);
  assert.equal(preferences.music, false);
  assert.equal(getUserEnabledMediaCategories(administrator).movie, true);

  settings.main.enabledMediaCategories.movie = false;
  assert.equal(isUserMediaCategoryEnabled(user, 'movie'), false);
  assert.equal(isUserMediaCategoryEnabled(administrator, 'movie'), false);
});
