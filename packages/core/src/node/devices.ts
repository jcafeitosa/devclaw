import { DeviceNotFoundError } from "./errors.ts"
import type { Device, DeviceKind } from "./types.ts"

export { DeviceNotFoundError } from "./errors.ts"

export class DeviceRegistry {
  private readonly devices = new Map<string, Device>()

  register(device: Device): void {
    this.devices.set(device.id, { ...device })
  }

  unregister(id: string): void {
    this.devices.delete(id)
  }

  unregisterByNode(nodeId: string): void {
    for (const [id, d] of this.devices) {
      if (d.nodeId === nodeId) this.devices.delete(id)
    }
  }

  get(id: string): Device {
    const d = this.devices.get(id)
    if (!d) throw new DeviceNotFoundError(id)
    return d
  }

  list(): Device[] {
    return [...this.devices.values()]
  }

  findByNode(nodeId: string): Device[] {
    return this.list().filter((d) => d.nodeId === nodeId)
  }

  findByKind(kind: DeviceKind): Device[] {
    return this.list().filter((d) => d.kind === kind)
  }
}
