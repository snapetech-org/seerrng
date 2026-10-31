import postcss, { type AtRule } from 'postcss';
import {
  INTERFACE_THEME_IDS,
  type InterfaceThemeManifest,
} from './interfaceTheme';

export const INTERFACE_THEME_FORMAT_VERSION = 1;
export const INTERFACE_THEME_API_VERSION = 1;
export const MAX_INTERFACE_THEME_MANIFEST_BYTES = 8 * 1024;
export const MAX_INTERFACE_THEME_CSS_BYTES = 512 * 1024;
export const MAX_INSTALLED_INTERFACE_THEMES = 16;
export const MAX_INSTALLED_INTERFACE_THEME_CSS_BYTES = 4 * 1024 * 1024;
const MAX_CSS_RULES = 5_000;
const MAX_CSS_DECLARATIONS = 20_000;
const MAX_CSS_NESTING = 16;
const MAX_CSS_SELECTOR_LENGTH = 2_048;

export type InterfaceThemePackage = {
  manifest: InterfaceThemeManifest;
  css: string;
};

const allowedManifestKeys = new Set([
  'formatVersion',
  'themeApiVersion',
  'id',
  'name',
  'description',
  'version',
  'author',
  'license',
  'navigation',
  'activeNavigationIcon',
  'layout',
]);

const customThemeIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const builtInThemeIds = new Set<string>(INTERFACE_THEME_IDS);
const allowedAtRules = new Set(['media', 'supports', 'container']);
const keyframesAtRules = new Set(['keyframes', '-webkit-keyframes']);
const dangerousCssValuePattern =
  /(?:url|image-set|image|src|expression|paint)\s*\(|-moz-binding|\bbehavior\s*:/i;

const fail = (message: string): never => {
  throw new Error(`Invalid Seerr interface theme: ${message}`);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const requireText = (
  value: unknown,
  field: string,
  maxLength: number
): string => {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fail(
      `${field} must be a non-empty string of at most ${maxLength} characters`
    );
  }
  return value.trim();
};

export const validateInterfaceThemeManifest = (
  value: unknown,
  expectedId?: string
): InterfaceThemeManifest => {
  if (!isPlainObject(value)) return fail('manifest must be a JSON object');
  const unknownKeys = Object.keys(value).filter(
    (key) => !allowedManifestKeys.has(key)
  );
  if (unknownKeys.length > 0) {
    return fail(`unknown manifest field: ${unknownKeys[0]}`);
  }
  if (value.formatVersion !== INTERFACE_THEME_FORMAT_VERSION) {
    return fail(`formatVersion must be ${INTERFACE_THEME_FORMAT_VERSION}`);
  }
  if (value.themeApiVersion !== INTERFACE_THEME_API_VERSION) {
    return fail(`themeApiVersion must be ${INTERFACE_THEME_API_VERSION}`);
  }

  const id = requireText(value.id, 'id', 48);
  if (
    !builtInThemeIds.has(id) &&
    (!customThemeIdPattern.test(id) || id.length > 48)
  ) {
    return fail('id must be lowercase kebab-case');
  }
  if (expectedId !== undefined && id !== expectedId) {
    return fail('manifest id does not match its package directory');
  }

  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      String(value.version)
    )
  ) {
    return fail('version must use semantic versioning');
  }
  if (value.navigation !== 'flat' && value.navigation !== 'grouped') {
    return fail('navigation must be flat or grouped');
  }
  if (
    value.activeNavigationIcon !== 'outline' &&
    value.activeNavigationIcon !== 'filled'
  ) {
    return fail('activeNavigationIcon must be outline or filled');
  }

  if (
    value.layout !== undefined &&
    value.layout !== 'classic' &&
    value.layout !== 'persius'
  ) {
    return fail('layout must be classic or persius');
  }

  return {
    formatVersion: INTERFACE_THEME_FORMAT_VERSION,
    themeApiVersion: INTERFACE_THEME_API_VERSION,
    id,
    name: requireText(value.name, 'name', 64),
    description: requireText(value.description, 'description', 180),
    version: String(value.version),
    author: requireText(value.author, 'author', 80),
    license: requireText(value.license, 'license', 48),
    navigation: value.navigation,
    activeNavigationIcon: value.activeNavigationIcon,
    ...(value.layout !== undefined ? { layout: value.layout } : {}),
  };
};

const splitSelectorList = (selectorList: string): string[] => {
  const selectors: string[] = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote: string | undefined;

  for (let index = 0; index < selectorList.length; index += 1) {
    const character = selectorList[index];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      parentheses += 1;
    } else if (character === ')') {
      parentheses -= 1;
    } else if (character === '[') {
      brackets += 1;
    } else if (character === ']') {
      brackets -= 1;
    } else if (character === ',' && parentheses === 0 && brackets === 0) {
      selectors.push(selectorList.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(selectorList.slice(start).trim());
  return selectors;
};

const startsWithThemeRoot = (selector: string, id: string): boolean => {
  const candidates = [
    `:root[data-interface-theme='${id}']`,
    `:root[data-interface-theme="${id}"]`,
    `[data-interface-theme='${id}']`,
    `[data-interface-theme="${id}"]`,
  ];
  return candidates.some((candidate) => {
    if (!selector.startsWith(candidate)) return false;
    const next = selector[candidate.length];
    return next === undefined || /\s/.test(next) || '>+~.#:*['.includes(next);
  });
};

const balancedFunctionContents = (
  selector: string,
  openIndex: number
): { contents: string; endIndex: number } | null => {
  let depth = 0;
  let quote: string | undefined;
  for (let index = openIndex; index < selector.length; index += 1) {
    const character = selector[index];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return {
          contents: selector.slice(openIndex + 1, index),
          endIndex: index,
        };
      }
    }
  }
  return null;
};

