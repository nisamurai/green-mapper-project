CREATE TABLE "operator_actions" (
	"action_id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"operator_id" text NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"old_value" text,
	"new_value" text,
	"action_date" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."account" SET SCHEMA "auth";
--> statement-breakpoint
ALTER TABLE "public"."session" SET SCHEMA "auth";
--> statement-breakpoint
ALTER TABLE "public"."user" SET SCHEMA "auth";
--> statement-breakpoint
ALTER TABLE "public"."verification" SET SCHEMA "auth";
--> statement-breakpoint
ALTER TABLE "admin_actions" DROP CONSTRAINT "admin_actions_admin_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_admin_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "issues" DROP CONSTRAINT "issues_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "operator_actions" ADD CONSTRAINT "operator_actions_issue_id_issues_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("issue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_actions" ADD CONSTRAINT "operator_actions_operator_id_user_id_fk" FOREIGN KEY ("operator_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;