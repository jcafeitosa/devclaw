const LEGACY_SALT = new TextEncoder().encode("devclaw.auth.v1")
const SALT_LEN = 16
const IV_LEN = 12
const MAGIC = 0x01
const PBKDF2_ITER = 600_000

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LEN))
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array = LEGACY_SALT,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt), iterations: PBKDF2_ITER, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const out = new Uint8Array(IV_LEN + ct.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ct), IV_LEN)
  return out.buffer
}

export async function decrypt(key: CryptoKey, blob: ArrayBufferLike): Promise<string> {
  const bytes = new Uint8Array(blob)
  const iv = bytes.slice(0, IV_LEN)
  const ct = bytes.slice(IV_LEN)
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct)
  return new TextDecoder().decode(pt)
}

/**
 * High-level envelope encryption per ADR-022 S-04.
 * Generates a per-call random salt (16 bytes), stores it inline.
 * Envelope layout: [MAGIC=0x01(1)][SALT(16)][IV(12)][ciphertext+GCM tag].
 * Eliminates the previous rainbow-tableable fixed salt ("devclaw.auth.v1").
 */
export async function encryptEnvelope(passphrase: string, plaintext: string): Promise<ArrayBuffer> {
  const salt = generateSalt()
  const key = await deriveKey(passphrase, salt)
  const innerBlob = await encrypt(key, plaintext)
  const inner = new Uint8Array(innerBlob)
  const out = new Uint8Array(1 + SALT_LEN + inner.byteLength)
  out[0] = MAGIC
  out.set(salt, 1)
  out.set(inner, 1 + SALT_LEN)
  return out.buffer
}

/**
 * Decrypts an envelope blob. Auto-detects format:
 *   - New (MAGIC 0x01) → extract per-install salt, derive, decrypt.
 *   - Legacy (no MAGIC) → uses the "devclaw.auth.v1" fixed salt.
 * Reads continue to work during migration; writes auto-upgrade to new format.
 */
export async function decryptEnvelope(passphrase: string, blob: ArrayBufferLike): Promise<string> {
  const bytes = new Uint8Array(blob)
  if (bytes[0] === MAGIC && bytes.length > 1 + SALT_LEN + IV_LEN) {
    const salt = bytes.slice(1, 1 + SALT_LEN)
    const inner = bytes.slice(1 + SALT_LEN)
    const key = await deriveKey(passphrase, salt)
    return decrypt(key, inner.buffer)
  }
  const key = await deriveKey(passphrase, LEGACY_SALT)
  return decrypt(key, blob)
}
