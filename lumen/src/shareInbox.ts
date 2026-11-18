export async function takeSharedForm(id: string) {
  if (!/^\d{13}-[0-9a-f-]{36}$/.test(id) || !('caches' in window)) return;
  const url = new URL(
    `${import.meta.env.BASE_URL}__share-inbox/${id}`,
    location.origin
  );
  const cache = await caches.open('lumen-share-inbox');
  const stored = await cache.match(url);
  if (!stored || !(await cache.delete(url))) return;
  if (Date.now() - Number(id.slice(0, 13)) > 15 * 60_000) return;
  return stored.formData();
}

export async function takeNativeSharedImage() {
  if (!('caches' in window)) return;
  const cache = await caches.open('seerrng-share-inbox');
  const key = '/__share-inbox/image';
  const stored = await cache.match(key);
  if (!stored || !(await cache.delete(key))) return;
  const blob = await stored.blob();
  const form = new FormData();
  form.set(
    'image',
    new File([blob], 'shared-image', { type: blob.type || 'image/jpeg' })
  );
  return form;
}
