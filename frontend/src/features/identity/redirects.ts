/**
 * Public without an account: the core trip (map → parkings → route → navigation → walk) and the
 * pages that explain the data. CLAUDE.md rule 5: the core flow works when Auth0 is down, and judges
 * can run the DEMO without signing up. Account features (Passport, wallet, Motion, Buddy) stay protected.
 */
export const PUBLIC_ROUTES = [
  '/',
  '/navigation',
  '/confidentialitate',
  '/privacy',
  '/help',
  '/team',
  '/auth/callback',
  '/data',
  '/sources',
  '/city',
  '/sanse-parcare',
  '/parking-chance',
  '/date-parcari',
  '/parking-data',
];
export function isProtectedRoute(path: string) {
  return !PUBLIC_ROUTES.includes(path);
}
/** Reject external, protocol-relative, encoded slash/control and callback destinations. */
export function safeReturnTo(value: unknown, origin: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 6000 ||
    !value.startsWith('/') ||
    /[\\\u0000-\u0020]/.test(value) ||
    /%(?:2f|5c|00|0a|0d)/i.test(value.split('?')[0] ?? '')
  )
    return '/profile';
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin ||
      url.pathname.startsWith('/auth/') ||
      url.searchParams.has('code') ||
      url.searchParams.has('state') ||
      url.searchParams.has('error')
    )
      return '/profile';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/profile';
  }
}
