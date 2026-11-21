import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('Connection Hosts follow the saved locale and preserve edits through failures', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_HOSTS_LOCALE ?? ''
  )
    ? (process.env.LUMEN_HOSTS_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const baseline = process.env.LUMEN_HOSTS_BASELINE === 'true';
  const translated = {
    en: {
      title: 'Connection Hosts',
      back: 'Back to Account',
      section: 'Saved Hosts',
      description:
        'Save hostnames or IP addresses to reuse in service settings. Reusing a saved address changes only the hostname or IP, without a scheme or port. It does not test or connect to the host.',
      empty: 'No connection hosts saved.',
      name: 'Name',
      hostname: 'Hostname',
      removeHost: 'Remove host 1',
      removeHost2: 'Remove host 2',
      remove: 'Remove Host',
      add: 'Add Host',
      save: 'Save Changes',
      discard: 'Discard Changes',
      saved: 'Connection hosts saved.',
      failure: 'The server had a problem. Try again in a moment.',
      duplicate: 'Saved host names must be unique.',
    },
    fr: {
      title: 'Hôtes de connexion',
      back: 'Retour au compte',
      section: 'Hôtes enregistrés',
      description:
        'Enregistrez des noms d’hôte ou des adresses IP pour les réutiliser dans les paramètres des services. Une adresse enregistrée ne remplace que le nom d’hôte ou l’adresse IP, sans schéma ni port. La connexion n’est ni testée ni établie.',
      empty: 'Aucun hôte de connexion enregistré.',
      name: 'Nom',
      hostname: 'Nom d’hôte',
      removeHost: 'Supprimer l’hôte 1',
      removeHost2: 'Supprimer l’hôte 2',
      remove: 'Supprimer',
      add: 'Ajouter',
      save: 'Enregistrer',
      discard: 'Annuler',
      saved: 'Hôtes de connexion enregistrés.',
      failure: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
      duplicate: 'Les noms des hôtes enregistrés doivent être uniques.',
    },
    ar: {
      title: 'مضيفو الاتصال',
      back: 'العودة إلى الحساب',
      section: 'المضيفون المحفوظون',
      description:
        'احفظ أسماء المضيفين أو عناوين IP لإعادة استخدامها في إعدادات الخدمات. لا يغيّر استخدام عنوان محفوظ سوى اسم المضيف أو عنوان IP، من دون مخطط أو منفذ. لا يختبر الاتصال بالمضيف ولا يتصل به.',
      empty: 'لا توجد مضيفات اتصال محفوظة.',
      name: 'الاسم',
      hostname: 'اسم المضيف',
      removeHost: 'إزالة المضيف 1',
      removeHost2: 'إزالة المضيف 2',
      remove: 'إزالة',
      add: 'إضافة',
      save: 'حفظ',
      discard: 'تراجع',
      saved: 'تم حفظ مضيفات الاتصال.',
      failure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
      duplicate: 'يجب أن تكون أسماء المضيفين المحفوظة فريدة.',
    },
  }[locale];
  const labels = baseline
    ? {
        ...translated,
        title: 'Connection Hosts',
        back: 'Back to Account',
        section: 'Saved Hosts',
        description:
          'Save hostnames or IP addresses to reuse in service settings. Enter the address without a scheme or port.',
        name: 'Name',
        hostname: 'Hostname',
        removeHost: 'Remove Host 1',
        removeHost2: 'Remove Host 2',
        remove: 'Remove Host',
        add: 'Add Host',
        save: 'Save Changes',
        discard: 'Discard Changes',
        saved: 'Connection hosts saved.',
      }
    : translated;
  let hosts = [{ name: 'Docker network', hostname: 'media-stack' }];
  let failOnce = true;
  const writes: { hosts: { name: string; hostname: string }[] }[] = [];

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/lumen/,
      ''
    );
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/settings/public'))
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    if (path.endsWith('/settings/connection-hosts')) {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as {
          hosts: { name: string; hostname: string }[];
        };
        writes.push(body);
        if (failOnce) {
          failOnce = false;
          return route.fulfill({
            status: 503,
            json: { message: 'Service unavailable.' },
          });
        }
        if (
          new Set(body.hosts.map(({ name }) => name.toLowerCase())).size !==
          body.hosts.length
        )
          return route.fulfill({
            status: 400,
            json: { message: 'Saved host names must be unique.' },
          });
        hosts = body.hosts;
      }
      return route.fulfill({ json: hosts });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/admin/connection-hosts'));
  await expect(
    page.getByRole('heading', { name: labels.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels.back, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.section, exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(labels.description, { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue(
    'Docker network'
  );
  await expect(page.getByLabel(labels.hostname, { exact: true })).toHaveValue(
    'media-stack'
  );
  await expect(
    page.getByRole('button', { name: labels.removeHost, exact: true })
  ).toBeVisible();
  if (process.env.LUMEN_HOSTS_CAPTURE)
    await page.screenshot({
      path: `${process.env.LUMEN_HOSTS_CAPTURE}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (baseline) return;

  const name = page.getByLabel(labels.name, { exact: true });
  const hostname = page.getByLabel(labels.hostname, { exact: true });
  await name.fill('Changed network');
  await hostname.fill('new-media-stack');
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(labels.failure);
  await expect(name).toHaveValue('Changed network');
  await expect(hostname).toHaveValue('new-media-stack');
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.getByText(labels.saved, { exact: true })).toBeVisible();
  expect(hosts).toEqual([
    { name: 'Changed network', hostname: 'new-media-stack' },
  ]);

  await page.getByRole('button', { name: labels.add, exact: true }).click();
  const names = page.getByLabel(labels.name, { exact: true });
  const hostnames = page.getByLabel(labels.hostname, { exact: true });
  await expect(names).toHaveCount(2);
  await names.nth(1).fill('Changed network');
  await hostnames.nth(1).fill('duplicate-host');
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(labels.duplicate);
  await expect(names.nth(1)).toHaveValue('Changed network');
  await expect(hostnames.nth(1)).toHaveValue('duplicate-host');
  await page.getByRole('button', { name: labels.discard, exact: true }).click();
  await expect(names).toHaveCount(1);

  await page.getByRole('button', { name: labels.add, exact: true }).click();
  await expect(names).toHaveCount(2);
  await names.nth(1).fill('Temporary');
  await hostnames.nth(1).fill('temporary-host');
  await page
    .getByRole('button', { name: labels.removeHost2, exact: true })
    .click();
  await expect(names).toHaveCount(1);
  await name.fill('Discarded name');
  await page.getByRole('button', { name: labels.discard, exact: true }).click();
  await expect(name).toHaveValue('Changed network');
  await page.getByRole('button', { name: labels.add, exact: true }).click();
  await names.nth(1).fill('Second host');
  await hostnames.nth(1).fill('second-media-stack');
  await page
    .getByRole('button', { name: labels.removeHost, exact: true })
    .click();
  await expect(names).toHaveCount(1);
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.getByText(labels.saved, { exact: true })).toBeVisible();
  expect(writes).toEqual([
    {
      hosts: [{ name: 'Changed network', hostname: 'new-media-stack' }],
    },
    {
      hosts: [{ name: 'Changed network', hostname: 'new-media-stack' }],
    },
    {
      hosts: [
        { name: 'Changed network', hostname: 'new-media-stack' },
        { name: 'Changed network', hostname: 'duplicate-host' },
      ],
    },
    {
      hosts: [{ name: 'Second host', hostname: 'second-media-stack' }],
    },
  ]);
  await page.reload();
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue(
    'Second host'
  );
  await expect(page.getByLabel(labels.hostname, { exact: true })).toHaveValue(
    'second-media-stack'
  );
  await page
    .getByRole('button', { name: labels.removeHost, exact: true })
    .click();
  await page.getByRole('button', { name: labels.save, exact: true }).click();
  await expect(page.getByText(labels.empty, { exact: true })).toBeVisible();
  await expect(page.getByText(labels.saved, { exact: true })).toBeVisible();
  expect(writes.at(-1)).toEqual({ hosts: [] });
});