const isThemeScopedSelector = (selector: string, id: string): boolean => {
  const normalized = selector.trim();
  if (startsWithThemeRoot(normalized, id)) return true;
  if (!normalized.startsWith(':is(')) return false;
  const contents = balancedFunctionContents(normalized, 3);
  if (!contents) return false;
  const alternatives = splitSelectorList(contents.contents);
  return (
    alternatives.length > 0 &&
    alternatives.every((alternative) => startsWithThemeRoot(alternative, id)) &&
    (normalized[contents.endIndex + 1] === undefined ||
      /\s/.test(normalized[contents.endIndex + 1]) ||
      '>+~.#:*['.includes(normalized[contents.endIndex + 1]))
  );
};

const validateAtRule = (rule: AtRule, id: string): void => {
  const name = rule.name.toLowerCase();
  if (allowedAtRules.has(name)) return;
  if (keyframesAtRules.has(name)) {
    const keyframeName = rule.params.trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!keyframeName.startsWith(`${id}-`)) {
      fail(`keyframe names must start with "${id}-"`);
    }
    return;
  }
  fail(`@${rule.name} is not supported`);
};

const validateRuleTree = (
  nodes: readonly postcss.ChildNode[],
  id: string,
  inKeyframes = false,
  nesting = 0,
  counts = { rules: 0, declarations: 0 }
): void => {
  if (nesting > MAX_CSS_NESTING) {
    fail(`CSS nesting exceeds ${MAX_CSS_NESTING} levels`);
  }
  for (const node of nodes) {
    if (node.type === 'atrule') {
      validateAtRule(node, id);
      validateRuleTree(
        node.nodes ?? [],
        id,
        inKeyframes || keyframesAtRules.has(node.name.toLowerCase()),
        nesting + 1,
        counts
      );
      continue;
    }
    if (node.type === 'rule') {
      counts.rules += 1;
      if (counts.rules > MAX_CSS_RULES) {
        fail(`theme.css exceeds ${MAX_CSS_RULES} style rules`);
      }
      if (node.selector.length > MAX_CSS_SELECTOR_LENGTH) {
        fail(`a CSS selector exceeds ${MAX_CSS_SELECTOR_LENGTH} characters`);
      }
      if (!inKeyframes) {
        const selectors = splitSelectorList(node.selector);
        if (
          selectors.length === 0 ||
          selectors.some((selector) => !isThemeScopedSelector(selector, id))
        ) {
          fail(`every selector must start with the ${id} theme root`);
        }
      }
      validateRuleTree(node.nodes ?? [], id, inKeyframes, nesting + 1, counts);
      continue;
    }
    if (node.type === 'decl') {
      counts.declarations += 1;
      if (counts.declarations > MAX_CSS_DECLARATIONS) {
        fail(`theme.css exceeds ${MAX_CSS_DECLARATIONS} declarations`);
      }
      // Browsers discard CSS comments before tokenization. Normalize the raw
      // declaration too so `u/**/rl(...)` cannot bypass this check.
      const rawValue = node.raws.value?.raw ?? '';
      const normalizedValue = `${node.value} ${rawValue}`.replace(
        /\/\*[\s\S]*?\*\//g,
        ''
      );
      if (dangerousCssValuePattern.test(normalizedValue)) {
        fail(`unsafe CSS value in "${node.prop}"`);
      }
    }
  }
};

/** Validate package CSS before it can be served into the application origin. */
export const validateInterfaceThemeCss = (css: unknown, id: string): string => {
  if (typeof css !== 'string' || css.trim().length === 0) {
    return fail('theme.css must be a non-empty string');
  }
  if (Buffer.byteLength(css, 'utf8') > MAX_INTERFACE_THEME_CSS_BYTES) {
    return fail(`theme.css exceeds ${MAX_INTERFACE_THEME_CSS_BYTES} bytes`);
  }
  if (css.includes('\\')) {
    return fail('CSS escapes are not supported');
  }

  let root: postcss.Root;
  try {
    root = postcss.parse(css, { from: `${id}/theme.css` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid syntax';
    return fail(`theme.css cannot be parsed (${message})`);
  }
  validateRuleTree(root.nodes, id);
  return css;
};

export const validateInterfaceThemePackage = (
  manifest: unknown,
  css: unknown,
  expectedId?: string
): InterfaceThemePackage => {
  const validatedManifest = validateInterfaceThemeManifest(
    manifest,
    expectedId
  );
  return {
    manifest: validatedManifest,
    css: validateInterfaceThemeCss(css, validatedManifest.id),
  };
};
