import { ulid } from "../queue/ulid.ts"

const PREFIX = {
  audit_entry: "aud",
  auth_info: "auth",
  cost_record: "cost",
  ecap_capsule: "ecap",
  embedding: "emb",
  project: "proj",
  run: "run",
  session: "sess",
  task: "task",
  tenant: "tenant",
  user: "user",
} as const

export type DbEntity = keyof typeof PREFIX

export function genDbId(entity: DbEntity): string {
  return `${PREFIX[entity]}_${ulid()}`
}
