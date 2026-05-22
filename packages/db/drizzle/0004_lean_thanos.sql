CREATE TABLE `recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`intake` text NOT NULL,
	`recommended_golden_path_slug` text NOT NULL,
	`recommended_template_slugs` text NOT NULL,
	`rejected_alternatives` text NOT NULL,
	`narrative` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
