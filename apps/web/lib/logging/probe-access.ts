/**
 * The reverse-proxy admission rule for `C-091`, in one place.
 *
 * `C-091` makes the reverse proxy, not the application, the access boundary for `/healthz` and
 * `/readyz`: both paths are reachable only from the uptime monitor's address. The deployment
 * configuration for that proxy is not part of this application, so this module fixes the rule the
 * configuration must apply and gives it a testable form. A proxy configuration that admits an address
 * this policy refuses is a deployment defect, not an application one.
 *
 * The policy compares the peer address the proxy itself observed. It deliberately provides no helper
 * for `X-Forwarded-For`: a header from the client is not an identity, and accepting one here would
 * turn the allowlist into a suggestion.
 */
import { isIP } from 'node:net';

/** The admission answer for one peer address. */
export interface ProbeAccessPolicy {
  /** @param address - The peer address the proxy observed, or `null` when it has none. */
  allows(address: string | null): boolean;
}

/** Normalises an IPv4-mapped IPv6 address and lower-cases the rest. */
function normaliseAddress(address: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  return (mapped?.[1] ?? address).toLowerCase();
}

/** Converts a dotted IPv4 address to its unsigned 32-bit value. */
function ipv4ToNumber(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** One parsed allowlist entry: an exact address or an IPv4 CIDR block. */
type AllowEntry =
  | { readonly kind: 'exact'; readonly address: string }
  | { readonly kind: 'cidr'; readonly network: number; readonly mask: number };

/** Parses one configured entry, ignoring a malformed one rather than failing boot here. */
function parseEntry(entry: string): AllowEntry | null {
  const value = normaliseAddress(entry.trim());
  if (value === '') return null;

  const slash = value.indexOf('/');
  if (slash === -1) {
    return isIP(value) === 0 ? null : { kind: 'exact', address: value };
  }

  const address = value.slice(0, slash);
  const prefix = value.slice(slash + 1);
  if (isIP(address) !== 4 || !/^\d{1,2}$/.test(prefix)) return null;
  const bits = Number(prefix);
  if (bits > 32) return null;
  const network = ipv4ToNumber(address);
  if (network === null) return null;
  const mask = bits === 0 ? 0 : (0xffff_ffff << (32 - bits)) >>> 0;
  return { kind: 'cidr', network: (network & mask) >>> 0, mask };
}

/**
 * Builds the probe allowlist.
 *
 * @param entries - Exact addresses and IPv4 CIDR blocks belonging to the uptime monitor.
 * @returns A policy that answers `false` for `null`, an unknown address or a malformed query.
 */
export function createProbeAccessPolicy(entries: readonly string[]): ProbeAccessPolicy {
  const parsed = entries.map(parseEntry).filter((entry): entry is AllowEntry => entry !== null);

  return {
    allows(address) {
      if (address === null || address.trim() === '') return false;
      const value = normaliseAddress(address.trim());
      const numeric = isIP(value) === 4 ? ipv4ToNumber(value) : null;

      return parsed.some((entry) => {
        if (entry.kind === 'exact') return entry.address === value;
        if (numeric === null) return false;
        return (numeric & entry.mask) >>> 0 === entry.network;
      });
    },
  };
}
