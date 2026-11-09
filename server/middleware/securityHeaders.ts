export const buildContentSecurityPolicy = (
  nodeEnv = process.env.NODE_ENV,
  frontend: 'native' | 'lumen' = 'native'
): string => {
  const development = nodeEnv === 'development';

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self'${development ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    `style-src 'self' 'unsafe-inline'${frontend === 'lumen' ? ' https://fonts.googleapis.com' : ''}`,
    "img-src 'self' data: blob: https:",
    `font-src 'self' data:${frontend === 'lumen' ? ' https://fonts.gstatic.com' : ''}`,
    `connect-src 'self' https://plex.tv https://*.plex.tv https://api.github.com${development ? ' ws: wss:' : ''}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
  ].join('; ');
};

export const SECURITY_RESPONSE_HEADERS = {
  'Content-Security-Policy': buildContentSecurityPolicy(),
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Origin-Agent-Cluster': '?1',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
} as const;

export const STRICT_TRANSPORT_SECURITY_HEADER = 'max-age=31536000';

const securityHeaders: Middleware = (req, res, next) => {
  for (const [name, value] of Object.entries(SECURITY_RESPONSE_HEADERS)) {
    res.setHeader(name, value);
  }
  if (req.secure) {
    res.setHeader(
      'Strict-Transport-Security',
      STRICT_TRANSPORT_SECURITY_HEADER
    );
  } else {
    res.removeHeader('Strict-Transport-Security');
  }
  res.removeHeader('X-Powered-By');
  next();
};

export default securityHeaders;
