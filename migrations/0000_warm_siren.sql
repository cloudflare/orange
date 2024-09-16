CREATE TABLE `AnalyticsRefreshes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`modified` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted` text,
	`version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `AnalyticsSimpleCallFeedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`modified` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted` text,
	`version` text NOT NULL,
	`experiencedIssues` integer NOT NULL
);
