CREATE TABLE `stack_explanations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`tools` text NOT NULL,
	`key_files` text NOT NULL,
	`debug_entry_points` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stack_explanations_snapshot_unique` ON `stack_explanations` (`snapshot_id`);