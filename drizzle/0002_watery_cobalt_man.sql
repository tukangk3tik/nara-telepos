ALTER TABLE `expenses` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `deleted_by_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `expenses` ADD `deletion_reason` text;