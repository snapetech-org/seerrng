import assert from 'node:assert/strict';
import { it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsFormRow from './SettingsFormRow';
import SettingsHelp from './SettingsHelp';

it('preserves ordinary help markup outside the optional settings display provider', () => {
  assert.strictEqual(
    renderToStaticMarkup(
      <SettingsHelp className="description" id="help">
        <a href="https://example.com">Provider documentation</a>
      </SettingsHelp>
    ),
    '<p class="description" id="help"><a href="https://example.com">Provider documentation</a></p>'
  );
  assert.strictEqual(
    renderToStaticMarkup(
      <SettingsHelp as="span" className="settings-form-row-description">
        Field help
      </SettingsHelp>
    ),
    '<span class="settings-form-row-description">Field help</span>'
  );
});
it('retains settings row labels and help in consumers without compact mode', () => {
  const markup = renderToStaticMarkup(
    <SettingsFormRow
      htmlFor="provider"
      label="Provider"
      description="Choose a configured provider"
    >
      <input id="provider" />
    </SettingsFormRow>
  );
  assert.match(markup, /<label for="provider"/);
  assert.match(
    markup,
    /<p class="settings-form-row-description">Choose a configured provider<\/p>/
  );
  assert.doesNotMatch(markup, /<summary/);
});
