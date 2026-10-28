import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { styleContract } from './cssContract.mjs';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const sharedCss = readFileSync(
  new URL('./interfaceThemes/shared.css', import.meta.url),
  'utf8'
);
const login = readFileSync(
  new URL('../components/Login/index.tsx', import.meta.url),
  'utf8'
);

const assertLoginGeometry = (stylesheet) => {
  const contract = styleContract(stylesheet);
  for (const [property, value] of Object.entries({
    height: 'auto',
    'min-height': '38px',
    'max-height': 'none',
    'padding-block': '8px',
    'padding-inline': 'var(--button-padding-x) !important',
    'font-size': '14px',
    'line-height': '20px',
  })) {
    assert.equal(
      contract.declaration('.auth-login-page .app-button', property),
      value
    );
  }
  assert.equal(
    contract.declaration(':root', '--action-control-height'),
    '1.5rem'
  );
  assert.equal(
    contract.declaration('.auth-login-page .app-button svg', 'height'),
    '20px'
  );
  assert.equal(
    contract.declaration('.auth-login-page .app-button svg', 'width'),
    '20px'
  );
  assert.equal(
    contract.declaration('.auth-login-page .app-button svg', 'max-height'),
    'none'
  );
};

test('login retains its taller button geometry while consuming shared horizontal padding', () => {
  assert.match(login, /className="auth-login-page /);
  assertLoginGeometry(css);
  assert.match(
    sharedCss,
    /--button-padding-x:\s*var\(--interface-button-padding-x\);/
  );
});

test('login geometry check rejects a restored competing padding owner', () => {
  assert.throws(
    () =>
      assertLoginGeometry(
        css +
          '\n.auth-login-page .app-button { padding-inline: 16px !important; }'
      ),
    assert.AssertionError
  );
});
