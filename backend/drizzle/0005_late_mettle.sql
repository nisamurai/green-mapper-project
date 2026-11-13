UPDATE "auth"."user"
SET "points" = 0
WHERE "points" < 0;
--> statement-breakpoint
ALTER TABLE "auth"."user"
ADD CONSTRAINT "user_points_non_negative" CHECK ("points" >= 0);
