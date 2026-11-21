const net = require("net");
const dns = require("dns");

/**
 * Parses a comma-separated host allowlist from environment variables.
 * Entries may be hostnames (`ollama.internal`, `localhost`) or `host:port` (`localhost:11434`).
 *
 * @param {string[]} envKeys
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {Set<string>}
 */
function parseAllowlist(envKeys = [], env = process.env) {
  const allowed = new Set();
  for (const key of envKeys) {
    const raw = env && env[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    for (const entry of raw.split(",")) {
      const normalized = entry.trim().toLowerCase();
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }
  return allowed;
}

/**
 * Checks whether an IPv4 address string belongs to a private, loopback, link-local,
 * CGNAT, multicast, or reserved range.
 *
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIpv4(ip) {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (Loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local / Cloud Metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (Benchmark)
  if (a >= 224) return true; // Multicast & Reserved (224.0.0.0/4+)

  return false;
}

/**
 * Checks whether an IPv4 or IPv6 address is private, loopback, link-local, metadata, or reserved.
 *
 * @param {string} rawIp
 * @returns {boolean}
 */
function isPrivateOrReservedIp(rawIp) {
  if (typeof rawIp !== "string") return true;
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(ip);

  if (ipVersion === 4) {
    return isPrivateIpv4(ip);
  }

  if (ipVersion === 6) {
    if (ip === "::" || ip === "::1") return true;

    // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254)
    const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4Mapped) {
      return isPrivateIpv4(v4Mapped[1]);
    }
    // Hex IPv4-mapped form ::ffff:7f00:1
    const v4HexMapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (v4HexMapped) {
      const hi = parseInt(v4HexMapped[1], 16);
      const lo = parseInt(v4HexMapped[2], 16);
      const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateIpv4(ipv4);
    }

    // ULA fc00::/7 (fc.. / fd..), link-local fe80::/10 (fe8..feb), multicast ff00::/8
    const firstHextet = parseInt(ip.split(":")[0] || "0", 16);
    if ((firstHextet & 0xfe00) === 0xfc00) return true;
    if ((firstHextet & 0xffc0) === 0xfe80) return true;
    if ((firstHextet & 0xff00) === 0xff00) return true;
    if (firstHextet === 0) return true;

    return false;
  }

  return true;
}

/**
 * Checks whether a hostname is a known local/internal/metadata hostname.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
function isForbiddenInternalHostname(hostname) {
  const lower = hostname.toLowerCase().replace(/\.+$/, "");
  if (!lower) return true;
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal") || lower.endsWith(".home.arpa")) return true;
  if (lower === "metadata.google.internal" || lower === "metadata" || lower === "instance-data") return true;
  return false;
}

/**
 * Synchronously validates an outbound HTTP/HTTPS URL against SSRF rules.
 * Checks scheme, credentials, allowlist, internal hostnames, and direct IP literals.
 *
 * @param {string} rawUrl
 * @param {Object} [options]
 * @param {string[]} [options.allowlistEnvKeys]
 * @param {NodeJS.ProcessEnv} [options.env=process.env]
 * @param {string} [options.label="URL externe"]
 * @returns {{ url: URL, hostname: string, allowlisted: boolean }}
 */
function validateOutboundUrl(
  rawUrl,
  { allowlistEnvKeys = ["SSRF_ALLOWED_HOSTS"], env = process.env, label = "URL externe" } = {},
) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error(`${label} invalide ou vide.`);
  }
  const trimmed = rawUrl.trim();
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new Error(`${label} contient des caractères de contrôle interdits.`);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} malformée.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} doit utiliser le protocole HTTP ou HTTPS.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${label} ne doit pas contenir d'identifiants intégrés.`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const hostWithPort = parsed.host.toLowerCase();
  const allowlist = parseAllowlist(allowlistEnvKeys, env);
  const allowlisted = allowlist.has(hostname) || allowlist.has(hostWithPort);

  if (allowlisted) {
    return { url: parsed, hostname, allowlisted: true };
  }

  if (isForbiddenInternalHostname(hostname)) {
    throw new Error(
      `${label} refusée (hôte interne ou local "${hostname}" non autorisé). Ajoutez-le explicitement dans ${allowlistEnvKeys[0] || "SSRF_ALLOWED_HOSTS"} si nécessaire.`,
    );
  }

  if (net.isIP(hostname) !== 0 && isPrivateOrReservedIp(hostname)) {
    throw new Error(
      `${label} refusée (adresse IP privée, locale ou de métadonnées "${hostname}" bloquée contre les SSRF).`,
    );
  }

  return { url: parsed, hostname, allowlisted: false };
}

/**
 * Full async SSRF guard: runs `validateOutboundUrl` AND resolves DNS to block
 * domains pointing to private/loopback/metadata IPs (DNS rebinding defense).
 *
 * @param {string} rawUrl
 * @param {Object} [options]
 * @param {string[]} [options.allowlistEnvKeys]
 * @param {NodeJS.ProcessEnv} [options.env=process.env]
 * @param {string} [options.label="URL externe"]
 * @param {Function} [options.dnsLookup] Optional injectable lookup for unit tests
 * @returns {Promise<{ url: URL, hostname: string, allowlisted: boolean }>}
 */
async function assertOutboundUrlSafe(rawUrl, options = {}) {
  const checked = validateOutboundUrl(rawUrl, options);
  if (checked.allowlisted || net.isIP(checked.hostname) !== 0) {
    return checked;
  }

  const lookupFn = options.dnsLookup || ((host) => dns.promises.lookup(host, { all: true }));
  let records;
  try {
    records = await lookupFn(checked.hostname);
  } catch {
    throw new Error(`${options.label || "URL externe"} : impossible de résoudre l'hôte "${checked.hostname}".`);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`${options.label || "URL externe"} : aucune adresse IP résolue pour "${checked.hostname}".`);
  }

  for (const rec of records) {
    const addr = typeof rec === "string" ? rec : rec && rec.address;
    if (!addr || isPrivateOrReservedIp(addr)) {
      throw new Error(
        `${options.label || "URL externe"} refusée (l'hôte "${checked.hostname}" pointe vers une adresse IP interne ou réservée).`,
      );
    }
  }

  return checked;
}

module.exports = {
  parseAllowlist,
  isPrivateIpv4,
  isPrivateOrReservedIp,
  isForbiddenInternalHostname,
  validateOutboundUrl,
  assertOutboundUrlSafe,
};
