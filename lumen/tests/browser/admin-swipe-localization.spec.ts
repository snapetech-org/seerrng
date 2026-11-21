import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const translations = {
  en: {
    title: 'Swipe Discovery',
    pageTitle: 'Swipe Settings',
    back: 'Administration',
    description:
      'Swipe shows people a stack of movies, series, and books picked from their requests and swipes. Swiping right makes a normal request with the usual approval rules.',
    enabled: 'Enable Swipe',
    provider: 'AI Ordering',
    note: 'Optional: connect an AI provider to order each deck and explain why a title was picked. Decks still come only from SeerrNG’s catalogs, and swiping keeps working if the AI provider is unavailable. Titles, taste notes, and swipe history are sent to the provider when this is on.',
    none: 'Off (catalog order)',
    anthropic: 'Anthropic Claude',
    openai: 'OpenAI-compatible',
    model: 'Model',
    url: 'Base URL',
    effort: 'Effort',
    key: 'API Key',
    anthropicKey: 'Anthropic API Key',
    saved: 'Saved — leave empty to keep it',
    clear: 'Remove the saved API key',
    test: 'Test AI Ordering',
    tested: 'The AI provider answered the test request.',
    save: 'Save Changes',
    saving: 'Saving…',
    discard: 'Discard Changes',
    savedNotice: 'Swipe settings saved.',
    failure: 'The server had a problem. Try again in a moment.',
  },
  fr: {
    title: 'Découverte Swipe',
    pageTitle: 'Paramètres Swipe',
    back: 'Administration',
    description:
      'Swipe propose des films, des séries et des livres selon vos demandes et vos choix précédents. Un balayage vers la droite crée une demande normale, soumise aux règles d’approbation habituelles.',
    enabled: 'Activer Swipe',
    provider: 'Classement par IA',
    note: 'Facultatif : connectez un fournisseur d’IA pour classer les sélections et expliquer le choix d’un titre. Les sélections proviennent toujours des catalogues SeerrNG, et Swipe reste utilisable si le fournisseur est indisponible. Si cette option est activée, les titres, vos notes de goûts et votre historique Swipe sont envoyés au fournisseur.',
    none: 'Désactivé (ordre du catalogue)',
    anthropic: 'Anthropic Claude',
    openai: 'Serveur compatible OpenAI',
    model: 'Modèle',
    url: 'URL de base',
    effort: 'Niveau d’effort',
    key: 'Clé API',
    anthropicKey: 'Clé API Anthropic',
    saved: 'Clé enregistrée — vide = conserver',
    clear: 'Supprimer la clé API enregistrée',
    test: 'Tester le classement par IA',
    tested: 'Le fournisseur d’IA a répondu à la demande de test.',
    save: 'Enregistrer les modifications',
    saving: 'Enregistrement…',
    discard: 'Annuler les modifications',
    savedNotice: 'Paramètres de Swipe enregistrés.',
    failure: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
  },
  ar: {
    title: 'اكتشاف Swipe',
    pageTitle: 'إعدادات Swipe',
    back: 'الإدارة',
    description:
      'يعرض Swipe مجموعةً من الأفلام والمسلسلات والكتب استنادًا إلى طلباتك واختياراتك السابقة. يؤدي السحب إلى اليمين إلى إنشاء طلب عادي يخضع لقواعد الموافقة المعتادة.',
    enabled: 'تفعيل Swipe',
    provider: 'الترتيب بالذكاء الاصطناعي',
    note: 'اختياري: اربط مزوّدًا للذكاء الاصطناعي لترتيب العناصر وشرح سبب اختيار عنوان. تظل الاقتراحات مستمدة من فهارس SeerrNG، وتبقى ميزة Swipe متاحة عند تعذّر المزوّد. عند التفعيل، تُرسل العناوين وملاحظات التفضيلات وسجلّ Swipe إلى المزوّد.',
    none: 'معطّل (ترتيب الفهرس)',
    anthropic: 'Anthropic Claude',
    openai: 'خادم متوافق مع OpenAI',
    model: 'النموذج',
    url: 'عنوان URL الأساسي',
    effort: 'مستوى المعالجة',
    key: 'مفتاح API',
    anthropicKey: 'مفتاح API لـ Anthropic',
    saved: 'مفتاح محفوظ — اترك الحقل فارغًا للاحتفاظ به',
    clear: 'إزالة مفتاح API المحفوظ',
    test: 'اختبار الترتيب بالذكاء الاصطناعي',
    tested: 'استجاب مزوّد الذكاء الاصطناعي لطلب الاختبار.',
    save: 'حفظ التغييرات',
    saving: 'جارٍ الحفظ…',
    discard: 'تجاهل التغييرات',
    savedNotice: 'تم حفظ إعدادات Swipe.',
    failure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
  },
} as const;

