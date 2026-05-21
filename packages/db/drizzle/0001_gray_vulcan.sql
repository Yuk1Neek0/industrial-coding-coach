CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`summary` text NOT NULL,
	`what_it_generates` text NOT NULL,
	`why_used` text NOT NULL,
	`fit_criteria` text NOT NULL,
	`fit_factors` text NOT NULL,
	`risks` text NOT NULL,
	`alternatives` text NOT NULL,
	`learning_notes` text NOT NULL,
	`sources` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_slug_unique` ON `templates` (`slug`);