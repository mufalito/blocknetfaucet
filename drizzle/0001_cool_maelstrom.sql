CREATE TABLE `referral_payouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`referrer` text NOT NULL,
	`referee` text NOT NULL,
	`paid_at` integer NOT NULL,
	`txid` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_referral_payouts_referee` ON `referral_payouts` (`referee`);