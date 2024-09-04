CREATE TABLE `habits` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`duration` integer NOT NULL,
	`enable_notifications` integer DEFAULT false,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
