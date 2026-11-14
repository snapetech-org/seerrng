import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

type RequestBody = { mediaType: string; mediaId: number };
type LayoutEvidence = { overflow: number[]; columns: number };

async function fixtures(page: Page) {
  const requestBodies: RequestBody[] = [];
  const upcoming = Array.from({ length: 6 }, (_, i) => ({
    id: 900 + i,
    title: `Upcoming Movie ${i + 1}`,
    mediaType: 'movie',
    releaseDate: '2027-03-15',
  }));
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { defaults: { requestOptions: false } } })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'test', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          movie4kEnabled: false,
          series4kEnabled: false,
        },
      });
    if (path === '/request' && route.request().method() === 'POST') {
      requestBodies.push(route.request().postDataJSON() as RequestBody);
      return route.fulfill({ json: { id: 42 } });
    }
    return route.fulfill({
      json: paged(path === '/discover/movies/upcoming' ? upcoming : []),
    });
  });
  return requestBodies;
}

async function inspectLayout(page: Page): Promise<LayoutEvidence> {
  return page
    .locator('.sl')
    .first()
    .evaluate((grid) => {
      const cards = Array.from(grid.querySelectorAll<HTMLElement>('.si'));
      const overflow = cards.flatMap((card, index) => {
        const button = card.querySelector<HTMLButtonElement>('.act button');
        if (!button) return [index];
        const outer = card.getBoundingClientRect();
        const inner = button.getBoundingClientRect();
        return inner.left < outer.left - 1 || inner.right > outer.right + 1
          ? [index]
          : [];
      });
      return {
        overflow,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      };
    });
}

test('Coming Soon fits Request buttons in tablet landscape and preserves requests', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'tablet', 'tablet layout only');
  const requestBodies = await fixtures(page);
  const configLoaded = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/lumen-config.json'
  );
  await page.goto('/soon');
  await configLoaded;
  await expect(page.locator('.si')).toHaveCount(6);
  await expect(page.locator('.si .act button')).toHaveCount(6);

  const widths = [1024, 1039, 1040, 1112, 1180, 1194, 1280, 1319, 1320, 1366];
  const measurements: {
    width: number;
    height: number;
    baselineCapture: string;
    candidateCapture: string;
    baseline: LayoutEvidence;
    candidate: LayoutEvidence;
  }[] = [];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 820 });

    // Recreate the pre-fix CSS from the PR base: desktop Coming Soon uses three
    // columns from 1040px onward, and .btn retains its shared nowrap behavior.
    // Keep the base's two-line title wrapping from #658 in both captures.
    const baselineStyles = await page.addStyleTag({
      content: `
          @media (min-width: 1040px) {
            .sl { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          }
          .si .act .btn { max-width: none !important; white-space: nowrap !important; }
        `,
    });
    await page.screenshot({
      path: info.outputPath(`coming-soon-baseline-${width}.png`),
      fullPage: true,
    });
    const baseline = await inspectLayout(page);
    expect(baseline.columns).toBe(width < 1040 ? 2 : 3);
    if (width === 1194) expect(baseline.overflow).toHaveLength(6);
    await baselineStyles.evaluate((style) => style.remove());

    await page.screenshot({
      path: info.outputPath(`coming-soon-candidate-${width}.png`),
      fullPage: true,
    });
    const candidate = await inspectLayout(page);
    expect(candidate.overflow, `button overflow at ${width}px`).toEqual([]);
    expect(candidate.columns).toBe(width < 1320 ? 2 : 3);
    measurements.push({
      width,
      height: 820,
      baselineCapture: `coming-soon-baseline-${width}.png`,
      candidateCapture: `coming-soon-candidate-${width}.png`,
      baseline,
      candidate,
    });
  }

  await writeFile(
    info.outputPath('coming-soon-layout-measurements.json'),
    JSON.stringify(
      {
        route: '/soon',
        state: 'authenticated dark-theme fixture with six upcoming movies',
        project: info.project.name,
        deviceScaleFactor: 2,
        baselineCommit: '2c22b506557afc5bc550f1eb1c3e4c48bdc3f439',
        baseline:
          'PR base after #658 and #656: three desktop columns, shared nowrap buttons, and two-line card titles',
        candidate:
          'PR CSS: two columns 1040–1319px; shared data-label-wrap button variant',
        measurements,
      },
      null,
      2
    )
  );

  await page.setViewportSize({ width: 1040, height: 820 });
  const requestButton = page.locator('.si').first().getByRole('button', {
    name: 'Request',
  });
  await expect(requestButton).toBeVisible();
  await requestButton.click();
  await expect.poll(() => requestBodies.length).toBe(1);
  expect(requestBodies[0]).toEqual({ mediaType: 'movie', mediaId: 900 });
  await expect(page.getByText('Requested').first()).toBeVisible();
});
