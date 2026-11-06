CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"kind" text DEFAULT 'event' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"recurrence" jsonb,
	"exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_kind_check" CHECK ("events"."kind" in ('event','fixed')),
	CONSTRAINT "events_source_check" CHECK ("events"."source" in ('manual','photo')),
	CONSTRAINT "events_end_after_start" CHECK ("events"."ends_at" > "events"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_owner_start_idx" ON "events" USING btree ("owner_id","starts_at");