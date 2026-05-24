CREATE TABLE `challenge_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` integer NOT NULL,
	`explanation` text NOT NULL,
	`snippets` text NOT NULL,
	`file_paths` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`grading` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `challenge_attempts_challenge_idx` ON `challenge_attempts` (`challenge_id`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`type` text NOT NULL,
	`task_description` text NOT NULL,
	`in_scope_files` text NOT NULL,
	`out_of_scope_files` text NOT NULL,
	`acceptance_criteria` text NOT NULL,
	`source_references` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_snapshot_type_unique` ON `challenges` (`snapshot_id`,`type`);--> statement-breakpoint
CREATE INDEX `challenges_snapshot_idx` ON `challenges` (`snapshot_id`);