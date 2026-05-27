CREATE TABLE `learning_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`source` text NOT NULL,
	`issue_ref` text NOT NULL,
	`restated_goal` text NOT NULL,
	`related_files` text NOT NULL,
	`concepts` text NOT NULL,
	`agent_execution_notes` text NOT NULL,
	`review_checklist` text NOT NULL,
	`questions` text NOT NULL,
	`challenge_concept` text,
	`challenge_type` text,
	`user_answers` text,
	`score` text,
	`weak_areas` text,
	`checklist_state` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_units_snapshot_source_issue_unique` ON `learning_units` (`snapshot_id`,`source`,`issue_ref`);