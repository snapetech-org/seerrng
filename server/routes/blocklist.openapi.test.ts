import assert from 'node:assert/strict';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import blocklistRoutes from './blocklist';

let app: Express;

function createOpenApiValidatedApp(): Express {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    session({
      // nosemgrep: javascript.express.security.audit.express-session-hardcoded-secret.express-session-hardcoded-secret -- fixed test-only session key in the isolated test process
      secret: 'test-secret',
      cookie: { secure: 'auto' },
      resave: false,
      saveUninitialized: false,
    })
  );
  testApp.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
  testApp.use('/api/v1/auth', authRoutes);
  testApp.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  testApp.use('/api/v1/blocklist', blocklistRoutes);
  testApp.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );

  return testApp;
}

before(() => {
  app = createOpenApiValidatedApp();
});

setupTestDb();

describe('Blocklist count route behind the OpenAPI validator', () => {
  it('declares and reaches GET /blocklist/count', async () => {
    const settings = getSettings();
    const priorLocalLogin = settings.main.localLogin;
    settings.main.localLogin = true;

    try {
      const agent = request.agent(app);
      const login = await agent
        .post('/api/v1/auth/local')
        .send({ email: 'admin@seerr.dev', password: 'test1234' });
      assert.strictEqual(login.status, 200);

      const response = await agent.get('/api/v1/blocklist/count');

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(Object.keys(response.body), ['count']);
      assert.ok(Number.isInteger(response.body.count));
      assert.ok(response.body.count >= 0);
    } finally {
      settings.main.localLogin = priorLocalLogin;
    }
  });
});
