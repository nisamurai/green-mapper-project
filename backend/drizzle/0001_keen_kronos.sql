CREATE TABLE "admin_actions" (
	"action_id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"admin_id" text NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"old_value" text,
	"new_value" text,
	"action_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"comment_id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"admin_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issue_statuses" (
	"status_id" serial PRIMARY KEY NOT NULL,
	"name" varchar(20) NOT NULL,
	CONSTRAINT "issue_statuses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "issue_types" (
	"type_id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	CONSTRAINT "issue_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"issue_id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type_id" integer NOT NULL,
	"status_id" integer NOT NULL,
	"short_description" varchar(200) NOT NULL,
	"detailed_description" varchar(1000),
	"address" varchar(255) NOT NULL,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"created_at" timestamp DEFAULT now(),
	"expected_resolution_date" date
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"photo_id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"file_path" varchar(255) NOT NULL,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" varchar(5) DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_issue_id_issues_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("issue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_id_issues_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("issue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_type_id_issue_types_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."issue_types"("type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_status_id_issue_statuses_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."issue_statuses"("status_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_issue_id_issues_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("issue_id") ON DELETE no action ON UPDATE no action;