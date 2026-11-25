ALTER TABLE "settings" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Existing installations never see the first-run flow (`/welcome`): any data or any device
-- (even a revoked one) means libe was already in use. The settings row is created lazily, so
-- it may not exist yet. A fresh install keeps no row / NULL.
INSERT INTO "settings" ("id", "onboarded_at")
SELECT 1, now()
WHERE EXISTS (SELECT 1 FROM "quests")
	OR EXISTS (SELECT 1 FROM "tasks")
	OR EXISTS (SELECT 1 FROM "sessions")
	OR EXISTS (SELECT 1 FROM "devices")
ON CONFLICT ("id") DO UPDATE SET "onboarded_at" = now();
