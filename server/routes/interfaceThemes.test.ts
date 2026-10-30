import express from 'express';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import themeRoutes from './interfaceThemes';

const app = express().use('/api/v1/interface-themes', themeRoutes);

describe('public interface theme package routes', () => {
  it('lists installed package metadata without authentication', async () => {
    const response = await request(app).get('/api/v1/interface-themes');
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'public, max-age=60');
    assert.deepEqual(
      response.body.themes.map(({ id }: { id: string }) => id),
      ['seerrOrig', 'seerrNGJ', 'persiusNG']
    );
    assert.equal(
      response.body.themes.find(({ id }: { id: string }) => id === 'persiusNG')
        ?.layout,
      'persius'
    );
  });

  it('serves only a validated installed stylesheet from the same origin', async () => {
    const response = await request(app).get(
      '/api/v1/interface-themes/persiusNG/theme.css'
    );
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /^text\/css; charset=utf-8/);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(response.text, /data-interface-theme='persiusNG'/);
    assert.equal(
      (await request(app).get('/api/v1/interface-themes/%2e%2e/theme.css'))
        .status,
      404
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/interface-themes/not-installed/theme.css'
        )
      ).status,
      404
    );
  });
});
