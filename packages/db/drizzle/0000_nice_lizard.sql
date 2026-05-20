CREATE TABLE `golden_paths` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`target_project_type` text NOT NULL,
	`fit_criteria` text NOT NULL,
	`steps` text NOT NULL,
	`templates_referenced` text NOT NULL,
	`quality_gates` text NOT NULL,
	`learning_outcomes` text NOT NULL,
	`rejected_alternatives` text NOT NULL,
	`sources` text NOT NULL,
	`risks` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `golden_paths_slug_unique` ON `golden_paths` (`slug`);