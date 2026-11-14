import { ZodError } from 'zod';

/** Contains only an HTTP status, never upstream response bodies, headers or coordinates. */
export class RoutingHttpError extends Error {
  constructor(readonly status: number) {
    super(`Routing provider HTTP ${status}`);
  }
}

export function reportRoutingFailure(
  provider: 'ors' | 'osrm' | 'fossgis',
  profile: 'driving-car' | 'foot-walking' | 'cycling-regular',
  operation: 'directions' | 'matrix',
  error: unknown,
) {
  const status = error instanceof RoutingHttpError ? error.status : undefined;
  const category =
    status === 401 || status === 403
      ? 'authentication_failure'
      : status === 429
        ? 'rate_limited'
        : status === 404
          ? 'not_found'
          : status !== undefined
            ? 'provider_http_error'
            : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
              ? 'timeout'
              : error instanceof ZodError || error instanceof SyntaxError ||
                  (error instanceof Error && error.message === 'ROUTE_ENDPOINT_MISMATCH')
                ? 'invalid_payload'
                : 'network_or_provider_failure';
  // Do not log arbitrary exception messages: fetch errors can include credentials or location URLs.
  console.warn('[routing] provider failure', { provider, profile, operation, category, status });
}
