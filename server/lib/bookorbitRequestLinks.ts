import type BookRequestSearch from '@server/entity/BookRequestSearch';
import type { ReadarrSettings } from '@server/lib/settings';
import { buildServiceUrl } from '@server/utils/serviceUrl';

/** Only a linked request may supply a BookOrbit action. Never expose service credentials. */
export const bookOrbitRequestLinks = (
  operations: Pick<
    BookRequestSearch,
    | 'serviceId'
    | 'format'
    | 'bookorbitRequestId'
    | 'providerManagedSearch'
    | 'state'
  >[],
  services: ReadarrSettings[]
): { format: 'ebook' | 'audiobook'; url: string }[] => {
  const links: { format: 'ebook' | 'audiobook'; url: string }[] = [];
  for (const operation of operations) {
    const id = operation.bookorbitRequestId;
    const service = services.find(
      (candidate) => candidate.id === operation.serviceId
    );
    if (
      operation.providerManagedSearch ||
      !Number.isSafeInteger(id) ||
      (id ?? 0) < 1 ||
      !service?.syncEnabled ||
      service.backend !== 'bookorbit' ||
      operation.state === 'available' ||
      links.some((link) => link.format === operation.format)
    ) {
      continue;
    }
    const url = buildServiceUrl({
      useSsl: service.useSsl,
      hostname: service.hostname,
      port: service.port,
      urlBase: service.baseUrl,
      path: `/requests/${id}`,
    });
    try {
      const parsed = new URL(url);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password
      ) {
        continue;
      }
      links.push({ format: operation.format, url: parsed.toString() });
    } catch {
      // Misconfigured servers cannot create a link for a user.
    }
  }
  return links;
};
