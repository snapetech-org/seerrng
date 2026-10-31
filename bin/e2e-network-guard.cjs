// Optional browser-test boundary. Loaded before the application, never by a
// normal production start. Provider reads must be deterministic browser fixtures.
const net = require('node:net');
const connect = net.Socket.prototype.connect;

const assertLoopback = (host) => {
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    const error = new Error(
      'Offline E2E tests cannot contact external services.'
    );
    error.code = 'E2E_EXTERNAL_NETWORK_BLOCKED';
    throw error;
  }
};

const assertRequest = (input) => {
  if (typeof input === 'string' || input instanceof URL) {
    assertLoopback(new URL(input).hostname);
  } else if (input?.url) {
    assertLoopback(new URL(input.url).hostname);
  } else {
    assertLoopback(input?.hostname ?? input?.host ?? 'localhost');
  }
};

// Check the original destination before an environment proxy can translate it
// to a local transport. Socket checks alone cannot see that original authority.
for (const name of ['node:http', 'node:https']) {
  const client = require(name);
  for (const method of ['request', 'get']) {
    const original = client[method];
    client[method] = function (...args) {
      assertRequest(args[0]);
      if (args[1] && typeof args[1] === 'object') assertRequest(args[1]);
      return original.apply(this, args);
    };
  }
}
require('node:module').syncBuiltinESMExports();
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (...args) {
  assertRequest(args[0]);
  return originalFetch.apply(this, args);
};
const undici = require('undici');
for (const method of [
  'fetch',
  'request',
  'stream',
  'pipeline',
  'connect',
  'upgrade',
]) {
  const original = undici[method];
  undici[method] = function (...args) {
    assertRequest(args[0]);
    return original.apply(this, args);
  };
}

net.Socket.prototype.connect = function (...input) {
  let args = input;
  while (Array.isArray(args[0])) args = args[0];
  const options = args[0];
  const unixSocket =
    (typeof options === 'object' && options?.path) ||
    (typeof options === 'string' && !/^\d+$/.test(options));
  if (!unixSocket) {
    const host =
      typeof options === 'object'
        ? (options?.host ?? 'localhost')
        : typeof args[1] === 'string'
          ? args[1]
          : 'localhost';
    assertLoopback(host);
  }
  return connect.apply(this, input);
};
