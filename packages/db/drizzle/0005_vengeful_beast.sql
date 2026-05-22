CREATE TABLE `project_maps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`architecture_overview` text NOT NULL,
	`key_file_map` text NOT NULL,
	`request_data_flow` text NOT NULL,
	`state_flow` text NOT NULL,
	`ai_call_flow` text NOT NULL,
	`mermaid_diagram` text NOT NULL,
	`debug_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_maps_snapshot_unique` ON `project_maps` (`snapshot_id`);