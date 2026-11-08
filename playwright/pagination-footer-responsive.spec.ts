import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { restoreAdminPresentation } from './helpers/presentation';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
const routes = [
  ['requests', '/requests?userId=3'],
  ['legacy', '/users/3/requests'],
  ['issues', '/issues'],
  ['blocklist', '/blocklist'],
  ['logs', '/settings/logs'],
  ['software', '/requests?mediaType=game'],
] as const;
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [320, 390, 639, 640, 1440])
    for (const [kind, path] of routes)
      test(
        'shared pagination ' + kind + ' ' + theme + ' ' + width,
        async ({ page }, info) => {
          page.setDefaultTimeout(10000);
          await page.setViewportSize({ width, height: 900 });
          expect(
            (
              await page.request.post('/api/v1/auth/local', {
                data: { email: 'admin@seerr.dev', password: 'test1234' },
              })
            ).status()
          ).toBe(200);
          expect(
            (
              await page.request.post('/api/v1/user/1/settings/main', {
                data: { locale: 'en' },
              })
            ).status()
          ).toBe(200);
          expect(
            (
              await page.request.post(
                '/api/v1/user/1/settings/interface-theme',
                { data: { theme } }
              )
            ).status()
          ).toBe(200);
          // Paged API replays isolate footer layout and callbacks, not provider pagination.
          const pageInfo = { page: 1, pages: 3, pageSize: 10, results: 30 };
          const counts = {
            total: 0,
            active: 0,
            incomplete: 0,
            attention: 0,
            completed: 0,
            unavailable: 0,
            failed: 0,
          };
          const empty = {
            pageInfo,
            results: [],
            counts,
            olderCount: 0,
            serviceErrors: { radarr: [], sonarr: [], lidarr: [], readarr: [] },
          };
          for (const endpoint of [
            '/api/v1/request/status',
            '/api/v1/request',
            '/api/v1/issue',
            '/api/v1/blocklist/',
            '/api/v1/settings/logs',
          ])
            await page.route(
              (u) => u.pathname === endpoint,
              (r) => r.fulfill({ json: empty })
            );
          await page.route(
            (u) => u.pathname === '/api/v1/request/software/status',
            (r) =>
              r.fulfill({
                json: {
                  pageInfo,
                  results:
                    kind === 'software'
                      ? [
                          {
                            request: {
                              id: 608,
                              category: 'game',
                              provider: 'questarr',
                              status: 'pending',
                              title: 'Synthetic pagination fixture',
                              createdAt: '2026-11-08T00:00:00Z',
                              requestedBy: {
                                id: 1,
                                displayName: 'Admin',
                                avatar: '',
                              },
                            },
                            status: 'pending',
                            message: null,
                            assets: [],
                          },
                        ]
                      : [],
                },
              })
          );
          await page.goto(path);
          const footer = page.getByRole('navigation', {
            name: 'Pagination',
            exact: true,
          });
          await expect(footer).toBeVisible();
          await footer.scrollIntoViewIfNeeded();
          await page.evaluate(() => document.fonts.ready);
          const geometry = await footer.evaluate((node) => {
            const rect = (el: Element) => {
              const r = el.getBoundingClientRect();
              return {
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
                width: r.width,
                height: r.height,
              };
            };
            return {
              footer: rect(node),
              size: rect(node.querySelector('.pagination-footer-page-size')!),
              page: rect(node.querySelector('.pagination-footer-page')!),
              actions: rect(node.querySelector('.pagination-footer-actions')!),
              buttons: [
                ...node.querySelectorAll('.pagination-footer-actions button'),
              ].map(rect),
              viewport: innerWidth,
            };
          });
          writeFileSync(
            info.outputPath('geometry.json'),
            JSON.stringify(geometry)
          );
          await info.attach('geometry', {
            body: JSON.stringify(geometry),
            contentType: 'application/json',
          });
          await page.screenshot({
            path: info.outputPath('pagination.png'),
            fullPage: false,
          });
          const boxes = [geometry.size, geometry.page, geometry.actions];
          for (let i = 0; i < boxes.length; i++) {
            expect(boxes[i].left).toBeGreaterThanOrEqual(
              geometry.footer.left - 1
            );
            expect(boxes[i].right).toBeLessThanOrEqual(
              geometry.footer.right + 1
            );
            for (let j = i + 1; j < boxes.length; j++) {
              const x =
                  Math.min(boxes[i].right, boxes[j].right) -
                  Math.max(boxes[i].left, boxes[j].left),
                y =
                  Math.min(boxes[i].bottom, boxes[j].bottom) -
                  Math.max(boxes[i].top, boxes[j].top);
              expect(
                x > 1 && y > 1,
                'pagination regions overlap: ' +
                  JSON.stringify({ kind, theme, width, geometry })
              ).toBe(false);
            }
          }
          for (const b of geometry.buttons) {
            expect(b.height).toBeGreaterThan(10);
            expect(b.right).toBeLessThanOrEqual(geometry.viewport + 1);
          }
          if (width < 640) {
            expect(geometry.page.top).toBeGreaterThanOrEqual(
              geometry.size.bottom
            );
            expect(geometry.actions.top).toBeGreaterThanOrEqual(
              geometry.page.bottom
            );
          }
          {
            await footer
              .getByRole('button', { name: 'Next', exact: true })
              .click();
            await expect(footer.locator('.pagination-footer-page')).toHaveText(
              'Page 2 of 3'
            );
            await footer
              .getByRole('button', { name: 'Previous', exact: true })
              .click();
            await expect(footer.locator('.pagination-footer-page')).toHaveText(
              'Page 1 of 3'
            );
            if (width === 1440 && kind !== 'software') {
              await footer
                .getByRole('button', { name: 'Results Per Page', exact: true })
                .click();
              await page
                .getByRole('option', { name: '50', exact: true })
                .click();
              await expect(
                footer.getByRole('button', {
                  name: 'Results Per Page',
                  exact: true,
                })
              ).toContainText('50');
            }
          }
        }
      );
