import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  DEFAULT_INTERFACE_THEME_ID,
  INTERFACE_THEME_IDS,
  parseInterfaceTheme,
} from '@server/utils/interfaceTheme';
import {
  DEFAULT_THEME_PALETTE_ID,
  getThemeTokens,
  themePalettes,
} from './ThemeContext';

describe('interface theme contract', () => {
  it('defaults to SeerrOrig and accepts only the two supported profiles', () => {
    assert.equal(DEFAULT_INTERFACE_THEME_ID, 'seerrOrig');
    assert.deepEqual(INTERFACE_THEME_IDS, ['seerrOrig', 'seerrNGJ']);
    assert.equal(parseInterfaceTheme('seerrOrig'), 'seerrOrig');
    assert.equal(parseInterfaceTheme('seerrNGJ'), 'seerrNGJ');
    assert.equal(parseInterfaceTheme('seerrngj'), null);
    assert.equal(parseInterfaceTheme({ theme: 'seerrOrig' }), null);
  });

  it('ships two separately scoped, materially different interface sheets', () => {
    const orig = readFileSync(
      'src/styles/interfaceThemes/seerrOrig.css',
      'utf8'
    );
    const john = readFileSync(
      'src/styles/interfaceThemes/seerrNGJ.css',
      'utf8'
    );
    assert.notEqual(orig, john);
    for (const sheet of [orig, john]) {
      assert.match(sheet, /data-interface-theme/);
      assert.match(sheet, /\.sidebar/);
      assert.match(sheet, /\.poster-layout/);
      assert.match(sheet, /\.media-header/);
    }
    assert.match(orig, /--poster-width: 150px/);
    assert.match(john, /--poster-width: 174px/);
    assert.match(orig, /display: contents/);
    assert.match(john, /\.sidebar-navigation-heading/);
  });
});

const getRelativeLuminance = (rgb: string): number => {
  const [red, green, blue] = rgb
    .split(' ')
    .map(Number)
    .map((channel) => {
      const value = channel / 255;

      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });

  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
};

const getContrastRatio = (foreground: string, background: string): number => {
  const luminance = [
    getRelativeLuminance(foreground),
    getRelativeLuminance(background),
  ].sort((left, right) => right - left);

  return (luminance[0] + 0.05) / (luminance[1] + 0.05);
};

