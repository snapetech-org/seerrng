import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, info: TestInfo) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/following-${info.project.name}.png`,
    fullPage: true,
  });
}

test('Following translates feed controls and event reasons', async ({
  page,
}, info) => {
  const locale = process.env.LUMEN_DISCOVERY_LOCALE === 'ar' ? 'ar' : 'fr';
  const candidate = process.env.LUMEN_CAPTURE_MODE === 'candidate';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/follow/events/count')
      return route.fulfill({ json: { unseen: 1 } });
    if (path === '/follow/events')
      return route.fulfill({
        json: {
          total: 1,
          results: [
            {
              id: 1,
              title: 'New Story Expansion',
              seen: false,
              follow: { subjectLabel: 'Fixture Game', kind: 'expansion' },
              reasonKey: 'newExpansion',
              reasonValues: { game: 'Fixture Game' },
              target: { mediaType: 'game', id: '42' },
            },
          ],
        },
      });
    if (path === '/follow')
      return route.fulfill({
        json: {
          results: [
            {
              id: 2,
              kind: 'author',
              subjectLabel: 'Example Author',
              notify: true,
              autoRequest: false,
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/following');
  const text = (english: string, french: string, arabic: string) =>
    candidate ? (locale === 'ar' ? arabic : french) : english;
  await expect(
    page.getByRole('heading', {
      name: text('Following', 'Suivis', 'المتابَع'),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: text('Updates', 'Mises à jour', 'التحديثات'),
    })
  ).toBeVisible();
  await expect(
    page.getByText(
      text(
        'New content for Fixture Game: New Story Expansion.',
        'Nouveau contenu pour Fixture Game : New Story Expansion.',
        'محتوى جديد للعبة Fixture Game: New Story Expansion.'
      )
    )
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: text(
        'Mark Seen: New Story Expansion',
        'Marquer comme vu : New Story Expansion',
        'وضع علامة تمت المشاهدة: New Story Expansion'
      ),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: text('What You Follow', 'Vos abonnements', 'ما تتابعه'),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', {
      name: text('Notify Me', 'M’avertir', 'أرسل لي إشعارًا'),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', {
      name: text(
        'Request Automatically',
        'Demander automatiquement',
        'اطلب تلقائيًا'
      ),
    })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await capture(page, info);
});
