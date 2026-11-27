export function testAppPath(path: string): string {
  if (process.env.LUMEN_TEST_MOUNT !== '/lumen') return path;
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//')) return path;
  if (path === '/lumen' || path.startsWith('/lumen/')) return path;
  const route = path.startsWith('/') ? path.slice(1) : path;
  return `/lumen/${route}`;
}
