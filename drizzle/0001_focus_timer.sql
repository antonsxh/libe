CREATE TYPE "public"."pomodoro_phase" AS ENUM('focus', 'short_break', 'long_break');--> statement-breakpoint
CREATE TABLE "pomodoro_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"phase" "pomodoro_phase" DEFAULT 'focus' NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"phase_started_at" timestamp with time zone,
	"phase_min" integer NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pomodoro_runs_round_chk" CHECK ("pomodoro_runs"."round" >= 1),
	CONSTRAINT "pomodoro_runs_phase_min_chk" CHECK ("pomodoro_runs"."phase_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"pomodoro_focus_min" integer DEFAULT 25 NOT NULL,
	"pomodoro_short_break_min" integer DEFAULT 5 NOT NULL,
	"pomodoro_long_break_min" integer DEFAULT 15 NOT NULL,
	"pomodoro_long_break_every" integer DEFAULT 4 NOT NULL,
	"pomodoro_auto_start" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row_chk" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "pomodoro_runs" ADD CONSTRAINT "pomodoro_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pomodoro_runs_one_active_idx" ON "pomodoro_runs" USING btree (("ended_at" IS NULL)) WHERE "pomodoro_runs"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_one_active_idx" ON "sessions" USING btree (("state" <> 'completed')) WHERE "sessions"."state" <> 'completed';