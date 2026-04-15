import type { NewEcapCapsule } from "../../src/db/schema/ecap_capsule"

// RED: NewEcapCapsule should accept a goal_id property (not implemented yet)
const _capsule: NewEcapCapsule = {
  id: "capsule-1",
  tenant_id: "tenant-1",
  agent_id: "agent-1",
  domain: "shipping/auth",
  task_id: null,
  triplet_instinct: "inst",
  triplet_experience: "exp",
  triplet_skill: "skill",
  observations: [],
  metadata: null,
  feedback_applications_count: 0,
  feedback_success_count: 0,
  feedback_score_avg: null,
  created_at: Date.now(),
  updated_at: Date.now(),
  // Expect TypeScript error here until goal_id is added to schema
  goal_id: "goal-123",
}
