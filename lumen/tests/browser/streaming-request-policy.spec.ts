import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

for (const allowOverride of [false, true]) {
  test(`movie detail respects streaming override eligibility (${allowOverride})`, async ({
    page,
  }) => {
    const submissions: Record<string, unknown>[] = [];
    const message = 'This movie is on a streaming service you subscribe to.';
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (path === '/movie/20')
        return route.fulfill({
          json: { id: 20, title: 'Example Movie', genres: [] },
        });
      if (path === '/request' && request.method() === 'POST') {
        const body = request.postDataJSON();
        submissions.push(body);
        if (body.bypassStreamingRequestPolicy)
          return route.fulfill({ status: 201, json: { id: 42 } });
        return route.fulfill({
          status: 403,
          json: {
            code: 'STREAMING_REQUEST_POLICY_REJECTED',
            allowOverride,
            message,
          },
        });
      }
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(testAppPath('/movie/20'));
    const request = page.getByRole('button', { name: 'Request', exact: true });
    const confirm = page.getByRole('alertdialog', {
      name: 'Streaming Request Policy',
    });
    await request.first().click();
    if (!allowOverride) {
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await expect(confirm).toHaveCount(0);
      expect(submissions).toHaveLength(1);
      expect(submissions[0]).not.toHaveProperty('bypassStreamingRequestPolicy');
      return;
    }
    await expect(confirm.getByText(message)).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    expect(submissions).toHaveLength(1);

    await request.first().click();
    await confirm.getByRole('button', { name: 'Request Anyway' }).click();
    await expect(page.getByText('Requested Example Movie')).toBeVisible();
    expect(submissions).toEqual([
      { mediaType: 'movie', mediaId: 20, is4k: false },
      { mediaType: 'movie', mediaId: 20, is4k: false },
      {
        mediaType: 'movie',
        mediaId: 20,
        is4k: false,
        bypassStreamingRequestPolicy: true,
      },
    ]);
  });
}
