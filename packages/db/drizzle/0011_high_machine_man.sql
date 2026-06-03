CREATE TABLE `llm_evals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` integer NOT NULL,
	`check` text NOT NULL,
	`passed` integer NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trace_id`) REFERENCES `llm_traces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `llm_traces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`snapshot_id` integer,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_creation_tokens` integer NOT NULL,
	`cache_read_tokens` integer NOT NULL,
	`estimated_cost_usd` real NOT NULL,
	`latency_ms` integer NOT NULL,
	`outcome` text NOT NULL,
	`started_at` integer NOT NULL,
	`observations` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repo_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `llm_traces_snapshot_idx` ON `llm_traces` (`snapshot_id`);