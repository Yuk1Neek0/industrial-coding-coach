CREATE TABLE `repo_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`path` text NOT NULL,
	`sha` text NOT NULL,
	`size` integer NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_files_snapshot_path_unique` ON `repo_files` (`snapshot_id`,`path`);--> statement-breakpoint
CREATE INDEX `repo_files_snapshot_idx` ON `repo_files` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `repo_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`ref` text NOT NULL,
	`commit_sha` text NOT NULL,
	`default_branch` text NOT NULL,
	`description` text,
	`primary_language` text,
	`is_private` integer NOT NULL,
	`html_url` text NOT NULL,
	`file_tree` text NOT NULL,
	`imported_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_snapshots_owner_repo_ref_unique` ON `repo_snapshots` (`owner`,`repo`,`ref`);