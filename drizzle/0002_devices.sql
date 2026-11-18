CREATE TYPE "public"."device_kind" AS ENUM('browser', 'pwa', 'tauri');--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "kind" "device_kind" DEFAULT 'browser' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "cookie_renewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
-- pairing_codes was never used before M7 (codes are now stored hashed with a uuid key).
DELETE FROM "pairing_codes";--> statement-breakpoint
ALTER TABLE "pairing_codes" DROP COLUMN "code";--> statement-breakpoint
ALTER TABLE "pairing_codes" DROP COLUMN "used";--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "code_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "created_by_device_id" uuid;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "device_id" uuid;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_created_by_device_id_devices_id_fk" FOREIGN KEY ("created_by_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_active_idx" ON "devices" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "pairing_codes_hash_idx" ON "pairing_codes" USING btree ("code_hash");
