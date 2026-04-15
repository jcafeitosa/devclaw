PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `tenant` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `plan` text NOT NULL,
  `owner_user_id` text NOT NULL,
  `settings` text NOT NULL DEFAULT '{}',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_slug_idx` ON `tenant` (`slug`);
--> statement-breakpoint
CREATE TABLE `user` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `avatar_url` text,
  `default_tenant_id` text NOT NULL,
  `prefs` text NOT NULL DEFAULT '{}',
  `mfa_enabled` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  FOREIGN KEY (`default_tenant_id`) REFERENCES `tenant`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_idx` ON `user` (`email`);
--> statement-breakpoint
CREATE TABLE `project` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `status` text NOT NULL,
  `owner_user_id` text,
  `owner_agent_id` text,
  `vault_path` text,
  `repo_url` text,
  `metadata` text NOT NULL DEFAULT '{}',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`)
);
--> statement-breakpoint
CREATE INDEX `project_tenant_idx` ON `project` (`tenant_id`, `status`);
--> statement-breakpoint
CREATE TABLE `task` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `project_id` text NOT NULL,
  `parent_task_id` text,
  `title` text NOT NULL,
  `description` text,
  `status` text NOT NULL,
  `priority` text NOT NULL,
  `owner_actor_type` text NOT NULL,
  `owner_actor_id` text NOT NULL,
  `context` text,
  `prompt` text,
  `acceptance_criteria` text,
  `estimated_minutes` integer,
  `estimated_cost_usd` real,
  `due_date` integer,
  `started_at` integer,
  `completed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`),
  FOREIGN KEY (`project_id`) REFERENCES `project`(`id`),
  FOREIGN KEY (`parent_task_id`) REFERENCES `task`(`id`)
);
--> statement-breakpoint
CREATE INDEX `task_project_idx` ON `task` (`project_id`, `status`, `priority`);
--> statement-breakpoint
CREATE TABLE `run` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `task_id` text,
  `agent_id` text NOT NULL,
  `session_id` text NOT NULL,
  `parent_run_id` text,
  `status` text NOT NULL,
  `provider_id` text NOT NULL,
  `model_id` text NOT NULL,
  `cli_bridge` text,
  `cwd` text NOT NULL,
  `prompt_tokens` integer,
  `output_tokens` integer,
  `cached_tokens` integer,
  `cost_usd` real,
  `duration_ms` integer,
  `started_at` integer NOT NULL,
  `ended_at` integer,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`),
  FOREIGN KEY (`task_id`) REFERENCES `task`(`id`),
  FOREIGN KEY (`parent_run_id`) REFERENCES `run`(`id`)
);
--> statement-breakpoint
CREATE INDEX `run_tenant_idx` ON `run` (`tenant_id`, `status`, `started_at`);
--> statement-breakpoint
CREATE TABLE `auth_info` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `user_id` text,
  `provider_id` text NOT NULL,
  `account_label` text,
  `type` text NOT NULL,
  `encrypted_data` text NOT NULL,
  `metadata` text,
  `expires_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_info_tenant_provider_account_idx`
  ON `auth_info` (`tenant_id`, `provider_id`, `account_label`);
--> statement-breakpoint
CREATE TABLE `audit_entry` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `timestamp` integer NOT NULL,
  `actor_type` text NOT NULL,
  `actor_id` text NOT NULL,
  `session_id` text,
  `action` text NOT NULL,
  `target_type` text,
  `target_id` text,
  `project_id` text,
  `params` text,
  `result` text NOT NULL,
  `rationale` text,
  `risk_level` text,
  `approval_id` text,
  `ip` text,
  `user_agent` text,
  `request_id` text,
  `trace_id` text,
  `prev_checksum` text,
  `checksum` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entry_tenant_time_idx` ON `audit_entry` (`tenant_id`, `timestamp`);
--> statement-breakpoint
CREATE TABLE `embedding` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `source_type` text NOT NULL,
  `source_id` text NOT NULL,
  `chunk_index` integer NOT NULL,
  `content` text NOT NULL,
  `embedding` text,
  `metadata` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`)
);
--> statement-breakpoint
CREATE INDEX `embedding_lookup_idx`
  ON `embedding` (`tenant_id`, `source_type`, `source_id`, `chunk_index`);
--> statement-breakpoint
CREATE TABLE `ecap_capsule` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `agent_id` text NOT NULL,
  `domain` text NOT NULL,
  `task_id` text,
  `triplet_instinct` text NOT NULL,
  `triplet_experience` text NOT NULL,
  `triplet_skill` text NOT NULL,
  `observations` text NOT NULL,
  `metadata` text,
  `feedback_applications_count` integer NOT NULL DEFAULT 0,
  `feedback_success_count` integer NOT NULL DEFAULT 0,
  `feedback_score_avg` real,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`),
  FOREIGN KEY (`task_id`) REFERENCES `task`(`id`)
);
--> statement-breakpoint
CREATE INDEX `ecap_capsule_agent_idx` ON `ecap_capsule` (`tenant_id`, `agent_id`, `domain`);
--> statement-breakpoint
CREATE TABLE `cost_record` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `run_id` text,
  `provider_id` text NOT NULL,
  `model_id` text NOT NULL,
  `type` text NOT NULL,
  `prompt_tokens` integer,
  `output_tokens` integer,
  `cached_tokens` integer,
  `cost_usd` real NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`),
  FOREIGN KEY (`run_id`) REFERENCES `run`(`id`)
);
--> statement-breakpoint
CREATE INDEX `cost_record_tenant_idx` ON `cost_record` (`tenant_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `session` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `user_id` text,
  `agent_id` text,
  `status` text NOT NULL,
  `resume_token` text,
  `context` text,
  `started_at` integer NOT NULL,
  `last_active_at` integer NOT NULL,
  `ended_at` integer,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);
--> statement-breakpoint
CREATE INDEX `session_tenant_idx` ON `session` (`tenant_id`, `status`, `last_active_at`);
