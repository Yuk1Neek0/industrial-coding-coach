CREATE TABLE `diff_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`pr_number` integer NOT NULL,
	`changed_files` text NOT NULL,
	`core_logic_explanation` text NOT NULL,
	`risk_analysis` text NOT NULL,
	`test_suggestions` text NOT NULL,
	`comprehension_questions` text NOT NULL,
	`answers` text,
	`score` integer,
	`weak_areas` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diff_reviews_snapshot_pr_unique` ON `diff_reviews` (`snapshot_id`,`pr_number`);