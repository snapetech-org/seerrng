/** Keep fallback language metadata attached to each independently loaded catalog. */
const catalogLanguages = new WeakMap<object, ReadonlyMap<string, string>>();

export const mergeMessageCatalogs = (
  catalogs: readonly { locale: string; messages: Record<string, string> }[]
): Record<string, string> => {
  const resolved: Record<string, string> = {};
  const languages = new Map<string, string>();
  for (const { locale, messages } of catalogs) {
    for (const [id, message] of Object.entries(messages)) {
      if (!message.trim()) continue;
      resolved[id] = message;
      languages.set(id, locale);
    }
  }
  catalogLanguages.set(resolved, languages);
  return resolved;
};

export const getCatalogMessageLanguage = (
  messages: object,
  id: string,
  defaultLanguage: string
): string =>
  catalogLanguages.get(messages)?.get(id) ??
  (Object.prototype.hasOwnProperty.call(messages, id) ? defaultLanguage : 'en');
