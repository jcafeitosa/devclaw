const CODES = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const

export type ColorName = keyof typeof CODES

export interface Colorizer {
  (name: Exclude<ColorName, "reset">, text: string): string
  bold(text: string): string
  dim(text: string): string
  enabled: boolean
}

export function createColorizer(
  enabled = process.stdout.isTTY && !process.env.NO_COLOR,
): Colorizer {
  const fn = ((name: ColorName, text: string) => {
    if (!enabled || name === "reset") return text
    return `${CODES[name]}${text}${CODES.reset}`
  }) as Colorizer
  fn.bold = (text: string) => fn("bold", text)
  fn.dim = (text: string) => fn("dim", text)
  Object.defineProperty(fn, "enabled", {
    get: () => enabled,
    enumerable: true,
  })
  return fn
}
