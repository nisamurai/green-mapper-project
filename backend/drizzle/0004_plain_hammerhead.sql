CREATE TABLE "auth"."twoFactor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."user" ALTER COLUMN "role" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "auth"."user" ALTER COLUMN "role" SET DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."twoFactor" ADD CONSTRAINT "twoFactor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "latitude_index" ON "issues" USING btree ("latitude");--> statement-breakpoint
CREATE INDEX "longitude_index" ON "issues" USING btree ("longitude");--> statement-breakpoint
CREATE INDEX "status_index" ON "issues" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "user_index" ON "issues" USING btree ("user_id");