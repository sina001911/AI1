CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`strategy` text DEFAULT 'dependency-based' NOT NULL,
	`max_concurrency` integer DEFAULT 4 NOT NULL,
	`leader_config` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_name_idx` ON `team` (`name`);--> statement-breakpoint
CREATE TABLE `team_member` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`temperature` real,
	`max_tokens` integer,
	`system_prompt` text DEFAULT '' NOT NULL,
	`tool_permissions` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`order_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_member_team_idx` ON `team_member` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_member_role_idx` ON `team_member` (`role`);--> statement-breakpoint
CREATE INDEX `team_member_team_id_order_key_idx` ON `team_member` (`team_id`,`order_key`);--> statement-breakpoint
CREATE TABLE `team_run` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`objective` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`result` text,
	`error` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_run_team_idx` ON `team_run` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_run_status_idx` ON `team_run` (`status`);--> statement-breakpoint
CREATE INDEX `team_run_started_idx` ON `team_run` (`started_at`);--> statement-breakpoint
CREATE TABLE `team_run_event` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `team_run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_run_event_run_idx` ON `team_run_event` (`run_id`);--> statement-breakpoint
CREATE INDEX `team_run_event_created_idx` ON `team_run_event` (`created_at`);--> statement-breakpoint
CREATE TABLE `team_task` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`assigned_to` text,
	`dependencies` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`input` text DEFAULT '' NOT NULL,
	`output` text,
	`error` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `team_task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to`) REFERENCES `team_member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `team_task_team_idx` ON `team_task` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_task_status_idx` ON `team_task` (`status`);--> statement-breakpoint
CREATE INDEX `team_task_assigned_idx` ON `team_task` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `team_task_parent_idx` ON `team_task` (`parent_id`);