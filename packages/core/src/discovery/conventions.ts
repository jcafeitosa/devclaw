import { readdir } from "node:fs/promises"
import { join } from "node:path"

export interface ConventionsReport {
  linter?: string
  formatter?: string
  commitConvention?: string
  testLocation?: "alongside-source" | "separate-dir"
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists()
}

async function anyExists(rootDir: string, patterns: string[]): Promise<boolean> {
  for (const p of patterns) {
    if (await exists(join(rootDir, p))) return true
  }
  return false
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await readdir(path)
    return true
  } catch {
    return false
  }
}

async function hasFilePattern(dir: string, suffix: string): Promise<boolean> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (await hasFilePattern(join(dir, entry.name), suffix)) return true
        continue
      }
      if (entry.name.endsWith(suffix)) return true
    }
    return false
  } catch {
    return false
  }
}

export async function detectConventions(rootDir: string): Promise<ConventionsReport> {
  const report: ConventionsReport = {}

  if (await exists(join(rootDir, "biome.json"))) {
    report.linter = "biome"
    report.formatter = "biome"
  } else {
    if (
      await anyExists(rootDir, [
        ".eslintrc",
        ".eslintrc.json",
        ".eslintrc.js",
        ".eslintrc.cjs",
        "eslint.config.js",
        "eslint.config.mjs",
      ])
    ) {
      report.linter = "eslint"
    }
    if (
      await anyExists(rootDir, [
        ".prettierrc",
        ".prettierrc.json",
        ".prettierrc.js",
        "prettier.config.js",
        "prettier.config.mjs",
      ])
    ) {
      report.formatter = "prettier"
    }
  }

  if (
    await anyExists(rootDir, [
      "commitlint.config.js",
      "commitlint.config.cjs",
      "commitlint.config.mjs",
      "commitlint.config.ts",
      ".commitlintrc",
      ".commitlintrc.json",
    ])
  ) {
    report.commitConvention = "conventional-commits"
  }

  const hasTestDir =
    (await dirExists(join(rootDir, "test"))) || (await dirExists(join(rootDir, "tests")))
  if (hasTestDir) {
    report.testLocation = "separate-dir"
  } else {
    const srcDir = join(rootDir, "src")
    if (await dirExists(srcDir)) {
      if (
        (await hasFilePattern(srcDir, ".test.ts")) ||
        (await hasFilePattern(srcDir, ".test.js"))
      ) {
        report.testLocation = "alongside-source"
      }
    }
  }

  return report
}
