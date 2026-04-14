import type { CLIReport, DetectCLIOpts } from "./cli.ts"
import { detectCLIs } from "./cli.ts"
import type { ConventionsReport } from "./conventions.ts"
import { detectConventions } from "./conventions.ts"
import type { StackReport } from "./stack.ts"
import { detectStack } from "./stack.ts"

export interface DiscoveryReport {
  scannedAt: string
  projectRoot: string
  stack: StackReport
  clis: CLIReport
  conventions: ConventionsReport
}

export interface DiscoverOpts {
  cli?: DetectCLIOpts
}

export async function discover(rootDir: string, opts: DiscoverOpts = {}): Promise<DiscoveryReport> {
  const [stack, clis, conventions] = await Promise.all([
    detectStack(rootDir),
    detectCLIs(opts.cli),
    detectConventions(rootDir),
  ])
  return {
    scannedAt: new Date().toISOString(),
    projectRoot: rootDir,
    stack,
    clis,
    conventions,
  }
}