describe('themePalettes', () => {
  it('uses solid slate chrome and a restrained blue accent for SeerrNG', () => {
    assert.equal(
      themePalettes.some((p) => p.id === 'blackout'),
      false
    );
    assert.deepEqual(
      themePalettes.slice(0, 2).map((p) => p.name),
      ['SeerrNG', 'Seerr']
    );
    for (const mode of ['dark', 'light'] as const) {
      const original = getThemeTokens(mode, 'classic');
      const seerrng = getThemeTokens(mode, 'seerr');
      for (const field of ['primaryScale', 'secondaryScale'] as const) {
        assert.deepEqual(seerrng[field], original[field], field);
      }
      assert.notDeepEqual(seerrng.surfaceScale, original.surfaceScale);
      assert.equal(seerrng.chrome, 'classic');
      assert.equal(seerrng.activePaletteId, 'seerr');
      assert.equal(seerrng.selectedPaletteId, 'seerr');
    }
  });

  it('uses solid slate menu surfaces with shared overlay opacity', () => {
    const css = readFileSync('src/styles/globals.css', 'utf8');
    const block = css.match(/\[data-theme-palette='seerr'\] \{([^}]+)\}/)?.[1];
    assert.ok(block);
    assert.doesNotMatch(block, /--color-|--theme-control-(text|border):/);
    for (const [token, value] of Object.entries({
      'gradient-light': '31 41 55',
      'gradient-main': '40 68 120',
      'gradient-deep': '17 24 39',
      'gradient-black': '0 0 0',
    })) {
      assert.ok(block.includes(`--theme-page-${token}: ${value};`));
    }
    assert.ok(block.includes('--theme-page-spotlight-strength: 0;'));
    assert.ok(block.includes('--theme-page-gradient-main-stop: 50%;'));
    for (const [token, value] of Object.entries({
      light: '31 41 55',
      main: '31 41 55',
      deep: '17 24 39',
      neutral: '31 41 55',
      menu: '31 41 55',
    })) {
      assert.ok(block.includes(`--theme-overlay-${token}: ${value};`));
    }
    for (const [selector, opacity] of [
      ['refreshed-card-surface', '0.38'],
      ['refreshed-inset-surface', '0.42'],
      ['refreshed-artwork-scrim', '0.46'],
      ['settings-main-card', '0.38'],
      ['app-searchbar-scrolled', '0.9'],
    ]) {
      const rules = css
        .split(`.${selector} {`)
        .slice(1)
        .map((rule) => rule.split('}')[0]);
      assert.ok(
        rules.some((rule) => rule.includes(`/ ${opacity})`)),
        selector
      );
    }
    const searchbar = css.match(/\.app-searchbar-scrolled \{([^}]+)\}/)?.[1];
    assert.ok(searchbar);
    assert.ok(
      searchbar?.includes(
        'background-color: rgb(var(--theme-searchbar-scrolled) / 0.9);'
      )
    );
    // Avoid repainting the full-width fixed header with a backdrop blur while scrolling.
    assert.doesNotMatch(searchbar ?? '', /(?:-webkit-)?backdrop-filter\s*:/);
    const sidebar = css.match(
      /\[data-theme-palette='seerr'\] \.sidebar \{([^}]+)\}/
    )?.[1];
    assert.ok(sidebar);
    assert.ok(
      sidebar?.includes('background-color: rgb(var(--theme-sidebar-start));')
    );
    assert.doesNotMatch(sidebar ?? '', /gradient|backdrop-filter/i);
    const selectedLink = css.match(/\.sidebar-link-selected \{([^}]+)\}/)?.[1];
    assert.ok(
      selectedLink?.includes(
        'background-color: rgb(var(--theme-control-border));'
      )
    );
    assert.doesNotMatch(selectedLink ?? '', /gradient/i);
    const backdrop = css.match(/\.app-backdrop \{([^}]+)\}/)?.[1];
    const menuSurface = css.match(/\.app-menu-gradient \{([^}]+)\}/)?.[1];
    for (const surface of [backdrop, menuSurface]) {
      assert.ok(surface?.includes('background-color:'));
      assert.doesNotMatch(surface ?? '', /gradient/i);
    }
  });

  it('uses the SeerrNG palette as the default', () => {
    assert.equal(DEFAULT_THEME_PALETTE_ID, 'seerr');
    assert.equal(themePalettes[0].id, DEFAULT_THEME_PALETTE_ID);
    assert.equal(themePalettes[0].name, 'SeerrNG');
  });

  it('uses the solid Seerr blue and slate tokens in the default palette', () => {
    const tokens = getThemeTokens('dark', 'seerr');

    assert.equal(tokens.pageBg, '17 24 39');
    assert.equal(tokens.pageGlowStart, '31 41 55');
    assert.equal(tokens.searchbarScrolled, '55 65 81');
    assert.equal(tokens.sidebarStart, '31 41 55');
    assert.equal(tokens.sidebarEnd, '19 25 40');
    assert.equal(tokens.sidebarBorder, '55 65 81');
    assert.equal(tokens.sidebarHover, '55 65 81');
    assert.equal(tokens.controlBorder, '40 68 120');
    assert.equal(tokens.primaryScale[6], '40 68 120');
    assert.equal(tokens.secondaryScale[6], '71 85 105');
    assert.ok(
      getContrastRatio('255 255 255', tokens.controlBorder) >= 4.5,
      'active navigation text should remain readable on the blue selection'
    );
    assert.ok(
      getContrastRatio(tokens.primaryScale[4], tokens.sidebarStart) >= 3,
      'keyboard focus should remain visible against the sidebar'
    );
  });

  it('keeps light surfaces and text in the selected mode while preserving dark artwork overlays', () => {
    const darkTokens = getThemeTokens('dark', 'classic');
    const lightTokens = getThemeTokens('light', 'classic');

    assert.equal(lightTokens.pageGradientBlack, lightTokens.pageBg);
    assert.notEqual(lightTokens.pageGradientMain, darkTokens.pageGradientMain);
    assert.notEqual(lightTokens.controlSurface, darkTokens.controlSurface);
    assert.notEqual(lightTokens.controlText, darkTokens.controlText);
    assert.equal(lightTokens.artworkScrim, darkTokens.artworkScrim);
    assert.equal(
      lightTokens.artworkGradientDeep,
      darkTokens.artworkGradientDeep
    );
    assert.equal(lightTokens.artworkGradientBlack, '0 0 0');
  });

  it('keeps every light-mode text shade readable on its page background in every palette', () => {
    for (const palette of themePalettes) {
      const tokens = getThemeTokens('light', palette.id);

      // gray-50..gray-500 are body, secondary and label text.
      for (const [index, shade] of tokens.surfaceScale.slice(0, 6).entries()) {
        for (const background of [
          tokens.pageBg,
          tokens.pageGlowStart,
          tokens.pageGradientMain,
        ]) {
          assert.ok(
            getContrastRatio(shade, background) >= 4.5,
            `${palette.name} light gray-${[50, 100, 200, 300, 400, 500][index]} needs 4.5:1 on ${background}`
          );
        }
      }
    }
  });

  it('keeps light-mode accent text shades (indigo and purple 100-400) readable', () => {
    for (const palette of themePalettes) {
      const tokens = getThemeTokens('light', palette.id);

      for (const [name, scale] of [
        ['indigo', tokens.primaryScale],
        ['purple', tokens.secondaryScale],
      ] as const) {
        for (const index of [1, 2, 3, 4]) {
          assert.ok(
            getContrastRatio(scale[index], tokens.pageBg) >= 4.5,
            `${palette.name} light ${name}-${[50, 100, 200, 300, 400][index]} needs 4.5:1 on the page`
          );
        }
      }
    }
  });

  it('keeps light-mode control and heading colors readable across palettes', () => {
    for (const palette of themePalettes) {
      const tokens = getThemeTokens('light', palette.id);

      assert.ok(
        getContrastRatio(tokens.controlText, tokens.controlSurface) >= 4.5,
        `${palette.name} light controls should meet normal-text contrast`
      );
      assert.ok(
        getContrastRatio(tokens.headingText, tokens.pageGradientMain) >= 4.5,
        `${palette.name} light headings should meet normal-text contrast`
      );
    }
  });

  it('exposes the slate and blue colors through the SeerrNG palette', () => {
    const seerr = themePalettes.find((palette) => palette.id === 'seerr');

    assert.deepStrictEqual(seerr, {
      id: 'seerr',
      name: 'SeerrNG',
      swatches: ['#111827', '#1f2937', '#284478'],
      surface: 'gray',
      primary: 'seerrBlue',
      secondary: 'slate',
      chrome: 'classic',
    });
    assert.equal(getThemeTokens('dark', 'seerr').sidebarStart, '31 41 55');
  });

  it('includes the Sietch palette displayed by the theme picker', () => {
    assert.deepEqual(themePalettes.map((palette) => palette.id).slice(-3), [
      'violet',
      'ocean',
      'sietch-neon',
    ]);

    assert.equal(
      themePalettes.find((palette) => palette.id === 'sietch-neon')?.name,
      'Sietch'
    );

    assert.deepEqual(
      themePalettes.find((palette) => palette.id === 'sietch-neon'),
      {
        id: 'sietch-neon',
        name: 'Sietch',
        swatches: ['#8e6036', '#43352e', '#8f5cff', '#d7ff3f'],
        surface: 'sietchSpice',
        primary: 'sietchSpice',
        secondary: 'sietchNeon',
      }
    );
  });

  it('gives every palette distinct page and sidebar chrome in both modes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const chromeSignatures = themePalettes.map((palette) => {
        const tokens = getThemeTokens(mode, palette.id);

        return [
          tokens.pageBg,
          tokens.pageGlowStart,
          tokens.pageGlowEnd,
          tokens.searchbarScrolled,
          tokens.sidebarStart,
          tokens.sidebarEnd,
        ].join('|');
      });

      assert.equal(
        new Set(chromeSignatures).size,
        themePalettes.length,
        `${mode} theme chrome should be unique per palette`
      );
    }
  });

  it('keeps Sietch spice-led with neon as the secondary accent', () => {
    const darkTokens = getThemeTokens('dark', 'sietch-neon');
    const [pageRed, pageGreen, pageBlue] = darkTokens.pageBg
      .split(' ')
      .map(Number);
    const [accentRed, accentGreen, accentBlue] = darkTokens.sidebarBorder
      .split(' ')
      .map(Number);

    assert.ok(pageRed >= pageBlue, 'Sietch page background should stay warm');
    assert.ok(
      pageGreen >= pageBlue,
      'Sietch page background should stay brown'
    );
    assert.ok(
      accentBlue > accentRed && accentBlue > accentGreen,
      'Sietch secondary accents should stay neon purple'
    );
  });
});
