CREATE TYPE "public"."session_source" AS ENUM('focus', 'manual', 'pomodoro');--> statement-breakpoint
CREATE TYPE "public"."session_state" AS ENUM('running', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('quest', 'other');--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"day" date NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_range_chk" CHECK ("blocks"."start_min" >= 0 AND "blocks"."end_min" <= 1440 AND "blocks"."start_min" < "blocks"."end_min")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"name" text NOT NULL,
	"paired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT '✨' NOT NULL,
	"color" text DEFAULT 'amber' NOT NULL,
	"weekly_budget_h" real,
	"closed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"state" "session_state" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_min" integer,
	"paused_ms" integer DEFAULT 0 NOT NULL,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"source" "session_source" DEFAULT 'focus' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_paused_chk" CHECK ("sessions"."paused_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quest_id" uuid,
	"kind" "task_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"duration_min" integer,
	"day" date,
	"recurrence_rule" text,
	"done_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_kind_quest_chk" CHECK (("tasks"."kind" = 'quest' AND "tasks"."quest_id" IS NOT NULL) OR ("tasks"."kind" = 'other' AND "tasks"."quest_id" IS NULL)),
	CONSTRAINT "tasks_duration_chk" CHECK ("tasks"."duration_min" IS NULL OR "tasks"."duration_min" > 0)
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_day_idx" ON "blocks" USING btree ("day");--> statement-breakpoint
CREATE INDEX "sessions_task_idx" ON "sessions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "sessions_started_idx" ON "sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "tasks_day_idx" ON "tasks" USING btree ("day");--> statement-breakpoint
CREATE INDEX "tasks_quest_idx" ON "tasks" USING btree ("quest_id");