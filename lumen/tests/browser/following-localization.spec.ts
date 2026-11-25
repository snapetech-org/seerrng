import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, info: TestInfo) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/following-${info.project.name}.png`,
    animations: 'disabled',
  });
}

test('Following translates feed controls and event reasons', async ({
  page,
}, info) => {
  const locale = process.env.LUMEN_DISCOVERY_LOCALE === 'ar' ? 'ar' : 'fr';
  const candidate = process.env.LUMEN_CAPTURE_MODE !== 'baseline';
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
      name: text('New for You', 'Nouveautés pour vous', 'جديد لك'),
    })
  ).toBeVisible();
  await expect(
    page.getByText(
      text(
        'Personal news about the people, production companies, networks, genres, narrators, series, games, artists, and projects you follow. Each item explains why it appeared.',
        'Actualités personnelles sur les personnes, sociétés de production, réseaux, genres, narrateurs, séries, jeux, artistes et projets que vous suivez. Chaque élément explique sa présence ici.',
        'أخبار شخصية عن الأشخاص وشركات الإنتاج والشبكات والأنواع والرواة والمسلسلات والألعاب والفنانين والمشاريع التي تتابعها. يوضح كل عنصر سبب ظهوره هنا.'
      )
    )
  ).toBeVisible();
  const how = page.getByText(
    text(
      'How Following Works',
      'Fonctionnement du suivi',
      'كيف تعمل ميزة المتابعة'
    ),
    { exact: true }
  );
  await expect(how).toBeVisible();
  await expect(how.locator('xpath=..')).not.toHaveAttribute('open');
  await how.click();
  await expect(
    page.getByText(
      text(
        'The first check can show up to three current upcoming titles per media type; later checks add new recent or upcoming items.',
        "La première vérification peut afficher jusqu'à trois titres à venir par type de média. Les vérifications suivantes ajoutent des nouveautés récentes ou à venir.",
        'قد يعرض الفحص الأول ما يصل إلى ثلاثة عناوين قادمة لكل نوع وسائط؛ وتضيف الفحوص اللاحقة عناصر جديدة حديثة أو قادمة.'
      )
    )
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
