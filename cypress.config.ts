import { defineConfig } from 'cypress';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export default defineConfig({
  projectId: 'onnqy3',
  expose: {
    RUN_LIVE_AUTH_AUDIT: process.env.RUN_LIVE_AUTH_AUDIT === 'true',
    SEED_DATABASE: process.env.SEED_DATABASE === 'true',
    VISUAL_REVIEW: process.env.VISUAL_REVIEW === 'true',
  },
  e2e: {
    baseUrl: 'http://localhost:5055',
    setupNodeEvents(on) {
      on('task', {
        async seedDatabase() {
          await execFileAsync('pnpm', ['cypress:prepare'], {
            env: process.env,
          });
          return null;
        },
      });
    },
    video: true,
  },
  env: {
    ADMIN_EMAIL: 'admin@seerr.dev',
    ADMIN_PASSWORD: 'test1234',
    USER_EMAIL: 'demo@seerr.dev',
    USER_PASSWORD: 'test1234',
  },
  retries: {
    runMode: 2,
    openMode: 0,
  },
});
