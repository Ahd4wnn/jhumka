CREATE TABLE "instagram_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"permalink" text NOT NULL,
	"caption" text,
	"media_type" text NOT NULL,
	"image" jsonb NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "instagram_posts_posted_idx" ON "instagram_posts" USING btree ("posted_at");