import { createConnection } from "node:net"
import type { Server } from "bun"
import {
  OAuthPortExhaustedError,
  OAuthStateMismatchError,
  OAuthTimeoutError,
  OAuthUserDeniedError,
} from "./errors.ts"

export interface CallbackServerConfig {
  ports: number[]
  state: string
  timeoutMs: number
  callbackPath?: string
}

export interface BoundServer {
  port: number
  redirectUri: string
}

const SUCCESS_HTML =
  "<html><body><h2>Authorization received. You may close this tab.</h2></body></html>"
const ERROR_HTML =
  "<html><body><h2>Authorization failed. Check your CLI for details.</h2></body></html>"

export class CallbackServer {
  private readonly cfg: Required<CallbackServerConfig>
  private server: Server<undefined> | null = null
  private boundPort = 0
  private resolve: ((code: string) => void) | null = null
  private reject: ((err: Error) => void) | null = null
  private timer: Timer | null = null
  private settled = false

  constructor(cfg: CallbackServerConfig) {
    this.cfg = { callbackPath: "/auth/callback", ...cfg }
  }

  async start(): Promise<BoundServer> {
    for (const port of this.cfg.ports) {
      if (await isPortAvailable(port)) {
        this.server = Bun.serve({
          port,
          hostname: "127.0.0.1",
          fetch: (req) => this.handle(req),
        })
        this.boundPort = port
        return {
          port,
          redirectUri: `http://localhost:${port}${this.cfg.callbackPath}`,
        }
      }
    }
    throw new OAuthPortExhaustedError(this.cfg.ports)
  }

  wait(): Promise<string> {
    return new Promise<string>((res, rej) => {
      this.resolve = res
      this.reject = rej
      this.timer = setTimeout(() => {
        this.settle(() => rej(new OAuthTimeoutError(this.cfg.timeoutMs)))
      }, this.cfg.timeoutMs)
    })
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.server) {
      this.server.stop(true)
      this.server = null
    }
  }

  private settle(action: () => void): void {
    if (this.settled) return
    this.settled = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    action()
    setTimeout(() => {
      void this.close()
    }, 10)
  }

  private handle(req: Request): Response {
    const url = new URL(req.url)
    if (url.pathname !== this.cfg.callbackPath) {
      return new Response("Not found", { status: 404 })
    }
    const q = url.searchParams
    const error = q.get("error")
    if (error) {
      this.settle(() => this.reject?.(new OAuthUserDeniedError(error)))
      return new Response(ERROR_HTML, { status: 400, headers: { "content-type": "text/html" } })
    }
    const state = q.get("state")
    if (state !== this.cfg.state) {
      this.settle(() => this.reject?.(new OAuthStateMismatchError()))
      return new Response(ERROR_HTML, { status: 400, headers: { "content-type": "text/html" } })
    }
    const code = q.get("code")
    if (!code) {
      this.settle(() => this.reject?.(new Error("OAuth: missing code parameter")))
      return new Response(ERROR_HTML, { status: 400, headers: { "content-type": "text/html" } })
    }
    this.settle(() => this.resolve?.(code))
    return new Response(SUCCESS_HTML, { status: 200, headers: { "content-type": "text/html" } })
  }

  get port(): number {
    return this.boundPort
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" })
    let done = false
    const finish = (free: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(free)
    }
    socket.once("connect", () => finish(false))
    socket.once("error", () => finish(true))
    socket.setTimeout(300, () => finish(true))
  })
}
