import { expect, test } from '@playwright/test';

const locale = (
  ['en', 'fr', 'ar'].includes(process.env.LUMEN_RECOGNITION_LOCALE ?? '')
    ? process.env.LUMEN_RECOGNITION_LOCALE
    : 'en'
) as 'en' | 'fr' | 'ar';
const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const labels = {
  en: {
    page: 'Share and Image Recognition',
    section: 'Share to Request',
    enabled: 'Enable Share to Request',
    localOcr: 'Read Images With Local Text Recognition',
    ocr: 'Tesseract is available.',
    provider: 'Vision Provider',
    baseUrl: 'Base URL',
    key: 'API Key',
    savedCredential: 'Saved',
    savedKey: 'Remove Saved API Key',
    consent: 'Allow Uploaded Images to Be Sent to This Provider',
    maxImage: 'Largest Image (MiB)',
    save: 'Save Changes',
    discard: 'Discard Changes',
    saved: 'Recognition settings saved.',
  },
  fr: {
    page: 'Partage et reconnaissance d’images',
    section: 'Partager pour demander',
    enabled: 'Activer le partage pour demander',
    localOcr: 'Lire les images avec la reconnaissance de texte locale',
    ocr: 'Tesseract est disponible.',
    provider: 'Fournisseur de vision',
    baseUrl: 'URL de base',
    key: 'Clé API',
    savedCredential: 'Enregistrée',
    savedKey: 'Supprimer la clé API enregistrée',
    consent: 'Autoriser l’envoi des images téléversées à ce fournisseur',
    maxImage: 'Taille maximale de l’image (Mio)',
    save: 'Enregistrer les modifications',
    discard: 'Annuler les modifications',
    saved: 'Paramètres de reconnaissance enregistrés.',
  },
  ar: {
    page: 'المشاركة والتعرّف على الصور',
    section: 'المشاركة لتقديم طلب',
    enabled: 'تفعيل المشاركة لتقديم طلب',
    localOcr: 'قراءة الصور بالتعرّف المحلي على النصوص',
    ocr: 'Tesseract متاح.',
    provider: 'موفّر الرؤية',
    baseUrl: 'عنوان URL الأساسي',
    key: 'مفتاح API',
    savedCredential: 'محفوظ',
    savedKey: 'إزالة مفتاح API المحفوظ',
    consent: 'السماح بإرسال الصور المرفوعة إلى هذا الموفّر',
    maxImage: 'أكبر حجم للصورة (ميبي بايت)',
    save: 'حفظ التغييرات',
    discard: 'تجاهل التغييرات',
    saved: 'تم حفظ إعدادات التعرّف.',
  },
} as const;

test('recognition settings retain edits after rejection and handle saved API keys', async ({
  page,
}, info) => {
  const text = labels[locale];
  const settingsPath = '/api/v1/settings/recognition';
  let saved = {
    enabled: true,
    localOcr: true,
    visionProvider: 'openai',
    visionModel: 'fixture-model',
    visionBaseUrl: 'https://recognition.example.test/v1',
    visionApiKey: '[REDACTED]',
    visionApiKeyConfigured: true,
    externalConsent: true,
    maxImageBytes: 6 * 1024 * 1024,
  };
  const writes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/lumen(?=\/)/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/resolve/capabilities'))
      return route.fulfill({ json: { localOcr: true } });
    if (path !== settingsPath) return route.fulfill({ json: {} });
    if (request.method() === 'PUT') {
      const change = request.postDataJSON();
      writes.push(change);
      if (!change.externalConsent) {
        return route.fulfill({
          status: 400,
          json: { error: 'Confirm that uploaded images may be sent.' },
        });
      }
      saved = { ...saved, ...change };
      if (change.clearVisionApiKey) {
        saved.visionApiKey = '';
        saved.visionApiKeyConfigured = false;
      }
    }
    return route.fulfill({ json: saved });
  });
  await page.goto(appPath('/admin'));
  await page
    .getByRole('link', { name: 'Open Share and Image Recognition' })
    .click();
  await expect(page.getByRole('heading', { name: text.page })).toBeVisible();
  await expect(page.getByRole('heading', { name: text.section })).toBeVisible();
  await expect(page.getByLabel(text.enabled)).toBeChecked();
  await expect(page.getByText(text.ocr)).toBeVisible();
  await expect(page.getByLabel(text.maxImage)).toBeVisible();
  await expect(page.getByLabel(text.provider)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  const key = page.getByLabel(text.key, { exact: true });
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', text.savedCredential);
  await page.screenshot({
    path: info.outputPath('configured.png'),
    fullPage: true,
  });
  const base = page.getByLabel(text.baseUrl);
  const consent = page.getByLabel(text.consent);
  await base.fill('https://new-recognition.example.test/v1');
  await expect(consent).not.toBeChecked();
  const save = page.getByRole('button', { name: text.save });
  await save.click();
  await expect(page.getByRole('alert')).toContainText(
    'Confirm that uploaded images may be sent.'
  );
  await expect(base).toHaveValue('https://new-recognition.example.test/v1');
  await consent.check();
  await save.click();
  await expect(page.getByText(text.saved)).toBeVisible();
  await expect(save).toBeDisabled();
  expect(writes.every((write) => !('visionApiKey' in write))).toBe(true);
  expect(writes[1]).toMatchObject({
    visionBaseUrl: 'https://new-recognition.example.test/v1',
    externalConsent: true,
  });
  await page.getByLabel(text.savedKey).check();
  await expect(key).toBeDisabled();
  await save.click();
  await expect(page.getByLabel(text.savedKey)).toHaveCount(0);
  expect(writes[2]).toHaveProperty('clearVisionApiKey', true);
  await page.getByLabel(text.provider).selectOption('none');
  await expect(key).toHaveCount(0);
  await page.getByRole('button', { name: text.discard }).click();
  await expect(key).toBeVisible();
  await expect(save).toBeDisabled();
});

test('non-administrators cannot open or load recognition settings', async ({
  page,
}) => {
  let reads = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/settings/recognition')) reads++;
    return route.fulfill({
      json: path.endsWith('/auth/me') ? { id: 1, permissions: 32 } : {},
    });
  });
  await page.goto(appPath('/admin/recognition'));
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole('link', { name: 'Open Share and Image Recognition' })
  ).toHaveCount(0);
  expect(reads).toBe(0);
});
