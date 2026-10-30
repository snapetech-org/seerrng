import { getSettings } from '@server/lib/settings';
import router from '@server/routes';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import session from 'express-session';
import assert from 'node:assert/strict';
import path from 'node:path';
import { before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';

setupTestDb();

describe('interface packages through the production API contract', () => {
  const app = express();
  before(() => {
    app.use(express.json());
    app.use(
      session({
        secret: 'theme-contract-test',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: 'auto' },
      })
    );
    app.use(
      OpenApiValidator.middleware({
        apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
        validateRequests: true,
        validateSecurity: false,
      })
    );
    app.use('/api/v1', router);
    app.use(
      (
        error: { status?: number; message?: string },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        void _next;
        res.status(error.status ?? 500).json({ message: error.message });
      }
    );
  });
  beforeEach(() => {
    getSettings().main.localLogin = true;
  });

  it('serves the catalog and every built-in stylesheet before authentication', async () => {
    const catalog = await request(app).get('/api/v1/interface-themes');
    assert.equal(catalog.status, 200, JSON.stringify(catalog.body));
    for (const theme of catalog.body.themes) {
      const response = await request(app).get(
        `/api/v1/interface-themes/${theme.id}/theme.css`
      );
      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /^text\/css/);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.ok(response.text.includes(theme.id));
    }
    assert.equal(
      (
        await request(app).get(
          '/api/v1/interface-themes/not-installed/theme.css'
        )
      ).status,
      404
    );
  });

  it('persists Persius and both existing themes and restores each in the authenticated profile', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/local')
      .send({ email: 'admin@seerr.dev', password: 'test1234' });
    assert.equal(login.status, 200);
    const id = login.body.id;
    for (const theme of ['persiusNG', 'seerrNGJ', 'seerrOrig']) {
      const result = await agent
        .post(`/api/v1/user/${id}/settings/interface-theme`)
        .send({ theme });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(result.body, { interfaceTheme: theme });
      const me = await agent.get('/api/v1/auth/me');
      assert.equal(me.body.settings.interfaceTheme, theme);
    }
    assert.equal(
      (
        await agent
          .post(`/api/v1/user/${id + 1}/settings/interface-theme`)
          .send({ theme: 'persiusNG' })
      ).status,
      403
    );
    for (const body of [
      { theme: 'not-installed' },
      { theme: '../persiusNG' },
      { theme: 'persiusNG', css: 'body{}' },
    ]) {
      assert.equal(
        (
          await agent
            .post(`/api/v1/user/${id}/settings/interface-theme`)
            .send(body)
        ).status,
        400
      );
    }
    const anonymous = await request(app)
      .post(`/api/v1/user/${id}/settings/interface-theme`)
      .send({ theme: 'persiusNG' });
    assert.ok([401, 403].includes(anonymous.status));
  });
});
