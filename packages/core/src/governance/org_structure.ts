import { NoOwnerError } from "./errors.ts"
import type { OrgMember, OrgRole, Ownership } from "./types.ts"

const ESCALATION: OrgRole[] = ["worker", "specialist", "coordinator", "cto", "ceo"]

function escalationIndex(role: OrgRole): number {
  const idx = ESCALATION.indexOf(role)
  if (idx >= 0) return idx
  if (role === "cfo" || role === "coo") return ESCALATION.indexOf("cto")
  return 0
}

export class OrgStructure {
  private readonly members = new Map<string, OrgMember>()
  private readonly ownership = new Map<string, string>()

  addMember(member: OrgMember): OrgMember {
    this.members.set(member.id, member)
    return member
  }

  get(id: string): OrgMember | undefined {
    return this.members.get(id)
  }

  list(): OrgMember[] {
    return [...this.members.values()]
  }

  assignOwner(itemId: string, ownerId: string): Ownership {
    if (!this.members.has(ownerId)) {
      throw new Error(`governance: owner '${ownerId}' not in org`)
    }
    this.ownership.set(itemId, ownerId)
    return { itemId, ownerId }
  }

  ownerOf(itemId: string): string {
    const ownerId = this.ownership.get(itemId)
    if (!ownerId) throw new NoOwnerError(itemId)
    return ownerId
  }

  chainFor(memberId: string): OrgMember[] {
    const chain: OrgMember[] = []
    let current = this.members.get(memberId)
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      chain.push(current)
      current = current.managerId ? this.members.get(current.managerId) : undefined
    }
    return chain
  }

  escalate(fromRole: OrgRole): OrgRole | "human" {
    const idx = escalationIndex(fromRole)
    if (idx + 1 >= ESCALATION.length) return "human"
    return ESCALATION[idx + 1]!
  }
}
