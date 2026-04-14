export interface PKCE {
  verifier: string
  challenge: string
  method: "S256"
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Buffer.from(b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function challengeOf(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return base64url(hash)
}

export async function generatePKCE(): Promise<PKCE> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64url(bytes)
  const challenge = await challengeOf(verifier)
  return { verifier, challenge, method: "S256" }
}

export function generateState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(24)))
}
