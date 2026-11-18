import { expect, test } from '@playwright/test';

for (const permissions of [4194304, 2097152, 32]) {
  test(`issue discussion follows account permissions ${permissions}`, async ({
    page,
  }) => {
    let reads = 0;
    let status = 1;
    const comments = [
      { id: 1, message: 'Playback freezes', createdAt: '2026-11-12T00:00:00Z' },
    ];
    const issue = () => ({
      id: 7,
      status,
      issueType: 1,
      createdBy: { id: 2, displayName: 'Viewer' },
      createdAt: '2026-11-12T00:00:00Z',
      comments,
      problemEpisodeSelections: [
        { seasonNumber: 2 },
        { seasonNumber: 3, episodeNumbers: [4, 5] },
      ],
    });
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 2, permissions } });
      if (path === '/issue') {
        reads++;
        return route.fulfill({
          json: { results: [issue()], pageInfo: { page: 1, pages: 1 } },
        });
      }
      if (path === '/issue/7') return route.fulfill({ json: issue() });
      if (path === '/issue/7/comment') {
        expect(route.request().postDataJSON()).toEqual({
          message: 'Tested again',
        });
        comments.push({
          id: 2,
          message: 'Tested again',
          createdAt: '2026-11-12T00:00:00Z',
        });
        return route.fulfill({ status: 201, json: issue() });
      }
      if (path === '/issue/7/resolved') {
        status = 2;
        return route.fulfill({ json: issue() });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/issues');
    if (permissions === 32) {
      await expect(
        page.getByText('You do not have permission to view issues.')
      ).toBeVisible();
      expect(reads).toBe(0);
      return;
    }
    await page.getByRole('link', { name: 'Video #7' }).click();
    await expect(page.getByText('Season 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Season 3 · Episodes 4, 5')).toBeVisible();
    const resolve = page.getByRole('button', { name: 'Resolve Issue' });
    if (permissions === 2097152) {
      await expect(resolve).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'Comment' })).toHaveCount(
        0
      );
      return;
    }
    await page.getByRole('textbox', { name: 'Comment' }).fill('Tested again');
    await page.getByRole('button', { name: 'Add Comment' }).click();
    await expect(page.getByText('Tested again')).toBeVisible();
    await resolve.click();
    await expect(
      page.getByRole('button', { name: 'Reopen Issue' })
    ).toBeVisible();
  });
}

test('reporting uses the internal media row and opens the confirmed report', async ({
  page,
}) => {
  const posts: unknown[] = [];
  const issue = {
    id: 8,
    status: 1,
    issueType: 1,
    createdBy: { id: 2 },
    createdAt: '2026-11-12T00:00:00Z',
    comments: [
      { id: 1, message: 'Video stutters', createdAt: '2026-11-12T00:00:00Z' },
    ],
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 4194304 } });
    if (path === '/movie/20')
      return route.fulfill({
        json: {
          id: 20,
          title: 'Example Movie',
          genres: [],
          mediaInfo: { id: 654, status: 5 },
        },
      });
    if (path === '/issue' && route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ json: issue });
    }
    if (path === '/issue/8') return route.fulfill({ json: issue });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/movie/20');
  await page.getByRole('button', { name: 'Report an Issue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report an Issue' });
  const submit = dialog.getByRole('button', { name: 'Submit Report' });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Issue Type' }).selectOption('1');
  await dialog
    .getByRole('textbox', { name: 'Issue Description' })
    .fill('  Video stutters  ');
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Issue #8' })).toBeVisible();
  await expect(page.getByText('Video stutters')).toBeVisible();
  expect(posts).toEqual([
    { mediaId: 654, issueType: 1, message: 'Video stutters', is4k: false },
  ]);
});

test('a reporter can edit their description and confirm removal of their own reply', async ({
  page,
}) => {
  const comments = [
    { id: 1, message: 'Original description', user: { id: 2 } },
    { id: 2, message: 'My reply', user: { id: 2 } },
    { id: 3, message: 'Someone else’s reply', user: { id: 3 } },
  ];
  const writes: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 4194304 } });
    if (path === '/issue/7')
      return route.fulfill({
        json: {
          id: 7,
          status: 1,
          issueType: 1,
          createdBy: { id: 2 },
          comments,
        },
      });
    if (path === '/issueComment/1' && request.method() === 'PUT') {
      writes.push('edit');
      expect(request.postDataJSON()).toEqual({
        message: 'Corrected description',
      });
      comments[0].message = 'Corrected description';
      return route.fulfill({ json: comments[0] });
    }
    if (path === '/issueComment/2' && request.method() === 'DELETE') {
      writes.push('delete');
      comments.splice(1, 1);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/issues/7');
  await expect(page.getByRole('button', { name: 'Delete Issue' })).toHaveCount(
    0
  );
  const othersReply = page
    .getByRole('listitem')
    .filter({ hasText: 'Someone else’s reply' });
  await expect(othersReply.getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Description' }).click();
  await page
    .getByRole('textbox', { name: 'Edit Issue Description' })
    .fill('Corrected description');
  await page.getByRole('button', { name: 'Save Edit' }).click();
  await expect(page.getByText('Corrected description')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Comment' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(writes).toEqual(['edit']);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete Comment' })
    .click();
  await expect(page.getByText('My reply', { exact: true })).toHaveCount(0);
  expect(writes).toEqual(['edit', 'delete']);
});
