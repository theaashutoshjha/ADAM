// =============================================================
// AuditEQ — Enterprise SSRF Protection & Safe Network Validator
// =============================================================

import dns from 'node:dns';
import net from 'node:net';

/**
 * Checks if an IPv4 address is in a private, loopback, link-local,
 * or cloud provider metadata range.
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid format -> reject
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;
  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Cloud Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 172.16.0.0/12 (Private)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 224.0.0.0/4 (Multicast)
  if (b0 >= 224 && b0 <= 239) return true;
  // 240.0.0.0/4 (Reserved)
  if (b0 >= 240) return true;
  // 255.255.255.255 (Broadcast)
  if (parts.every((p) => p === 255)) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, or link-local range.
 */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // IPv6 loopback
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  // Unspecified
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 address (::ffff:127.0.0.1)
  if (lower.startsWith('::ffff:')) {
    const ipv4Part = lower.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateOrReservedIpv4(ipv4Part);
    }
    return true;
  }

  // Unique local address fc00::/7 (fc00... or fd00...)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // Link-local fe80::/10
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true;
  }

  return false;
}

/**
 * Default trusted audio/telephony domains permitted for server-side fetches.
 */
export const DEFAULT_ALLOWED_HOSTS = [
  'cloudphone.tatateleservices.com',
  'tatateleservices.com',
  '*.tatateleservices.com',
  'smartflo.tatateleservices.com',
  '*.smartflo.tatateleservices.com',
  'api-smartflo.tatateleservices.com',
  's3.amazonaws.com',
  '*.amazonaws.com',
  'storage.googleapis.com',
  'deepgram.com',
  'api.deepgram.com',
  'api.groq.com',
  'generativelanguage.googleapis.com',
];

/**
 * Validates whether a given URL is HTTP/HTTPS, resolves to a public, non-private IP,
 * and matches allowed audio or external provider hosts.
 */
export async function validateSafeUrl(
  urlStr: string,
  customAllowedHosts?: string[]
): Promise<{ isSafe: boolean; error?: string; resolvedIp?: string; parsedUrl?: URL }> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { isSafe: false, error: 'Malformed or unparseable URL' };
  }

  // 1. Strict Protocol Enforcement: HTTPS strictly required for telephony & external audio
  if (parsed.protocol !== 'https:') {
    return { isSafe: false, error: `Insecure protocol "${parsed.protocol}". Only HTTPS is permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Disallow localhost or local hostnames
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { isSafe: false, error: 'Access to localhost and internal domain names is forbidden.' };
  }

  // Disallow IP literals directly in the URL hostname if they are private
  if (net.isIPv4(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      return { isSafe: false, error: 'Access to private or metadata IPv4 address is forbidden.' };
    }
  } else if (net.isIPv6(hostname)) {
    if (isPrivateOrReservedIpv6(hostname)) {
      return { isSafe: false, error: 'Access to private or metadata IPv6 address is forbidden.' };
    }
  }

  // 2. Host Allowlist Enforcement (if configured or defaulted)
  const allowedList = [
    ...(customAllowedHosts || []),
    ...DEFAULT_ALLOWED_HOSTS,
  ].map((h) => h.toLowerCase().trim());

  const hostMatches = allowedList.some((allowed) => {
    if (allowed.startsWith('*.')) {
      const rootDomain = allowed.slice(2);
      return hostname === rootDomain || hostname.endsWith(`.${rootDomain}`);
    }
    return hostname === allowed || hostname.endsWith(`.${allowed}`);
  });

  if (!hostMatches) {
    return {
      isSafe: false,
      error: `Hostname "${hostname}" is not in the approved external provider allowlist.`,
    };
  }

  // 3. DNS Resolution and Anti-Rebinding Check
  try {
    const lookupResult = await dns.promises.lookup(hostname, { all: true });
    if (!lookupResult || lookupResult.length === 0) {
      return { isSafe: false, error: `Unable to resolve DNS for hostname "${hostname}".` };
    }

    for (const record of lookupResult) {
      if (record.family === 4 && isPrivateOrReservedIpv4(record.address)) {
        return {
          isSafe: false,
          error: `DNS resolution for "${hostname}" mapped to forbidden private/cloud metadata IP: ${record.address}`,
          resolvedIp: record.address,
        };
      }
      if (record.family === 6 && isPrivateOrReservedIpv6(record.address)) {
        return {
          isSafe: false,
          error: `DNS resolution for "${hostname}" mapped to forbidden private/local IPv6: ${record.address}`,
          resolvedIp: record.address,
        };
      }
    }

    return { isSafe: true, resolvedIp: lookupResult[0].address, parsedUrl: parsed };
  } catch (dnsErr: any) {
    return { isSafe: false, error: `DNS lookup failed for "${hostname}": ${dnsErr?.message}` };
  }
}
