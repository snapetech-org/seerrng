import type { Locator } from '@playwright/test';

export const getSelectOptionContrast = (options: Locator) =>
  options.evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      let back = node as Element;
      let background = style.backgroundColor;
      while (/^rgba\(0, 0, 0, 0\)$/.test(background) && back.parentElement) {
        back = back.parentElement;
        background = getComputedStyle(back).backgroundColor;
      }
      const parse = (v: string) => v.match(/[\d.]+/g)!.map(Number);
      const fg = parse(style.color),
        bg = parse(background);
      const lum = (rgb: number[]) =>
        rgb
          .slice(0, 3)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratios = [0, 255].map((base) => {
        const a = bg[3] ?? 1,
          b = bg.slice(0, 3).map((v) => v * a + base * (1 - a));
        const f = lum(fg),
          l = lum(b);
        return (Math.max(f, l) + 0.05) / (Math.min(f, l) + 0.05);
      });
      return {
        text: node.textContent,
        color: style.color,
        background,
        contrast: Math.min(...ratios),
      };
    })
  );