test('Swipe settings follow the saved locale and preserve edits across failed saves', async ({
  page,
}) => {
  const locale = (
    ['en', 'fr', 'ar'].includes(process.env.LUMEN_SWIPE_LOCALE ?? '')
      ? process.env.LUMEN_SWIPE_LOCALE
      : 'en'
  ) as keyof typeof translations;
  const baseline = process.env.LUMEN_SWIPE_BASELINE === 'true';
  const labels = baseline ? translations.en : translations[locale];
  let state: Record<string, any> = {
    enabled: false,
    aiProvider: 'openai',
    aiModel: 'fixture-model',
    aiBaseUrl: 'https://model.internal/v1',
    aiEffort: 'low',
    aiApiKeyConfigured: true,
  };
  let failOnce = true;
  const writes: Record<string, any>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
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
      return route.fulfill({ json: { swipeEnabled: state.enabled } });
    if (path === '/settings/swipe/test')
      return route.fulfill({ json: { success: true } });
    if (path === '/settings/swipe') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as Record<string, any>;
        writes.push(body);
        if (failOnce) {
          failOnce = false;
          return route.fulfill({
            status: 503,
            json: { message: 'Service unavailable.' },
          });
        }
        state = { ...state, ...body };
      }
      return route.fulfill({ json: state });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/admin/swipe'));
  await expect(
    page.getByRole('heading', { name: labels.pageTitle, exact: true, level: 1 })
  ).toBeVisible();
  if (!baseline)
    await expect(
      page.getByRole('heading', { name: labels.title, exact: true, level: 2 })
    ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.back, exact: true })
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_SWIPE_CAPTURE)
    await page.screenshot({
      path: `${process.env.LUMEN_SWIPE_CAPTURE}/${baseline ? 'baseline' : 'candidate'}-${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  if (baseline) return;

  await expect(
    page.getByText(labels.description, { exact: true })
  ).toBeVisible();
  await expect(page.getByText(labels.note, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: labels.provider, exact: true })
  ).toHaveValue('openai');
  await expect(page.getByLabel(labels.model, { exact: true })).toHaveValue(
    'fixture-model'
  );
  await expect(page.getByLabel(labels.url, { exact: true })).toHaveValue(
    'https://model.internal/v1'
  );
  await expect(page.getByLabel(labels.key, { exact: true })).toHaveAttribute(
    'placeholder',
    labels.saved
  );
  const save = page.getByRole('button', { name: labels.save, exact: true });
  await page.getByLabel(labels.enabled, { exact: true }).check();
  await page.getByLabel(labels.model, { exact: true }).fill('changed-model');
  await page
    .getByRole('combobox', { name: labels.effort, exact: true })
    .selectOption('high');
  await page.getByRole('button', { name: labels.test, exact: true }).click();
  await expect(page.getByText(labels.tested, { exact: true })).toBeVisible();
  await save.click();
  await expect(page.getByRole('alert')).toContainText(labels.failure);
  await expect(page.getByLabel(labels.model, { exact: true })).toHaveValue(
    'changed-model'
  );
  await save.click();
  await expect(
    page.getByText(labels.savedNotice, { exact: false })
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({
    enabled: true,
    aiModel: 'changed-model',
    aiEffort: 'high',
    clearAiApiKey: false,
  });
  expect(writes[1]).not.toHaveProperty('aiApiKey');

  const provider = page.getByRole('combobox', {
    name: labels.provider,
    exact: true,
  });
  await provider.selectOption('anthropic');
  await expect(page.getByLabel(labels.model, { exact: true })).toHaveValue(
    'claude-opus-5-5'
  );
  await expect(
    page.getByLabel(labels.anthropicKey, { exact: true })
  ).toBeVisible();
  await provider.selectOption('openai');
  await expect(page.getByLabel(labels.model, { exact: true })).toHaveValue('');
  await expect(page.getByLabel(labels.url, { exact: true })).toBeVisible();
  await page
    .getByLabel(labels.model, { exact: true })
    .fill('discard-this-model');
  await page
    .getByLabel(labels.key, { exact: true })
    .fill('never-send-this-secret');
  await page.getByLabel(labels.clear, { exact: true }).check();
  await page.getByRole('button', { name: labels.discard, exact: true }).click();
  await expect(page.getByLabel(labels.model, { exact: true })).toHaveValue(
    'changed-model'
  );
  await expect(page.getByLabel(labels.key, { exact: true })).toHaveValue('');
  await expect(
    page.getByLabel(labels.clear, { exact: true })
  ).not.toBeChecked();
  await expect(save).toBeDisabled();
  expect(writes).toHaveLength(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
