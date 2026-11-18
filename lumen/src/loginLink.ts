export function clearLoginLinkFromAddress() {
  const { hash, pathname, search } = window.location;
  const params = new URLSearchParams(hash.slice(1));
  if (!params.has('loginToken')) return;
  params.delete('loginToken');
  const remaining = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${search}${remaining ? `#${remaining}` : ''}`
  );
}
