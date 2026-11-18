import { api } from './api';
import { sessionGeneration } from './sessionState';

function waitForActivation(registration: ServiceWorkerRegistration) {
  if (registration.active?.state === 'activated') return Promise.resolve();
  const worker =
    registration.installing ?? registration.waiting ?? registration.active;
  if (!worker)
    return Promise.reject(new Error('Browser push worker is unavailable.'));
  return new Promise<void>((resolve, reject) => {
    function finish(error?: Error) {
      worker?.removeEventListener('statechange', check);
      window.clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    }
    function check() {
      if (worker?.state === 'activated') finish();
      if (worker?.state === 'redundant')
        finish(new Error('Browser push worker could not activate.'));
    }
    const timer = window.setTimeout(
      () => finish(new Error('Browser push worker did not activate.')),
      10000
    );
    worker.addEventListener('statechange', check);
    check();
  });
}

export function supportsBrowserPush() {
  return (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
}

const workerPath = `${import.meta.env.BASE_URL}push-worker/notifications.js`;
const workerScope = (id: number) =>
  `${import.meta.env.BASE_URL}push-worker/${id}/`;

export async function getBrowserPushSubscription(id: number) {
  if (!supportsBrowserPush()) return null;
  const scope = new URL(workerScope(id), location.origin).href;
  const script = new URL(workerPath, location.origin).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const registration = registrations.find(
    (candidate) =>
      candidate.scope === scope && candidate.active?.scriptURL === script
  );
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function unsubscribeBrowserPush(id: number, endpoint: string) {
  const generation = sessionGeneration();
  const subscription = await getBrowserPushSubscription(id);
  return generation === sessionGeneration() &&
    subscription?.endpoint === endpoint
    ? subscription.unsubscribe()
    : false;
}

export async function registerBrowserPush(id: number) {
  const generation = sessionGeneration();
  if (!supportsBrowserPush())
    throw new Error(
      'Browser push requires a secure origin and a compatible browser.'
    );
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error(
      'Allow notifications in your browser to register this device.'
    );
  }
  const settings = await api<{
    enablePushRegistration?: boolean;
    vapidPublic?: string;
  }>('/settings/public', { cache: 'no-store' });
  if (!settings.enablePushRegistration || !settings.vapidPublic) {
    throw new Error(
      'Browser push registration is disabled. Check your notification preferences.'
    );
  }
  if (generation !== sessionGeneration()) return false;

  const registration = await navigator.serviceWorker.register(workerPath, {
    scope: workerScope(id),
  });
  await waitForActivation(registration);
  if (generation !== sessionGeneration()) return false;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: settings.vapidPublic,
    }));
  try {
    if (generation !== sessionGeneration()) return false;
    const { keys } = subscription.toJSON();
    if (!keys?.auth || !keys.p256dh)
      throw new Error('The browser did not provide subscription keys.');
    await api(
      '/user/registerPushSubscription',
      {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          auth: keys.auth,
          p256dh: keys.p256dh,
          userAgent: navigator.userAgent,
        }),
      },
      'empty'
    );
    return generation === sessionGeneration() ? subscription.endpoint : null;
  } finally {
    if (!existing && generation !== sessionGeneration())
      await subscription.unsubscribe().catch(() => false);
  }
}
