const base = new URL('../', self.location.href);
const icon = new URL('icon-192.png', base).href;

function notificationTarget(value) {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  ) {
    return base.href;
  }
  const url = new URL(value, base.origin);
  const rawPath = value.split(/[?#]/, 1)[0];
  if (url.origin !== base.origin || url.pathname !== rawPath) return base.href;
  if (base.pathname !== '/' && url.pathname.startsWith(base.pathname))
    return url.href;
  if (
    /^\/(?:requests(?:\/status)?|issues(?:\/\d+)?|movie\/\d+|tv\/\d+|book\/[^/]+)\/?$/.test(
      url.pathname
    )
  ) {
    return new URL(value.slice(1), base).href;
  }
  return base.href;
}

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (typeof payload?.subject !== 'string' || !payload.subject) return;
  event.waitUntil(
    self.registration.showNotification(payload.subject, {
      body: typeof payload.message === 'string' ? payload.message : '',
      icon,
      data: { actionUrl: notificationTarget(payload.actionUrl) },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const value = event.notification.data?.actionUrl;
  const target =
    typeof value === 'string' && value.startsWith(base.href)
      ? value
      : base.href;
  event.waitUntil(self.clients.openWindow(target));
});
