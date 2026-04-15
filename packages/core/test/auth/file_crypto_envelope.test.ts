import { describe, expect, test } from "bun:test"
import {
  decrypt,
  decryptEnvelope,
  deriveKey,
  encrypt,
  encryptEnvelope,
} from "../../src/auth/file_crypto.ts"

describe("FileCrypto envelope (S-04 — per-install random salt)", () => {
  test("encryptEnvelope output starts with MAGIC byte 0x01", async () => {
    const env = await encryptEnvelope("pw", JSON.stringify({ a: 1 }))
    expect(new Uint8Array(env)[0]).toBe(0x01)
  })

  test("encryptEnvelope → decryptEnvelope round-trip", async () => {
    const pt = "secret payload"
    const env = await encryptEnvelope("pw", pt)
    expect(await decryptEnvelope("pw", env)).toBe(pt)
  })

  test("wrong passphrase fails decryption", async () => {
    const env = await encryptEnvelope("correct", "data")
    await expect(decryptEnvelope("wrong", env)).rejects.toBeDefined()
  })

  test("two encrypts with same passphrase+plaintext produce different salts", async () => {
    const a = await encryptEnvelope("pw", "same")
    const b = await encryptEnvelope("pw", "same")
    const saltA = new Uint8Array(a).slice(1, 17)
    const saltB = new Uint8Array(b).slice(1, 17)
    expect(Buffer.from(saltA).equals(Buffer.from(saltB))).toBe(false)
  })

  test("legacy blob (no MAGIC) still decryptable via decryptEnvelope (backward compat)", async () => {
    const key = await deriveKey("pw") // legacy API (fixed salt)
    const legacyBlob = await encrypt(key, "legacy data")
    expect(await decryptEnvelope("pw", legacyBlob)).toBe("legacy data")
  })

  test("envelope format length ≥ 1+16+12+16 (MAGIC + SALT + IV + AEAD tag min)", async () => {
    const env = await encryptEnvelope("pw", "x")
    expect(new Uint8Array(env).length).toBeGreaterThanOrEqual(1 + 16 + 12 + 16)
  })

  test("tampered envelope fails decryption (AEAD integrity)", async () => {
    const env = await encryptEnvelope("pw", "sensitive")
    const bytes = new Uint8Array(env)
    const last = bytes.length - 1
    bytes[last] = (bytes[last] ?? 0) ^ 0xff
    await expect(decryptEnvelope("pw", bytes.buffer)).rejects.toBeDefined()
  })
})

describe("FileCrypto legacy deriveKey still works (backward compat)", () => {
  test("deriveKey(passphrase) returns usable key (defaults to legacy salt)", async () => {
    const key = await deriveKey("pw")
    const blob = await encrypt(key, "hello")
    expect(await decrypt(key, blob)).toBe("hello")
  })

  test("deriveKey(passphrase, customSalt) produces different key than legacy", async () => {
    const customSalt = crypto.getRandomValues(new Uint8Array(16))
    const keyLegacy = await deriveKey("pw")
    const keyCustom = await deriveKey("pw", customSalt)
    const blob = await encrypt(keyLegacy, "data")
    await expect(decrypt(keyCustom, blob)).rejects.toBeDefined()
  })
})
