import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { styleContract } from './cssContract.mjs';

const stylesheets = ['globals.css', 'visual-lab.css'].map((filename) => ({
  filename,
  contract: styleContract(
    readFileSync(new URL(`./${filename}`, import.meta.url), 'utf8')
  ),
}));

test('settings forms stay stacked through the reported 646px viewport', () => {
  for (const { filename, contract } of stylesheets) {
    const formRow = contract.applies('.form-row');
    const inputArea = contract.applies('.form-input-area');

    assert.ok(formRow.has('md:grid'), `${filename} starts the form grid at md`);
    assert.ok(formRow.has('md:grid-cols-3'), `${filename} uses the md grid`);
    assert.ok(
      !formRow.has('sm:grid'),
      `${filename} does not activate the three-column layout at 646px`
    );
    assert.ok(inputArea.has('md:col-span-2'));
    assert.ok(!inputArea.has('sm:col-span-2'));
  }
});

test('dropdown menus and every unselected option use readable theme colors', () => {
  for (const { filename, contract } of stylesheets) {
    assert.equal(
      contract.declaration(
        '.react-select-container .react-select__menu',
        'color'
      ),
      'rgb(var(--theme-control-text)) !important',
      `${filename} gives the menu a theme foreground`
    );
    assert.equal(
      contract.declaration(
        '.react-select-container .react-select__menu',
        'background-color'
      ),
      'rgb(var(--theme-control-surface) / 0.98) !important',
      `${filename} keeps the menu on its matching theme surface`
    );
    assert.equal(
      contract.declaration(
        '.react-select-container .react-select__option',
        'color'
      ),
      'rgb(var(--theme-control-text)) !important',
      `${filename} overrides the library's pale default option text`
    );
  }
});

test('the Request Book Advanced Options control stays readable on narrow cards', () => {
  for (const { filename, contract } of stylesheets) {
    const control =
      ".detail-disclosure-control[data-control-variant='book-request-advanced-options']";
    assert.equal(contract.declaration(control, 'min-width'), '12rem');
    assert.equal(contract.declaration(control, 'height'), '2rem');
    assert.equal(
      contract.declaration(
        `${control} .detail-disclosure-button`,
        'white-space'
      ),
      'nowrap',
      `${filename} keeps the Advanced Options label on one line`
    );
  }
});
