ALTER TABLE `team_task` ADD `run_id` text REFERENCES team_run(id);--> statement-breakpoint
CREATE INDEX `team_task_run_idx` ON `team_task` (`run_id`);