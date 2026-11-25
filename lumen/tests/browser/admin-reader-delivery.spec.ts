import { expect, test } from '@playwright/test';

test('reader delivery saves preferences, tests a saved connection, and removes a managed shelf', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/reader-delivery';
  let saved = {
    grimmoryUrl: 'https://reader.example.test/books',
    grimmoryUsername: 'reader',
    grimmoryPassword: '[REDACTED]',
    bookorbitUrl: 'https://orbit.example.test',
    bookorbitUsername: '',
    bookorbitPassword: '',
    preferredProvider: 'grimmory',
  };
  let deleteCount = 0;
  let rejectDelete = true;
  let removedFromList = false;
  let staleDeleteReadback = false;
  let reject = true;
  let staleReadback: typeof saved | undefined;
  let saveCount = 0;
  const changes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (pathname === path + '/connection-test') {
      expect(request.postDataJSON()).toEqual({ provider: 'bookorbit' });
      return route.fulfill({
        json: { connected: true, existingGroupingCount: 1 },
      });
    }
    if (pathname === path + '/groupings/17') {
      expect(request.method()).toBe('DELETE');
      deleteCount++;
      if (rejectDelete) {
        rejectDelete = false;
        return route.fulfill({
          status: 502,
          json: { message: 'Reader provider unavailable.' },
        });
      }
      if (!removedFromList) {
        removedFromList = true;
        staleDeleteReadback = true;
      }
      return route.fulfill({ json: { deleted: true } });
    }
    if (pathname === path + '/groupings') {
      if (staleDeleteReadback) {
        staleDeleteReadback = false;
        return route.fulfill({
          json: [
            {
              id: 17,
              provider: 'bookorbit',
              groupName: 'Fixture Shelf',
              targetName: 'Fixture Author',
              isPublic: false,
              status: 'ready',
              lastMatchCount: 2,
              countVerified: true,
            },
          ],
        });
      }
      return route.fulfill({
        json: removedFromList
          ? []
          : [
              {
                id: 17,
                provider: 'bookorbit',
                groupName: 'Fixture Shelf',
                targetName: 'Fixture Author',
                isPublic: false,
                status: 'ready',
                lastMatchCount: 2,
                countVerified: true,
              },
            ],
      });
    }
    if (pathname !== path) return route.fulfill({ json: {} });
    if (request.method() === 'GET') {
      if (staleReadback) {
        const stale = staleReadback;
        staleReadback = undefined;
        return route.fulfill({ json: stale });
      }
      return route.fulfill({ json: saved });
    }
    if (request.method() === 'PUT') {
      const change = request.postDataJSON();
      changes.push(change);
      if (reject)
        return route.fulfill({
          status: 400,
          json: { error: 'Reader settings rejected.' },
        });
      if (saveCount === 0) staleReadback = saved;
      saved = { ...saved, ...change };
      if (change.clearGrimmoryCredentials) {
        saved.grimmoryUsername = '';
        saved.grimmoryPassword = '';
      }
      if (change.clearBookorbitCredentials) {
        saved.bookorbitUsername = '';
        saved.bookorbitPassword = '';
      }
      saveCount++;
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Open Reader Delivery' }).click();
  await expect(page.getByLabel('Grimmory Password')).toHaveValue('');
  await expect(page.getByLabel('Grimmory OPDS Catalog')).toHaveValue(
    'https://reader.example.test/books/api/v1/opds'
  );
  await expect(page.getByText('Fixture Shelf', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('configured.png'),
    fullPage: true,
  });
  const preferred = page.getByLabel('Preferred Reader App');
  const testAccess = page.getByRole('button', {
    name: 'Test BookOrbit Grouping Access',
  });
  const save = page.getByRole('button', { name: 'Save Reader Settings' });
  await preferred.selectOption('bookorbit');
  await expect(testAccess).toBeDisabled();
  await save.click();
  await expect(page.getByRole('alert')).toHaveText('Reader settings rejected.');
  await expect(preferred).toHaveValue('bookorbit');
  reject = false;
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Reader settings could not be saved.'
  );
  await expect(preferred).toHaveValue('bookorbit');
  await page.getByRole('alert').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('readback-failure.png') });
  await save.click();
  await expect(page.getByText('Reader settings saved.')).toBeVisible();
  expect(changes[2]).not.toHaveProperty('grimmoryPassword');
  expect(changes[2]).not.toHaveProperty('bookorbitPassword');
  await testAccess.click();
  await expect(
    page.getByText('BookOrbit connected.', { exact: false })
  ).toBeVisible();
  const remove = page.getByRole('button', { name: 'Remove Shelf' });
  await remove.click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: 'Keep it' }).click();
  expect(deleteCount).toBe(0);
  await remove.click();
  await confirm.getByRole('button', { name: 'Remove Shelf' }).click();
  await expect(confirm.getByRole('alert')).toHaveText(
    'Reader provider unavailable.'
  );
  await expect(confirm).toBeVisible();
  await expect(page.getByText('Fixture Shelf', { exact: true })).toBeVisible();
  if (process.env.LUMEN_CAPTURE_READER_SHELF_DELETE)
    await page.screenshot({
      path: info.outputPath('delete-provider-failure.png'),
    });
  await confirm.getByRole('button', { name: 'Remove Shelf' }).click();
  await expect(confirm.getByRole('alert')).toHaveText(
    'Could not confirm the managed shelf was removed. Keep this dialog open and try again.'
  );
  await expect(confirm).toBeVisible();
  if (process.env.LUMEN_CAPTURE_READER_SHELF_DELETE)
    await page.screenshot({
      path: info.outputPath('delete-stale-readback.png'),
    });
  await confirm.getByRole('button', { name: 'Remove Shelf' }).click();
  await expect(page.getByText('No managed reader shelves.')).toBeVisible();
  expect(deleteCount).toBe(3);
});
