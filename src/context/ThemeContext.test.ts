import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import postcss from 'postcss';

import {
  DEFAULT_THEME_PALETTE_ID,
  getThemeTokens,
  themePalettes,
} from './ThemeContext';

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
  it('uses the approved Blackout treatment for SeerrNG without a duplicate picker choice', () => {
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
      for (const field of [
        'primaryScale',
        'secondaryScale',
        'surfaceScale',
        'pageBg',
        'pageGlowStart',
        'pageGlowEnd',
        'sidebarBorder',
        'sidebarHover',
      ] as const) {
        assert.deepEqual(seerrng[field], original[field], field);
      }
      assert.equal(seerrng.chrome, 'blackout');
      assert.equal(seerrng.searchbarScrolled, '0 0 0');
      assert.equal(seerrng.sidebarStart, '0 0 0');
      assert.equal(seerrng.sidebarEnd, '0 0 0');
    }
  });

  it('keeps overlay opacity at its shared owner and scopes black to SeerrNG', () => {
    const css = readFileSync('src/styles/globals.css', 'utf8');
    const root = postcss.parse(css);
    const rulesFor = (selector: string): postcss.Rule[] => {
      const rules: postcss.Rule[] = [];
      root.walkRules((rule) => {
        if (rule.selectors?.includes(selector)) rules.push(rule);
      });
      return rules;
    };
    const declarationsFor = (rule: postcss.Rule): Map<string, string> => {
      const declarations = new Map<string, string>();
      rule.walkDecls((declaration) => {
        declarations.set(declaration.prop, declaration.value);
      });
      return declarations;
    };
    const seerrPaletteRule = rulesFor("[data-theme-palette='seerr']").find(
      (rule) => declarationsFor(rule).has('--theme-page-spotlight-strength')
    );
    assert.ok(seerrPaletteRule);
    const seerrPaletteDeclarations = declarationsFor(seerrPaletteRule);
    assert.equal(
      [...seerrPaletteDeclarations.keys()].some((property) =>
        /^--color-|^--theme-control-(text|border)$/.test(property)
      ),
      false
    );
    for (const [token, value] of Object.entries({
      'gradient-light': '0 0 0',
      'gradient-main': '40 68 120',
      'gradient-deep': '14 28 58',
      'gradient-black': '0 0 0',
    })) {
      assert.equal(
        seerrPaletteDeclarations.get(`--theme-page-${token}`),
        value
      );
    }
    assert.equal(
      seerrPaletteDeclarations.get('--theme-page-spotlight-strength'),
      '0'
    );
    assert.equal(
      seerrPaletteDeclarations.get('--theme-page-gradient-main-stop'),
      '50%'
    );
    for (const token of ['light', 'main', 'deep', 'neutral', 'menu']) {
      assert.equal(
        seerrPaletteDeclarations.get(`--theme-overlay-${token}`),
        '0 0 0'
      );
    }
    for (const [selector, opacity] of [
      ['refreshed-card-surface', '0.38'],
      ['refreshed-inset-surface', '0.42'],
      ['refreshed-artwork-scrim', '0.46'],
      ['settings-main-card', '0.38'],
      ['app-searchbar-scrolled', '0.9'],
    ]) {
      let hasExpectedOpacity = false;
      root.walkRules((rule) => {
        if (
          !rule.selectors?.some((candidate) =>
            candidate.includes(`.${selector}`)
          )
        ) {
          return;
        }
        rule.walkDecls((declaration) => {
          if (declaration.value.includes(`/ ${opacity})`)) {
            hasExpectedOpacity = true;
          }
        });
      });
      assert.ok(hasExpectedOpacity, selector);
    }
    const searchbarRules = rulesFor('.app-searchbar-scrolled');
    assert.equal(searchbarRules.length, 1);
    const searchbarDeclarations = declarationsFor(searchbarRules[0]);
    assert.equal(
      searchbarDeclarations.get('background-color'),
      'rgb(var(--theme-searchbar-scrolled) / 0.9)'
    );
    // Avoid repainting the full-width fixed header with a backdrop blur while scrolling.
    assert.equal(searchbarDeclarations.has('backdrop-filter'), false);
    assert.equal(searchbarDeclarations.has('-webkit-backdrop-filter'), false);
    const sidebarRules = rulesFor("[data-theme-palette='seerr'] .sidebar");
    assert.equal(sidebarRules.length, 1);
    const sidebarDeclarations = declarationsFor(sidebarRules[0]);
    const sidebarBackground = sidebarDeclarations.get('background') ?? '';
    assert.ok(sidebarBackground.includes('radial-gradient('));
    assert.ok(sidebarBackground.includes('linear-gradient('));
    assert.ok(
      sidebarBackground.includes('rgb(var(--theme-page-gradient-main) / 0.8)')
    );
    assert.equal(sidebarDeclarations.get('backdrop-filter'), 'blur(5px)');
    for (const [token, value] of Object.entries({
      'indigo-500': '59 130 246',
      'indigo-600': '37 99 235',
      'indigo-800': '30 64 175',
      'purple-500': '14 165 233',
      'purple-600': '2 132 199',
      'purple-800': '7 89 133',
    })) {
      assert.equal(sidebarDeclarations.get(`--color-${token}`), value);
    }
  });

  it('uses the SeerrNG palette as the default', () => {
    assert.equal(DEFAULT_THEME_PALETTE_ID, 'seerr');
    assert.equal(themePalettes[0].id, DEFAULT_THEME_PALETTE_ID);
    assert.equal(themePalettes[0].name, 'SeerrNG');
  });

  it('uses the approved Blackout chrome in the default SeerrNG palette', () => {
    const tokens = getThemeTokens('dark', 'seerr');

    assert.equal(tokens.pageBg, '17 24 39');
    assert.equal(tokens.pageGlowStart, '31 41 55');
    assert.equal(tokens.searchbarScrolled, '0 0 0');
    assert.equal(tokens.sidebarStart, '0 0 0');
    assert.equal(tokens.sidebarEnd, '0 0 0');
    assert.equal(tokens.sidebarBorder, '55 65 81');
    assert.equal(tokens.sidebarHover, '55 65 81');
    assert.equal(tokens.primaryScale[6], '79 70 229');
    assert.equal(tokens.secondaryScale[6], '147 51 234');
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

  it('exposes the approved Blackout colors through the SeerrNG palette', () => {
    const seerr = themePalettes.find((palette) => palette.id === 'seerr');

    assert.deepStrictEqual(seerr, {
      id: 'seerr',
      name: 'SeerrNG',
      swatches: ['#000000', '#1a3260', '#333333'],
      surface: 'gray',
      primary: 'indigo',
      secondary: 'purple',
      chrome: 'blackout',
    });
    assert.equal(getThemeTokens('dark', 'seerr').sidebarStart, '0 0 0');
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
