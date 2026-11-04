CREATE TABLE "privacy_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"entity_counts" jsonb NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"block_reason" text,
	"sanitized_payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_token_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"token" text NOT NULL,
	"vault_entry_id" uuid,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_vault_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"sensitivity" text DEFAULT 'sensitive' NOT NULL,
	"encrypted_value" text NOT NULL,
	"encrypted_aliases" text NOT NULL,
	"replacement_policy" text DEFAULT 'token' NOT NULL,
	"value_hmac" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_type_check" CHECK ("privacy_vault_entries"."entity_type" in ('owner','person','email','phone','place','org','handle','other')),
	CONSTRAINT "vault_sensitivity_check" CHECK ("privacy_vault_entries"."sensitivity" in ('personal','sensitive','secret')),
	CONSTRAINT "vault_policy_check" CHECK ("privacy_vault_entries"."replacement_policy" in ('token','generalize'))
);
--> statement-breakpoint
ALTER TABLE "privacy_audit" ADD CONSTRAINT "privacy_audit_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_token_maps" ADD CONSTRAINT "privacy_token_maps_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_token_maps" ADD CONSTRAINT "privacy_token_maps_vault_entry_id_privacy_vault_entries_id_fk" FOREIGN KEY ("vault_entry_id") REFERENCES "public"."privacy_vault_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_vault_entries" ADD CONSTRAINT "privacy_vault_entries_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_owner_created_idx" ON "privacy_audit" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "token_conv_token_uniq" ON "privacy_token_maps" USING btree ("conversation_id","token");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_owner_hmac_uniq" ON "privacy_vault_entries" USING btree ("owner_id","value_hmac");