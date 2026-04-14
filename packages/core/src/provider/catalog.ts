export interface GenerateOpts {
  prompt: string
  model?: string
  maxTokens?: number
  temperature?: number
  system?: string
}

export interface ProviderDescriptor {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
  generate(opts: GenerateOpts): Promise<string>
}

export class ProviderError extends Error {
  readonly providerId: string
  readonly status: number
  readonly body: string
  constructor(providerId: string, status: number, body: string) {
    super(`provider ${providerId}: HTTP ${status}: ${body}`)
    this.name = "ProviderError"
    this.providerId = providerId
    this.status = status
    this.body = body
  }
}

export class ProviderCatalog {
  private providers = new Map<string, ProviderDescriptor>()

  register(descriptor: ProviderDescriptor): void {
    if (this.providers.has(descriptor.id)) {
      throw new Error(`provider ${descriptor.id} already registered`)
    }
    this.providers.set(descriptor.id, descriptor)
  }

  get(id: string): ProviderDescriptor {
    const d = this.providers.get(id)
    if (!d) throw new Error(`provider ${id} not registered`)
    return d
  }

  list(): ProviderDescriptor[] {
    return [...this.providers.values()]
  }

  async generate(id: string, opts: GenerateOpts): Promise<string> {
    return this.get(id).generate(opts)
  }
}
