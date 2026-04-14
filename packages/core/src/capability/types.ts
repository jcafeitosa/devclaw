export type CapabilityPermission = "auto" | "prompt" | "denied"

export interface CapabilityRequires {
  runtimes?: string[]
  devices?: string[]
  tools?: string[]
}

export interface Capability {
  id: string
  name: string
  description: string
  requires: CapabilityRequires
  permission: CapabilityPermission
}

export interface CapabilityGrant {
  capabilityId: string
  granted: boolean
  via: CapabilityPermission
  at: number
}
