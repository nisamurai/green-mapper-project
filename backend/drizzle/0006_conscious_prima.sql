ALTER TABLE "auth"."user" ALTER COLUMN "role" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "auth"."user" ALTER COLUMN "role" SET DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "mature_content" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "mature_content_access" boolean DEFAULT false NOT NULL;