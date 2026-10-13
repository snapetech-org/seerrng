/**
 * @template T
 * @param {Promise<T>} localeLoad
 * @param {{
 *   isActive: () => boolean;
 *   onSuccess: (value: T) => void;
 *   onFailure: () => void;
 * }} handlers
 * @returns {Promise<void>}
 */
export const settleLocaleLoad = (localeLoad, handlers) =>
  localeLoad
    .then((value) => {
      if (handlers.isActive()) {
        handlers.onSuccess(value);
      }
    })
    .catch(() => {
      if (handlers.isActive()) {
        handlers.onFailure();
      }
    });
