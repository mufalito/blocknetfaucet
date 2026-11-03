CREATE TABLE `admin_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `banners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`image_url` text NOT NULL,
	`link_url` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`width` integer,
	`height` integer,
	`slot` text DEFAULT 'auto' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bans_kind_value` ON `bans` (`kind`,`value`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`amount_atomic` integer NOT NULL,
	`txid` text,
	`error` text,
	`created_at` integer NOT NULL,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `idx_claims_address_time` ON `claims` (`address`,`created_at`);--> statement-breakpoint
CREATE TABLE `geo_cache` (
	`ip` text PRIMARY KEY NOT NULL,
	`country` text NOT NULL,
	`looked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_fails` (
	`ip` text PRIMARY KEY NOT NULL,
	`fails` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ref_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ref_codes_address` ON `ref_codes` (`address`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`referrer` text NOT NULL,
	`referee` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_referrals_referee` ON `referrals` (`referee`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`created_at` integer NOT NULL
);
