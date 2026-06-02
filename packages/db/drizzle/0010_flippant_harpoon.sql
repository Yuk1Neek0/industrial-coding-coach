CREATE TABLE `ccpm_issue_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`task_ref` text NOT NULL,
	`issue_number` integer NOT NULL,
	`issue_state` text,
	`closing_pr_number` integer,
	`closing_pr_url` text,
	`closing_pr_title` text,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ccpm_issue_links_snapshot_task_unique` ON `ccpm_issue_links` (`snapshot_id`,`task_ref`);--> statement-breakpoint
CREATE INDEX `ccpm_issue_links_snapshot_idx` ON `ccpm_issue_links` (`snapshot_id`);