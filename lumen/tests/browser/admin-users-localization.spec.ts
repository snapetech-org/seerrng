import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locale = process.env.LUMEN_ADMIN_USERS_LOCALE ?? 'en';
const labels = {
  en: {
    title: 'Users',
    administration: 'Administration',
    allUsers: 'All Users',
    manage: 'Manage',
    manageUser: 'Manage Demo User',
    searchUsers: 'Search Users',
    sortBy: 'Sort By',
    sortDirection: 'Sort Direction',
    ascending: 'Ascending',
    descending: 'Descending',
    createLocalUser: 'Create Local User',
    createHeading: 'Create Local User',
    username: 'Username',
    email: 'Email',
    emailSetup: 'Email a password setup link',
    password: 'Password',
    createUser: 'Create User',
    creating: 'Creating…',
    cancel: 'Cancel',
    role: 'Member',
    requestCount: '3 requests',
    serverProblem: 'The server had a problem. Try again in a moment.',
    created: 'Created New User.',
    episodesAhead: 'Episodes Ahead',
    saveDefault: 'Save Default',
    queueConfirm: 'Save Episode Queue default for Demo User?',
    queueGoBack: 'Go Back',
    tvAccess: 'TV request access',
    tvPending: 'Waiting for approval',
    episodeQueue: 'Episode Queue',
    tvRequestAccess: 'TV Request Access',
    setLocalPassword: 'Set Local Password',
    passwordMismatch: 'Enter matching passwords of at least 8 characters.',
    passwordFailure: 'The server had a problem. Try again in a moment.',
    passwordSaved: 'Local password saved.',
    newPassword: 'New Local Password',
    confirmPassword: 'Confirm New Local Password',
    savePassword: 'Save Local Password',
    signInLinks: 'Sign-in Links',
    createSignInLink: 'Create Sign-in Link',
    signInActive: 'Active',
    revokeLink: 'Revoke Link',
    revoked: 'Sign-in link revoked.',
    noLinks: 'No sign-in links yet.',
    newLink: 'New sign-in link',
    revokedStatus: 'Revoked',
    mediaCategories: 'Media Categories',
    categoryMovie: 'Movies',
    saveCategories: 'Save Categories',
    categoriesSaved: 'Media categories saved.',
    maturityLimits: 'Maturity Limits',
    movieRatingLimit: 'Movie Rating Limit',
    saveMaturity: 'Save Maturity Limits',
    maturitySaved: 'Maturity limits saved.',
    requestQuotas: 'Request Quotas',
    quotaLimit: 'Request Limit',
    quotaDays: 'Quota Days',
    bothQuotaValues:
      'Enter both values or clear both to use the server default.',
    saveQuota: 'Save Quota',
    quotaSaved: 'Request quota saved.',
    importUsers: 'Import Jellyfin Users',
    importTitle: 'Import Jellyfin Users',
    syncExistingUsers: 'Sync Existing Users',
    importSelected: 'Import Selected Users',
    importSelectedConfirm: 'Import Selected Users?',
    importFailure: 'The server had a problem. Try again in a moment.',
    importSuccess: 'Imported 1, refreshed 0.',
    closeImport: 'Close Import',
    linkedAccounts: 'Linked Accounts',
    unlinkTrakt: 'Unlink Trakt',
    unlinkConfirm: 'Unlink Trakt?',
    unlinkAccount: 'Unlink Account',
    unlinkFailure: 'The server had a problem. Try again in a moment.',
    unlinked: 'Account unlinked.',
    unlinkConfirmHeading: 'Unlink Trakt?',
  },
  fr: {
    title: 'Utilisateurs',
    administration: 'Administration',
    allUsers: 'Tous les utilisateurs',
    manage: 'Gérer',
    manageUser: 'Gérer Demo User',
    searchUsers: 'Rechercher des utilisateurs',
    sortBy: 'Trier par',
    sortDirection: 'Ordre de tri',
    ascending: 'Croissant',
    descending: 'Décroissant',
    createLocalUser: 'Créer un utilisateur local',
    createHeading: 'Créer un utilisateur local',
    username: 'Nom d’utilisateur',
    email: 'Adresse e-mail',
    emailSetup: 'Envoyer un lien de création de mot de passe par e-mail',
    password: 'Mot de passe',
    createUser: 'Créer l’utilisateur',
    creating: 'Création…',
    cancel: 'Annuler',
    role: 'Membre',
    requestCount: '3 demandes',
    serverProblem:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
    created: 'New User a été créé.',
    episodesAhead: 'Épisodes à l’avance',
    saveDefault: 'Enregistrer comme valeur par défaut',
    queueConfirm:
      'Enregistrer la valeur par défaut de la file d’épisodes pour Demo User ?',
    queueGoBack: 'Retour',
    tvAccess: 'Accès aux demandes TV',
    tvPending: 'En attente d’approbation',
    episodeQueue: 'File d’attente des épisodes',
    tvRequestAccess: 'Accès aux demandes TV',
    setLocalPassword: 'Définir un mot de passe local',
    passwordMismatch:
      'Saisissez deux mots de passe identiques d’au moins 8 caractères.',
    passwordFailure:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
    passwordSaved: 'Mot de passe local enregistré.',
    newPassword: 'Nouveau mot de passe local',
    confirmPassword: 'Confirmez le nouveau mot de passe local',
    savePassword: 'Enregistrer le mot de passe local',
    signInLinks: 'Liens de connexion',
    createSignInLink: 'Créer un lien de connexion',
    signInActive: 'Actif',
    revokeLink: 'Révoquer le lien',
    revoked: 'Lien de connexion révoqué.',
    noLinks: 'Aucun lien de connexion pour le moment.',
    newLink: 'Nouveau lien de connexion',
    revokedStatus: 'Révoqué',
    mediaCategories: 'Catégories de médias',
    categoryMovie: 'Films',
    saveCategories: 'Enregistrer les catégories',
    categoriesSaved: 'Catégories de médias enregistrées.',
    maturityLimits: 'Limites de classification',
    movieRatingLimit: 'Limite de classification des films',
    saveMaturity: 'Enregistrer les limites de classification',
    maturitySaved: 'Limites de classification enregistrées.',
    requestQuotas: 'Quotas de demandes',
    quotaLimit: 'Limite de demandes',
    quotaDays: 'Durée du quota en jours',
    bothQuotaValues:
      'Saisissez les deux valeurs ou effacez-les pour utiliser la valeur par défaut du serveur.',
    saveQuota: 'Enregistrer le quota',
    quotaSaved: 'Quota de demandes enregistré.',
    importUsers: 'Importer les utilisateurs Jellyfin',
    importTitle: 'Importer les utilisateurs Jellyfin',
    syncExistingUsers: 'Synchroniser les utilisateurs existants',
    importSelected: 'Importer les utilisateurs sélectionnés',
    importSelectedConfirm: 'Importer les utilisateurs sélectionnés ?',
    importFailure:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
    importSuccess: 'Importés : 1, actualisés : 0.',
    closeImport: 'Fermer l’importation',
    linkedAccounts: 'Comptes associés',
    unlinkTrakt: 'Déconnecter Trakt',
    unlinkConfirm: 'Déconnecter Trakt ?',
    unlinkAccount: 'Déconnecter le compte',
    unlinkFailure:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
    unlinked: 'Compte déconnecté.',
    unlinkConfirmHeading: 'Déconnecter Trakt ?',
  },
  ar: {
    title: 'المستخدمون',
    administration: 'الإدارة',
    allUsers: 'جميع المستخدمين',
    manage: 'إدارة',
    manageUser: 'إدارة Demo User',
    searchUsers: 'البحث عن المستخدمين',
    sortBy: 'الترتيب حسب',
    sortDirection: 'اتجاه الترتيب',
    ascending: 'تصاعدي',
    descending: 'تنازلي',
    createLocalUser: 'إنشاء مستخدم محلي',
    createHeading: 'إنشاء مستخدم محلي',
    username: 'اسم المستخدم',
    email: 'البريد الإلكتروني',
    emailSetup: 'إرسال رابط إعداد كلمة المرور بالبريد الإلكتروني',
    password: 'كلمة المرور',
    createUser: 'إنشاء مستخدم',
    creating: 'جارٍ الإنشاء…',
    cancel: 'إلغاء',
    role: 'عضو',
    requestCount: '3 من الطلبات',
    serverProblem: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    created: 'تم إنشاء New User.',
    episodesAhead: 'الحلقات مقدمًا',
    saveDefault: 'حفظ كقيمة افتراضية',
    queueConfirm:
      'هل تريد حفظ القيمة الافتراضية لقائمة انتظار الحلقات لـ Demo User؟',
    queueGoBack: 'رجوع',
    tvAccess: 'الوصول إلى طلبات التلفاز',
    tvPending: 'بانتظار الموافقة',
    episodeQueue: 'قائمة انتظار الحلقات',
    tvRequestAccess: 'الوصول إلى طلبات التلفزيون',
    setLocalPassword: 'تعيين كلمة مرور محلية',
    passwordMismatch: 'أدخل كلمتي مرور متطابقتين لا تقل كل منهما عن 8 أحرف.',
    passwordFailure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    passwordSaved: 'تم حفظ كلمة المرور المحلية.',
    newPassword: 'كلمة المرور المحلية الجديدة',
    confirmPassword: 'تأكيد كلمة المرور المحلية الجديدة',
    savePassword: 'حفظ كلمة المرور المحلية',
    signInLinks: 'روابط تسجيل الدخول',
    createSignInLink: 'إنشاء رابط تسجيل دخول',
    signInActive: 'نشط',
    revokeLink: 'إبطال الرابط',
    revoked: 'تم إبطال رابط تسجيل الدخول.',
    noLinks: 'لا توجد روابط تسجيل دخول بعد.',
    newLink: 'رابط تسجيل الدخول الجديد',
    revokedStatus: 'مُبطل',
    mediaCategories: 'فئات الوسائط',
    categoryMovie: 'أفلام',
    saveCategories: 'حفظ الفئات',
    categoriesSaved: 'تم حفظ فئات الوسائط.',
    maturityLimits: 'حدود التصنيف العمري',
    movieRatingLimit: 'حد تصنيف الأفلام',
    saveMaturity: 'حفظ حدود التصنيف العمري',
    maturitySaved: 'تم حفظ حدود التصنيف العمري.',
    requestQuotas: 'حصص الطلبات',
    quotaLimit: 'حد الطلبات',
    quotaDays: 'أيام الحصة',
    bothQuotaValues:
      'أدخل القيمتين أو امسحهما لاستخدام الإعداد الافتراضي للخادم.',
    saveQuota: 'حفظ الحصة',
    quotaSaved: 'تم حفظ حصة الطلبات.',
    importUsers: 'استيراد مستخدمي Jellyfin',
    importTitle: 'استيراد مستخدمي Jellyfin',
    syncExistingUsers: 'مزامنة المستخدمين الحاليين',
    importSelected: 'استيراد المستخدمين المحددين',
    importSelectedConfirm: 'استيراد المستخدمين المحددين؟',
    importFailure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    importSuccess: 'تم استيراد 1 وتحديث 0.',
    closeImport: 'إغلاق الاستيراد',
    linkedAccounts: 'الحسابات المرتبطة',
    unlinkTrakt: 'إلغاء ربط Trakt',
    unlinkConfirm: 'هل تريد إلغاء ربط Trakt؟',
    unlinkAccount: 'إلغاء ربط الحساب',
    unlinkFailure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    unlinked: 'تم إلغاء ربط الحساب.',
    unlinkConfirmHeading: 'هل تريد إلغاء ربط Trakt؟',
  },
} as const;
const english = labels.en;

