/**
 * UID formatting utilities for FabtrackJS local PC/SC RFID bridge (R-034).
 * Default format: uppercase hexadecimal without separator (e.g. "04A1B2C3").
 */

const VALID_FORMATS = ["hex_upper", "hex_lower", "hex_colon", "dec_be", "dec_le"];

/**
 * Normalizes a Buffer or hex string UID into a clean byte array.
 *
 * @param {Buffer|Uint8Array|string} rawUid
 * @returns {number[]}
 */
function toByteArray(rawUid) {
  if (!rawUid) return [];
  if (Buffer.isBuffer(rawUid) || rawUid instanceof Uint8Array) {
    return Array.from(rawUid);
  }
  const clean = String(rawUid)
    .replace(/[^0-9a-fA-F]/g, "")
    .trim();
  if (!clean || clean.length % 2 !== 0) return [];
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Formats a raw NFC/RFID UID according to the configured format.
 *
 * @param {Buffer|Uint8Array|string} rawUid
 * @param {string} [format="hex_upper"]
 * @returns {string}
 */
function formatUid(rawUid, format = "hex_upper") {
  const bytes = toByteArray(rawUid);
  if (bytes.length === 0) {
    return typeof rawUid === "string" ? rawUid.trim().toUpperCase() : "";
  }

  const hexBytes = bytes.map((b) => b.toString(16).padStart(2, "0"));

  switch (format) {
    case "hex_lower":
      return hexBytes.join("").toLowerCase();
    case "hex_colon":
      return hexBytes.join(":").toUpperCase();
    case "dec_be": {
      let val = BigInt(0);
      for (const b of bytes) {
        val = (val << BigInt(8)) | BigInt(b);
      }
      return val.toString(10);
    }
    case "dec_le": {
      let val = BigInt(0);
      for (let i = bytes.length - 1; i >= 0; i -= 1) {
        val = (val << BigInt(8)) | BigInt(bytes[i]);
      }
      return val.toString(10);
    }
    case "hex_upper":
    default:
      return hexBytes.join("").toUpperCase();
  }
}

module.exports = {
  VALID_FORMATS,
  toByteArray,
  formatUid,
};
