import { describe, expect, test } from "bun:test"
import { decrypt, deriveKey, encrypt } from "../../src/auth/file_crypto.ts"

describe("FileCrypto (AES-256-GCM + Argon2id-derived key)", () => {
  const passphrase = "correct horse battery staple"

  test("roundtrip encrypts then decrypts to same plaintext", async () => {
    const key = await deriveKey(passphrase)
    const plaintext = JSON.stringify({ type: "api", key: "sk-secret" })
    const blob = await encrypt(key, plaintext)
    expect(blob.byteLength).toBeGreaterThan(plaintext.length)
    const recovered = await decrypt(key, blob)
    expect(recovered).toBe(plaintext)
  })

  test("wrong key fails decryption", async () => {
    const key1 = await deriveKey(passphrase)
    const key2 = await deriveKey("different passphrase")
    const blob = await encrypt(key1, "hello")
    await expect(decrypt(key2, blob)).rejects.toBeDefined()
  })

  test("tampered ciphertext fails decryption", async () => {
    const key = await deriveKey(passphrase)
    const blob = await encrypt(key, "payload")
    const bytes = new Uint8Array(blob)
    const last = bytes.length - 1
    bytes[last] = (bytes[last] ?? 0) ^ 0xff
    await expect(decrypt(key, bytes.buffer)).rejects.toBeDefined()
  })

  test("each encrypt uses fresh IV (ciphertexts differ)", async () => {
    const key = await deriveKey(passphrase)
    const a = await encrypt(key, "same")
    const b = await encrypt(key, "same")
    const ba = new Uint8Array(a)
    const bb = new Uint8Array(b)
    expect(Buffer.from(ba).equals(Buffer.from(bb))).toBe(false)
  })
})
