export type NodeKind = "local" | "remote"

export type NodeStatus = "online" | "degraded" | "offline" | "unknown"

export interface Node {
  id: string
  name: string
  kind: NodeKind
  endpoint?: string
  capabilities: string[]
  status: NodeStatus
}

export type DeviceKind = "gpu" | "terminal" | "fs" | "net" | "audio" | "video" | (string & {})

export interface Device {
  id: string
  nodeId: string
  kind: DeviceKind
  attributes: Record<string, string>
}
