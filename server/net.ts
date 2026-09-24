/** Shared network guards for URL fetch paths (proxy + PDF inspect). */

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|0\.0\.0\.0|::1|::)$|^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|^(fc|fd)[0-9a-f]{2}:|^fe80:/i;

/**
 * Refuse loopback / private / link-local hosts so server-side fetches can't be
 * pointed at the machine's own network (SSRF).
 */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return PRIVATE_HOST.test(h);
}

export const FETCH_MAX_BYTES = 40 * 1024 * 1024;
