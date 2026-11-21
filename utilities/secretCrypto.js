const crypto = require("crypto");

const ENCRYPTED_PREFIX = "enc:v1:";
const IV_LENGTH_BYTES = 12;

/**
 * Derives a 32-byte AES-256 key from `SETTINGS_ENCRYPTION_KEY` when configured.
 * Returns `null` when encryption at rest is not enabled.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {Buffer | null}
 */
function resolveEncryptionKey(env = process.env) {
  const raw = env && typeof env.SETTINGS_ENCRYPTION_KEY === "string" ? env.SETTINGS_ENCRYPTION_KEY.trim() : "";
  if (!raw) {
    return null;
  }
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

/**
 * Checks whether a value is already encrypted with the `enc:v1:` envelope.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypts a secret string with AES-256-GCM when `SETTINGS_ENCRYPTION_KEY` is configured.
 * Leaves empty values, non-strings, already-encrypted values, or deployments without
 * `SETTINGS_ENCRYPTION_KEY` unchanged for zero-downtime compatibility.
 *
 * @param {string} plaintext
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string}
 */
function encryptSecret(plaintext, env = process.env) {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    return plaintext || "";
  }
  if (isEncryptedValue(plaintext)) {
    return plaintext;
  }
  const key = resolveEncryptionKey(env);
  if (!key) {
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Transparently decrypts an `enc:v1:` AES-256-GCM secret, while returning legacy
 * plaintext values unchanged for backward compatibility.
 *
 * @param {string} storedValue
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string}
 */
function decryptSecret(storedValue, env = process.env) {
  if (typeof storedValue !== "string" || storedValue.length === 0) {
    return "";
  }
  if (!isEncryptedValue(storedValue)) {
    return storedValue;
  }

  const key = resolveEncryptionKey(env);
  if (!key) {
    console.error("[secretCrypto] Encrypted setting found but SETTINGS_ENCRYPTION_KEY is not configured.");
    return "";
  }

  try {
    const payload = storedValue.slice(ENCRYPTED_PREFIX.length);
    const parts = payload.split(":");
    if (parts.length !== 3) {
      throw new Error("Malformed encrypted payload");
    }
    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const ciphertext = Buffer.from(parts[2], "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("[secretCrypto] Failed to decrypt stored setting:", err.message);
    return "";
  }
}

module.exports = {
  ENCRYPTED_PREFIX,
  resolveEncryptionKey,
  isEncryptedValue,
  encryptSecret,
  decryptSecret,
};
