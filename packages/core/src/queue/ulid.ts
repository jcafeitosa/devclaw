const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export function ulid(now = Date.now()): string {
  let ts = ""
  let n = now
  for (let i = 0; i < 10; i++) {
    ts = ENCODING[n % 32]! + ts
    n = Math.floor(n / 32)
  }
  let rand = ""
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  for (let i = 0; i < 16; i++) rand += ENCODING[bytes[i]! % 32]
  return ts + rand
}
