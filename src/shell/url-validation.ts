/**
 * URL pattern validation for shell commands (curl, browse).
 * Checks URLs against allowed URL patterns with wildcard support.
 *
 * Pattern syntax:
 * - `*` matches any single path segment (no slashes)
 * - `**` matches any number of path segments (including zero)
 * - `*.example.com` in host part matches any subdomain
 * - Scheme is matched literally (https, http)
 * - Query string and fragment are ignored during matching
 *
 * Examples:
 * - `https://*.openfoodfacts.org/api/**`  → only API paths
 * - `https://api.example.com/v2/**`       → only v2 endpoints
 * - `https://cdn.example.com/images/*`    → one level under /images/
 * - `*.example.com`                       → any path, any subdomain (shorthand)
 */

/**
 * Convert a URL pattern to a RegExp.
 *
 * Splits pattern into scheme + host + path, converts wildcards:
 * - Host `*` → one DNS label ([a-z0-9-]+)
 * - Host `*.` prefix → any subdomain chain (including bare domain)
 * - Path `**` → any number of segments (.*)
 * - Path `*` → single segment ([^/]+)
 */
function patternToRegex(pattern: string): RegExp {
  // If pattern has no scheme, treat as host-only shorthand (any scheme, any path)
  if (!pattern.includes('://')) {
    const hostRegex = hostPartToRegex(pattern)
    return new RegExp(`^https?://${hostRegex}(/.*)?$`, 'i')
  }

  // Split scheme://host/path
  const schemeEnd = pattern.indexOf('://')
  const scheme = pattern.slice(0, schemeEnd)
  const rest = pattern.slice(schemeEnd + 3)

  const slashIdx = rest.indexOf('/')
  let hostPart: string
  let pathPart: string

  if (slashIdx === -1) {
    hostPart = rest
    pathPart = '/**' // no path specified = allow all
  } else {
    hostPart = rest.slice(0, slashIdx)
    pathPart = rest.slice(slashIdx)
  }

  const hostRegex = hostPartToRegex(hostPart)
  const pathRegex = pathPartToRegex(pathPart)

  return new RegExp(`^${escapeRegex(scheme)}://${hostRegex}${pathRegex}$`, 'i')
}

function hostPartToRegex(host: string): string {
  if (host === '*') {
    return '[a-z0-9.-]+'
  }
  if (host.startsWith('*.')) {
    // *.example.com → (anything.)? + example.com
    const base = escapeRegex(host.slice(2))
    return `([a-z0-9-]+\\.)*${base}`
  }
  return escapeRegex(host)
}

function pathPartToRegex(path: string): string {
  // Split by / and convert each segment
  const segments = path.split('/')
  const parts: string[] = []

  for (const seg of segments) {
    if (seg === '**') {
      parts.push('.*')
    } else if (seg.includes('*')) {
      // Replace * with single-segment wildcard, escape rest
      parts.push(seg.split('*').map(escapeRegex).join('[^/]*'))
    } else {
      parts.push(escapeRegex(seg))
    }
  }

  // Join back with /
  let result = parts.join('/')

  // If pattern ends with /**, also match without trailing slash
  if (path.endsWith('/**')) {
    // Already handled by .* matching empty string
  }

  return result
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Cache compiled patterns
const regexCache = new Map<string, RegExp>()

function getRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern)
  if (!re) {
    re = patternToRegex(pattern)
    regexCache.set(pattern, re)
  }
  return re
}

/**
 * Check if a URL matches the allowed URL patterns.
 * Returns null if allowed, error message string if blocked.
 */
export function validateUrl(url: string, allowedUrls: string[] | undefined): string | null {
  if (!allowedUrls || allowedUrls.length === 0) return null

  // Normalize: strip query string and fragment for matching
  let matchUrl: string
  try {
    const parsed = new URL(url)
    matchUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    return `invalid URL: ${url}`
  }

  for (const pattern of allowedUrls) {
    if (getRegex(pattern).test(matchUrl)) {
      return null
    }
  }

  return `URL not allowed: ${url}. Allowed patterns: ${allowedUrls.join(', ')}`
}