async function expectTabbarDoesNotCoverActions(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) > 1039) return;
  await expect
    .poll(() =>
      page.evaluate(() => {
        const tabbar = document.querySelector<HTMLElement>('.tabbar');
        const view = document.querySelector<HTMLElement>('#view');
        if (!tabbar || !view || tabbar.hasAttribute('data-hidden'))
          return false;
        const bar = tabbar.getBoundingClientRect();
        return Array.from(
          view.querySelectorAll<HTMLElement>(
            'a[href], button, input, select, textarea, [role="button"]'
          )
        ).some((action) => {
          if (!action.getClientRects().length) return false;
          const rect = action.getBoundingClientRect();
          const style = getComputedStyle(action);
          return (
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.right > bar.left + 4 &&
            rect.left < bar.right - 4 &&
            rect.bottom > bar.top + 4 &&
            rect.top < bar.bottom - 4
          );
        });
      })
    )
    .toBe(false);
}

test('user directory and local-account creation use the saved locale and retain a failed submit', async ({
  page,
}) => {
  const translated = labels[locale as keyof typeof labels] ?? english;
  const copy =
    process.env.LUMEN_ADMIN_USERS_BASELINE === 'true' ? english : translated;
  let failOnce = true;
  let passwordFailOnce = true;
  let importFailOnce = true;
  let unlinkFailOnce = true;
  let importedPayload: Record<string, unknown> | undefined;
  const links: {
    id: number;
    expiresAt: string;
    status: 'active' | 'revoked';
  }[] = [];
  const creates: Record<string, unknown>[] = [];
  let maturityPolicy = {
    movieMaturityRatingLimit: null as string | null,
    tvMaturityRatingLimit: null as string | null,
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', mediaServerType: 2 },
      });
    if (path === '/user' && request.method() === 'GET')
      return route.fulfill({
        json: {
          pageInfo: { pages: 1, results: 1 },
          results: [
            {
              id: 2,
              displayName: 'Demo User',
              email: 'demo@example.test',
              permissions: 0,
              requestCount: 3,
              userType: 1,
              jellyfinUserId: 'jellyfin-2',
              jellyfinUsername: 'demo-jellyfin',
            },
          ],
        },
      });
    if (path === '/user' && request.method() === 'POST') {
      creates.push(request.postDataJSON() as Record<string, unknown>);
      if (failOnce) {
        failOnce = false;
        return route.fulfill({ status: 503, json: { message: 'unavailable' } });
      }
      return route.fulfill({ json: { id: 3 } });
    }
    if (path === '/user/2/settings/episode-queue')
      return route.fulfill({ json: { defaultEpisodeCount: 2 } });
    if (path === '/user/2/settings/tv-season-watch-gate')
      return route.fulfill({
        json: {
          status: 'pending',
          globallyEnabled: false,
          requestedAt: null,
        },
      });
    if (path === '/settings/jellyfin/users')
      return route.fulfill({
        json: [
          {
            id: 'jellyfin-new',
            username: 'new-user',
            title: 'New Jellyfin User',
          },
          { id: 'jellyfin-old', username: 'existing-user', isImported: true },
        ],
      });
    if (path === '/user/import-from-jellyfin' && request.method() === 'POST') {
      importedPayload = request.postDataJSON() as Record<string, unknown>;
      if (importFailOnce) {
        importFailOnce = false;
        return route.fulfill({ status: 503, json: { message: 'unavailable' } });
      }
      return route.fulfill({ json: { createdUsers: [{}], refreshedUsers: 0 } });
    }
    if (
      path === '/user/2/settings/linked-accounts' &&
      request.method() === 'GET'
    )
      return route.fulfill({
        json: [{ id: 9, username: 'demo-trakt', provider: { name: 'Trakt' } }],
      });
    if (
      path === '/user/2/settings/linked-accounts/9' &&
      request.method() === 'DELETE'
    ) {
      if (unlinkFailOnce) {
        unlinkFailOnce = false;
        return route.fulfill({ status: 503, json: { message: 'unavailable' } });
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/user/2/settings/password' && request.method() === 'GET')
      return route.fulfill({ json: { hasPassword: true } });
    if (path === '/user/2/settings/main') {
      if (request.method() === 'POST')
        return route.fulfill({ status: 204, body: '' });
      return route.fulfill({
        json: {
          enabledMediaCategories: { movie: true, tv: true },
          usesDefaultEnabledMediaCategories: false,
          showIndexerDetails: true,
          defaultShowIndexerDetails: true,
          usesDefaultShowIndexerDetails: true,
          globalMovieQuotaLimit: 5,
          globalMovieQuotaDays: 7,
        },
      });
    }
    if (path === '/user/2/settings/maturity') {
      if (request.method() === 'POST') {
        maturityPolicy = { ...maturityPolicy, ...request.postDataJSON() };
      }
      return route.fulfill({ json: maturityPolicy });
    }
    if (path === '/user/2/settings/password' && request.method() === 'POST') {
      if (passwordFailOnce) {
        passwordFailOnce = false;
        return route.fulfill({ status: 503, json: { message: 'unavailable' } });
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/settings/login-links' && request.method() === 'GET')
      return route.fulfill({ json: links });
    if (path === '/settings/login-links' && request.method() === 'POST') {
      const link = {
        id: 7,
        token: 'single-use-token',
        expiresAt: '2027-01-02T00:00:00.000Z',
        status: 'active' as const,
      };
      links.push({
        id: link.id,
        expiresAt: link.expiresAt,
        status: link.status,
      });
      return route.fulfill({ json: link });
    }
    if (
      path === '/settings/login-links/7/revoke' &&
      request.method() === 'POST'
    ) {
      links[0].status = 'revoked';
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/users`);
  await expect(
    page.getByRole('heading', { name: copy.title, exact: true })
  ).toBeVisible();
  await expectTabbarDoesNotCoverActions(page);
  await expect(
    page.getByRole('link', { name: copy.administration, exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(copy.searchUsers)).toBeVisible();
  await expect(page.getByLabel(copy.sortBy)).toBeVisible();
  await expect(page.getByLabel(copy.sortDirection)).toHaveValue('asc');
  await expect(page.getByText(copy.role, { exact: true })).toBeVisible();
  await expect(
    page.getByText(copy.requestCount, { exact: true })
  ).toBeVisible();
  await expect(page.getByText(copy.manage, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: copy.manageUser, exact: true })
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );

  await page.getByRole('link', { name: copy.manageUser, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${mount}/admin/users/2$`));
  await expect(
    page.getByRole('link', { name: copy.allUsers, exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: copy.episodeQueue, exact: true })
    .click();
  await expectTabbarDoesNotCoverActions(page);
  await expect(page.locator('.user-panel')).toHaveAttribute(
    'data-title',
    copy.episodeQueue
  );
  await expect(page.getByLabel(copy.episodesAhead)).toHaveValue('2');
  await page.getByLabel(copy.episodesAhead).selectOption('3');
  if (process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE}-episode-queue-${page.viewportSize()!.width}.png`,
    });
  }
  await page.getByRole('button', { name: copy.saveDefault }).click();
  await expect(
    page.getByRole('heading', { name: copy.queueConfirm, exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: copy.queueGoBack }).click();
  await page
    .getByRole('button', { name: copy.tvRequestAccess, exact: true })
    .click();
  await expect(page.getByText(copy.tvPending, { exact: true })).toBeVisible();

  await page
    .getByRole('button', { name: copy.signInLinks, exact: true })
    .click();
  await expect(page.getByText(copy.noLinks, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: copy.createSignInLink }).click();
  await expect(page.getByLabel(copy.newLink)).toHaveValue(/loginToken=/);
  await expect(
    page.getByText(copy.signInActive, { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: copy.revokeLink }).click();
  await expect(page.getByText(copy.revoked, { exact: true })).toBeVisible();
  await expect(
    page.getByText(copy.revokedStatus, { exact: true })
  ).toBeVisible();

  await page
    .getByRole('button', { name: copy.setLocalPassword, exact: true })
    .click();
  await page
    .getByRole('textbox', { name: copy.newPassword, exact: true })
    .fill('safe-password-123');
  await page
    .getByRole('textbox', { name: copy.confirmPassword, exact: true })
    .fill('different-password');
  await page.getByRole('button', { name: copy.savePassword }).click();
  await expect(page.getByRole('alert')).toHaveText(copy.passwordMismatch);
  await page
    .getByRole('textbox', { name: copy.confirmPassword, exact: true })
    .fill('safe-password-123');
  await page.getByRole('button', { name: copy.savePassword }).click();
  await expect(page.getByRole('alert')).toHaveText(copy.passwordFailure);
  await page.getByRole('button', { name: copy.savePassword }).click();
  await expect(
    page.getByText(copy.passwordSaved, { exact: true })
  ).toBeVisible();

  await page
    .getByRole('button', { name: copy.mediaCategories, exact: true })
    .click();
  await expectTabbarDoesNotCoverActions(page);
  await expect(
    page.getByRole('checkbox', { name: translated.categoryMovie, exact: true })
  ).toBeVisible();
  if (process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE}-media-categories-${page.viewportSize()!.width}.png`,
    });
  }
  await page
    .getByRole('checkbox', { name: translated.categoryMovie, exact: true })
    .uncheck();
  await page
    .getByRole('button', { name: copy.saveCategories, exact: true })
    .click();
  await expect(
    page.getByText(copy.categoriesSaved, { exact: true })
  ).toBeVisible();

  await page
    .getByRole('button', { name: copy.maturityLimits, exact: true })
    .click();
  await expectTabbarDoesNotCoverActions(page);
  await expect(page.getByLabel(copy.movieRatingLimit)).toBeVisible();
  await page.getByLabel(copy.movieRatingLimit).scrollIntoViewIfNeeded();
  if (process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE}-maturity-${page.viewportSize()!.width}.png`,
    });
  }
  await page.getByLabel(copy.movieRatingLimit).selectOption('PG');
  await page
    .getByRole('button', { name: copy.saveMaturity, exact: true })
    .click();
  await expect(
    page.getByText(copy.maturitySaved, { exact: true })
  ).toBeVisible();

  await page
    .getByRole('button', { name: copy.requestQuotas, exact: true })
    .click();
  await expectTabbarDoesNotCoverActions(page);
  await expect(page.getByLabel(copy.quotaLimit)).toBeVisible();
  if (process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE}-quotas-${page.viewportSize()!.width}.png`,
    });
  }
  await page.getByLabel(copy.quotaLimit).fill('4');
  await page.getByRole('button', { name: copy.saveQuota, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(copy.bothQuotaValues);
  await page.getByLabel(copy.quotaDays).fill('7');
  await page.getByRole('button', { name: copy.saveQuota, exact: true }).click();
  await expect(page.getByText(copy.quotaSaved, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: copy.allUsers, exact: true }).click();
  await page
    .getByRole('button', { name: copy.importUsers, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.importTitle, exact: true })
  ).toBeVisible();
  await page.getByLabel(copy.syncExistingUsers).check();
  await page.getByRole('checkbox', { name: /New Jellyfin User/ }).check();
  if (process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE}-media-server-import-${page.viewportSize()!.width}.png`,
    });
  }
  await page
    .getByRole('button', { name: copy.importSelected, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.importSelectedConfirm, exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: copy.queueGoBack, exact: true })
    .click();
  await page
    .getByRole('button', { name: copy.importSelected, exact: true })
    .click();
  await page
    .getByRole('button', { name: copy.importSelected, exact: true })
    .last()
    .click();
  await expect(page.getByRole('alert')).toHaveText(copy.importFailure);
  await page
    .getByRole('button', { name: copy.importSelected, exact: true })
    .click();
  await page
    .getByRole('button', { name: copy.importSelected, exact: true })
    .last()
    .click();
  await expect(
    page.getByText(copy.importSuccess, { exact: true })
  ).toBeVisible();
  expect(importedPayload).toMatchObject({
    jellyfinUserIds: ['jellyfin-new'],
    syncExisting: true,
  });
  await page
    .getByRole('button', { name: copy.closeImport, exact: true })
    .click();

  await page.getByRole('link', { name: copy.manageUser, exact: true }).click();
  await page
    .getByRole('button', { name: copy.linkedAccounts, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: copy.unlinkTrakt, exact: true })
  ).toBeVisible();
  if (process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE}-linked-accounts-${page.viewportSize()!.width}.png`,
    });
  }
  await page
    .getByRole('button', { name: copy.unlinkTrakt, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.unlinkConfirmHeading, exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: copy.queueGoBack, exact: true })
    .click();
  await page
    .getByRole('button', { name: copy.unlinkTrakt, exact: true })
    .click();
  await page
    .getByRole('button', { name: copy.unlinkAccount, exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(copy.unlinkFailure);
  await page
    .getByRole('button', { name: copy.unlinkTrakt, exact: true })
    .click();
  await page
    .getByRole('button', { name: copy.unlinkAccount, exact: true })
    .click();
  await expect(page.getByText(copy.unlinked, { exact: true })).toBeVisible();
  if (process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_PANEL_CAPTURE}-tv-access-${page.viewportSize()!.width}.png`,
    });
  }

  if (process.env.LUMEN_ADMIN_USERS_CAPTURE) {
    await page.getByRole('link', { name: copy.allUsers, exact: true }).click();
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_CAPTURE}-directory-${page.viewportSize()!.width}.png`,
    });
    await page
      .getByRole('button', { name: copy.createLocalUser, exact: true })
      .click();
    await expect(page.getByLabel(copy.username)).toBeVisible();
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_CAPTURE}-create-${page.viewportSize()!.width}.png`,
    });
    if (process.env.LUMEN_ADMIN_USERS_CAPTURE_ONLY === '1') return;
    await page.getByRole('button', { name: copy.cancel, exact: true }).click();
  }

  if (new URL(page.url()).pathname.endsWith('/2')) {
    await page.getByRole('link', { name: copy.allUsers, exact: true }).click();
  }
  await page
    .getByRole('button', { name: copy.createLocalUser, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.createHeading, exact: true })
  ).toBeVisible();
  await page.getByLabel(copy.username).fill('New User');
  await page
    .getByRole('textbox', { name: copy.email })
    .fill('new@example.test');
  await page
    .getByRole('textbox', { name: copy.password, exact: true })
    .fill('safe-password-123');
  const create = page.getByRole('button', {
    name: copy.createUser,
    exact: true,
  });
  await create.click();
  await expect(page.getByRole('alert')).toContainText(copy.serverProblem);
  await expect(page.getByLabel(copy.username)).toHaveValue('New User');
  await create.click();
  await expect(page.getByText(copy.created, { exact: true })).toBeVisible();
  expect(creates).toHaveLength(2);
  expect(creates[0]).toMatchObject({
    username: 'New User',
    email: 'new@example.test',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
