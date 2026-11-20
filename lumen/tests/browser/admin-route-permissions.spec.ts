import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const routerSource = readFileSync(
  new URL('../../src/main.tsx', import.meta.url),
  'utf8'
);
const routePatterns = [
  ...routerSource.matchAll(/<Route\s+path="(\/admin[^"]*)"/g),
].map(([, path]) => path);

function expandRoute(pattern: string): string[] {
  return pattern.split('/').reduce<string[]>(
    (routes, segment) => {
      if (!segment) return routes;
      if (!segment.startsWith(':'))
        return routes.map((route) => `${route}/${segment}`);
      const optional = segment.endsWith('?');
      const value = segment.slice(1, optional ? -1 : undefined);
      const sample = value === 'userId' ? '1' : 'webhook';
      return [
        ...(optional ? routes : []),
        ...routes.map((route) => `${route}/${sample}`),
      ];
    },
    ['']
  );
}

const administratorRoutes = [...new Set(routePatterns.flatMap(expandRoute))];

test('every administrator route denies direct access to a standard user', async ({
  page,
}) => {
  expect(routePatterns.length).toBeGreaterThan(0);
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith('/auth/me')
        ? { id: 7, displayName: 'Viewer', permissions: 32 }
        : path.endsWith('/settings/public')
          ? { mediaServerType: 1 }
          : {},
    });
  });

  for (const route of administratorRoutes) {
    await page.goto(appPath(route));
    await expect(page).toHaveURL(new RegExp(`${appPath('/me')}$`));
  }
});
