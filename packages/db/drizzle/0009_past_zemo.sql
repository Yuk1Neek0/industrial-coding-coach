CREATE TABLE `learning_memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`interview_qa` text NOT NULL,
	`resume_bullets` text NOT NULL,
	`architecture_explanation` text NOT NULL,
	`learning_memory_tree` text NOT NULL,
	`debug_stories` text NOT NULL,
	`generated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_memories_snapshot_unique` ON `learning_memories` (`snapshot_id`);