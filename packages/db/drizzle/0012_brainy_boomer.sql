ALTER TABLE `templates` ADD `source` text DEFAULT 'curated' NOT NULL;--> statement-breakpoint
ALTER TABLE `templates` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `templates` ADD `source_format` text;