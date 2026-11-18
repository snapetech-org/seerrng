import { expect, test } from '@playwright/test';

for (const media of ['movie', 'tv']) {
  test(`full ${media} credits preserve person links and switch panels`, async ({
    page,
  }) => {
    const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
    await page.route('**/api/v1/**', (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (pathname.endsWith('/settings/public'))
        return route.fulfill({ json: { initialized: true } });
      if (pathname.endsWith(`/${media}/42`))
        return route.fulfill({
          json: {
            id: 42,
            title: media === 'movie' ? 'Fixture Film' : undefined,
            name: media === 'tv' ? 'Fixture Series' : undefined,
            credits: {
              cast: Array.from({ length: 13 }, (_, i) => ({
                id: i + 1,
                name: `Actor ${i + 1}`,
                character: 'Role',
              })),
              crew: [{ id: 50, name: 'Fixture Director', job: 'Director' }],
            },
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto(`${mount}/${media}/42/cast`);
    await expect(
      page.getByRole('heading', { name: 'Cast', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Actor 13 Role' })
    ).toHaveAttribute('href', `${mount}/person/13`);
    await page.getByRole('link', { name: 'View Crew' }).click();
    await expect(page).toHaveURL(`${mount}/${media}/42/crew`);
    await expect(
      page.getByRole('link', { name: 'Fixture Director Director' })
    ).toHaveAttribute('href', `${mount}/person/50`);
    await expect(
      page.getByRole('link', { name: 'Back to Details' })
    ).toHaveAttribute('href', `${mount}/${media}/42`);
  });
}
