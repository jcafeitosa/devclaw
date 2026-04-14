import { join } from "node:path"

export interface Detection {
  id: string
  evidence: string[]
  version?: string
}

export interface StackReport {
  languages: Detection[]
  runtimes: Detection[]
  frameworks: Detection[]
  testRunners: Detection[]
}

const FRAMEWORK_DEPS = [
  "astro",
  "next",
  "nuxt",
  "remix",
  "sveltekit",
  "elysia",
  "hono",
  "express",
  "fastify",
  "react",
  "vue",
  "solid-js",
  "svelte",
]
const TEST_RUNNER_DEPS = ["vitest", "jest", "mocha", "ava", "@japa/runner"]
const RUNTIME_LOCKS: Array<{ file: string; id: string }> = [
  { file: "bun.lock", id: "bun" },
  { file: "bun.lockb", id: "bun" },
  { file: "pnpm-lock.yaml", id: "pnpm" },
  { file: "yarn.lock", id: "yarn" },
  { file: "package-lock.json", id: "npm" },
]

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists()
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return (await Bun.file(path).json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function extractDeps(pkg: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
    const v = pkg[key]
    if (v && typeof v === "object") {
      for (const [name, ver] of Object.entries(v as Record<string, unknown>)) {
        if (typeof ver === "string") out[name] = ver
      }
    }
  }
  return out
}

export async function detectStack(rootDir: string): Promise<StackReport> {
  const languages: Detection[] = []
  const runtimes: Detection[] = []
  const frameworks: Detection[] = []
  const testRunners: Detection[] = []

  const pkgPath = join(rootDir, "package.json")
  const tsconfigPath = join(rootDir, "tsconfig.json")
  const pyprojectPath = join(rootDir, "pyproject.toml")
  const requirementsPath = join(rootDir, "requirements.txt")
  const goModPath = join(rootDir, "go.mod")
  const cargoTomlPath = join(rootDir, "Cargo.toml")

  if (await exists(pkgPath)) {
    languages.push({ id: "javascript", evidence: ["package.json"] })
    const pkg = await readJson(pkgPath)
    if (pkg) {
      const deps = extractDeps(pkg)
      if ("typescript" in deps || (await exists(tsconfigPath))) {
        languages.push({ id: "typescript", evidence: ["tsconfig.json / deps.typescript"] })
      }
      for (const name of FRAMEWORK_DEPS) {
        if (name in deps) {
          frameworks.push({ id: name, evidence: [`dep:${name}`], version: deps[name] })
        }
      }
      for (const name of TEST_RUNNER_DEPS) {
        if (name in deps) {
          testRunners.push({ id: name, evidence: [`dep:${name}`], version: deps[name] })
        }
      }
    }
  } else if (await exists(tsconfigPath)) {
    languages.push({ id: "typescript", evidence: ["tsconfig.json"] })
  }

  for (const { file, id } of RUNTIME_LOCKS) {
    if (await exists(join(rootDir, file))) {
      runtimes.push({ id, evidence: [file] })
    }
  }

  if ((await exists(pyprojectPath)) || (await exists(requirementsPath))) {
    const evidence: string[] = []
    if (await exists(pyprojectPath)) evidence.push("pyproject.toml")
    if (await exists(requirementsPath)) evidence.push("requirements.txt")
    languages.push({ id: "python", evidence })
  }

  if (await exists(goModPath)) {
    languages.push({ id: "go", evidence: ["go.mod"] })
  }
  if (await exists(cargoTomlPath)) {
    languages.push({ id: "rust", evidence: ["Cargo.toml"] })
  }

  return { languages, runtimes, frameworks, testRunners }
}
