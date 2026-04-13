const SALT = new TextEncoder().encode("devclaw.auth.v1")
const IV_LEN = 12
const PBKDF2_ITER = 600_000

export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: PBKDF2_ITER, hash: "SHA-256" },
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
