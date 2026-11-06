import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const sources = {
  cloudron: readFileSync(
    new URL('./start-cloudron.cjs', import.meta.url),
    'utf8'
  ),
  coop: readFileSync(
    new URL('../coop-cloud/seerrng/start-proxy.cjs', import.meta.url),
    'utf8'
  ),
};
const simulate = async ({
  profile = 'cloudron',
  uid = 0,
  gid = uid,
  symlink,
  ownershipError = false,
  dropError = false,
  origin,
  saveError = false,
} = {}) => {
  const calls = [];
  let loaded = false;
  const settings = {
    main: { applicationUrl: 'https://old.example.test' },
    network: { trustProxy: false, retained: 'unchanged' },
    async load() {
      calls.push(['load']);
      return this;
    },
    async save() {
      if (saveError) throw new Error('save failed');
      calls.push(['save']);
    },
  };
  const process = {
    env: {
      CONFIG_DIRECTORY: '/outside',
      ...(origin === undefined
        ? {}
        : { CLOUDRON_APP_ORIGIN: origin, SEERR_PUBLIC_ORIGIN: origin }),
    },
    getuid: () => uid,
    getgid: () => gid,
    setgroups: (groups) => calls.push(['groups', groups]),
    setgid: (value) => {
      gid = value;
      calls.push(['gid', value]);
    },
    setuid: (value) => {
      if (dropError) throw new Error('cannot drop privileges');
      uid = value;
      calls.push(['uid', value]);
    },
    chdir: (directory) => calls.push(['cwd', directory]),
  };
  const fs = {
    mkdirSync: (directory) => calls.push(['mkdir', directory]),
    lstatSync: (directory) => ({ isDirectory: () => directory !== symlink }),
    chownSync: (directory, owner, group) =>
      calls.push(['chown', directory, owner, group]),
    chmodSync: (directory, mode) => calls.push(['chmod', directory, mode]),
  };
  let error;
  try {
    await runInNewContext(sources[profile], {
      process,
      URL,
      require: (name) => {
        if (name === 'node:fs') return fs;
        if (name === 'node:child_process')
          return {
            execFileSync: (command, args) => {
              calls.push(['exec', command, ...args]);
              if (ownershipError) throw new Error('ownership failed');
            },
          };
        assert.equal(uid, 1000, 'application modules must never load as root');
        assert.equal(gid, 1000);
        if (name === '/app/dist/lib/settings')
          return { getSettings: () => settings };
        assert.equal(name, '/app/dist/index.js');
        loaded = true;
      },
    });
  } catch (caught) {
    error = caught;
  }
  return { calls, loaded, process, settings, error };
};

test('drops root and supplementary groups before loading application modules', async () => {
  const result = await simulate();
  assert.equal(result.error, undefined);
  assert.equal(result.loaded, true);
  assert.equal(result.calls.find((call) => call[0] === 'groups')[1].length, 0);
  assert.deepEqual(
    result.calls.find((call) => call[0] === 'exec'),
    ['exec', '/bin/chown', '-hR', '1000:1000', '/app/data']
  );
  assert.equal(result.process.env.CONFIG_DIRECTORY, '/app/data');
});

test('unprivileged startup never attempts ownership or credential changes', async () => {
  const result = await simulate({ uid: 1000 });
  assert.equal(result.error, undefined);
  assert.equal(result.loaded, true);
  assert.equal(
    result.calls.some((call) =>
      ['exec', 'chown', 'uid', 'gid', 'groups'].includes(call[0])
    ),
    false
  );
});

for (const directory of ['/app/data', '/tmp/seerrng-next-cache']) {
  test(`rejects a symlink storage root before privileged setup: ${directory}`, async () => {
    const result = await simulate({ symlink: directory });
    assert.match(result.error?.message, /not a symlink/);
    assert.equal(result.loaded, false);
    assert.equal(
      result.calls.some((call) => call[0] === 'exec'),
      false
    );
  });
}

for (const [option, message] of [
  ['ownershipError', /ownership failed/],
  ['dropError', /cannot drop privileges/],
]) {
  test(`${option} prevents application startup as root`, async () => {
    const result = await simulate({ [option]: true });
    assert.match(result.error?.message, message);
    assert.equal(result.loaded, false);
  });
}

for (const profile of ['cloudron', 'coop']) {
  test(`${profile} rejects an unexpected account`, async () => {
    const result = await simulate({ profile, uid: 501 });
    assert.match(result.error?.message, /unprivileged container user/);
    assert.equal(result.loaded, false);
  });
  test(`${profile} persists a platform HTTPS origin before serving requests`, async () => {
    const result = await simulate({
      profile,
      uid: 1000,
      origin: 'https://requests.example.test/',
    });
    assert.equal(result.error, undefined);
    assert.equal(result.loaded, true);
    assert.equal(
      result.settings.main.applicationUrl,
      'https://requests.example.test'
    );
    assert.equal(result.settings.network.trustProxy, true);
    assert.equal(result.settings.network.retained, 'unchanged');
    assert.ok(result.calls.some((call) => call[0] === 'save'));
    assert.equal(
      result.process.env.CONFIG_DIRECTORY,
      profile === 'cloudron' ? '/app/data' : '/app/config'
    );
  });
  test(`${profile} does not serve after a failed settings save`, async () => {
    const result = await simulate({
      profile,
      uid: 1000,
      origin: 'https://requests.example.test',
      saveError: true,
    });
    assert.match(result.error?.message, /save failed/);
    assert.equal(result.loaded, false);
  });
  for (const origin of [
    'http://requests.example.test',
    'https://user:password@requests.example.test',
    'https://requests.example.test/path',
    'https://requests.example.test/?query=value',
    'https://requests.example.test/#fragment',
    'invalid',
  ]) {
    test(`${profile} rejects an unsafe platform origin: ${origin}`, async () => {
      const result = await simulate({ profile, uid: 1000, origin });
      assert.match(result.error?.message, /valid HTTPS application origin/);
      assert.equal(result.loaded, false);
      assert.equal(
        result.calls.some((call) => call[0] === 'load'),
        false
      );
    });
  }
}
