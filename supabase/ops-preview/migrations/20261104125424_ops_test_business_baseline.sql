-- Business schema captured read-only on 2026-11-04.

-- Target only: OliPoly ERP Test / llscjdyiiatmuqhilube.

-- Schema and permissions only. Business records are supplied separately as fictional fixtures.

BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
  RAISE EXCEPTION 'Empty test schema required; this baseline must never be applied to live data';
 END IF;
END $$;

SET LOCAL check_function_bodies = false;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions, pg_catalog;

CREATE SEQUENCE public."olipoly_order_number_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1;

CREATE TABLE public."project_events" (
  "id" uuid NOT NULL,
  "user_id" uuid,
  "project_id" text,
  "quote_number" text,
  "order_number" text,
  "event_type" text NOT NULL,
  "details" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "event_id" uuid,
  "occurred_at" timestamp with time zone,
  "aggregate_type" text,
  "aggregate_id" text,
  "actor_type" text,
  "actor_id" text,
  "correlation_id" text,
  "causation_id" text,
  "schema_version" integer,
  "payload" jsonb
);

CREATE TABLE public."quote_accepted_commercial_snapshots" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "quote_number" text NOT NULL,
  "order_number" text NOT NULL,
  "accepted_at" timestamp with time zone NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."finance_correction_receipts" (
  "command_identity" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "original_entry_id" uuid NOT NULL,
  "correction_group_id" uuid,
  "correction_kind" text NOT NULL,
  "reason" text,
  "metadata_entry_id" uuid,
  "reversal_entry_id" uuid,
  "replacement_entry_id" uuid,
  "effective_entry_id" uuid,
  "changed_fields" jsonb NOT NULL,
  "effective_record" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."order_payment_command_receipts" (
  "command_identity" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "command" text NOT NULL,
  "previous_payment_status" text,
  "resulting_updated_at" timestamp with time zone NOT NULL,
  "result_snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."campaigns" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "campaign_slug" text NOT NULL,
  "campaign_code" text NOT NULL,
  "name" text NOT NULL,
  "organization_name" text NOT NULL,
  "public_description" text,
  "status" text NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "payment_mode" text NOT NULL,
  "delivery_mode" text NOT NULL,
  "branding_config" jsonb NOT NULL,
  "public_config" jsonb NOT NULL,
  "internal_notes" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."document_counters" (
  "key" text NOT NULL,
  "value" bigint NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."campaign_products" (
  "id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "product_recipe_id" uuid,
  "campaign_sku" text NOT NULL,
  "display_name" text NOT NULL,
  "public_description" text,
  "display_order" integer NOT NULL,
  "enabled" boolean NOT NULL,
  "standard_customer_price" numeric(12,2) NOT NULL,
  "personalized_customer_price" numeric(12,2),
  "olipoly_standard_share" numeric(12,2) NOT NULL,
  "olipoly_personalized_share" numeric(12,2),
  "personalization_enabled" boolean NOT NULL,
  "personalization_instructions" text,
  "personalization_limits" jsonb NOT NULL,
  "image_url" text,
  "reference_url" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "variant_config" jsonb NOT NULL,
  "fulfillment_options" jsonb NOT NULL,
  "payment_options" jsonb NOT NULL,
  "customer_disclosures" jsonb NOT NULL
);

CREATE TABLE public."production_linkage_audit" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "production_job_id" uuid NOT NULL,
  "quote_id" uuid,
  "order_id" uuid,
  "command_identity" text NOT NULL,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "evidence" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."production_attempt_consumption_receipts" (
  "command_identity" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "production_job_id" uuid NOT NULL,
  "attempt_id" text NOT NULL,
  "inventory_mode" text NOT NULL,
  "result_snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."workflow_command_receipts" (
  "command_identity" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "production_job_id" uuid NOT NULL,
  "command" text NOT NULL,
  "from_state" text NOT NULL,
  "to_state" text NOT NULL,
  "resulting_updated_at" timestamp with time zone NOT NULL,
  "result_snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."quotes" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "quote_number" text NOT NULL,
  "invoice_number" text,
  "quote_status" text,
  "customer_name" text,
  "customer_email" text,
  "quote_title" text,
  "quote_total" numeric,
  "quote_data" jsonb NOT NULL,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "public_token" text,
  "customer_response" text,
  "customer_response_message" text,
  "responded_at" timestamp with time zone,
  "converted_order_number" text,
  "confirmation_email_sent" boolean,
  "confirmation_email_sent_at" timestamp with time zone,
  "po_number" text,
  "po_part_number" text,
  "customer_part_number" text,
  "olipoly_part_number" text,
  "part_revision" text,
  "shipping_contact_name" text,
  "shipping_company" text,
  "shipping_address" text,
  "billing_address" text,
  "converted_to_order" boolean,
  "accepted_date" timestamp with time zone,
  "tax_exempt" boolean,
  "tax_exempt_reason" text,
  "exemption_certificate_on_file" boolean,
  "po_file_on_file" boolean,
  "source_project_id" uuid,
  "accepted_commercial_snapshot_id" uuid,
  "accepted_commercial_snapshot" jsonb,
  "accepted_at" timestamp with time zone,
  "production_job_id" uuid
);

CREATE TABLE public."inventory_transactions" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "transaction_type" text,
  "production_job_id" uuid,
  "raw_material_id" uuid,
  "finished_good_id" uuid,
  "machine_name" text,
  "material_type" text,
  "color_name" text,
  "qty_grams" numeric NOT NULL,
  "qty_units" numeric NOT NULL,
  "unit_cost" numeric NOT NULL,
  "total_cost" numeric NOT NULL,
  "note" text,
  "created_at" timestamp with time zone NOT NULL,
  "inventory_kind" text,
  "quantity_delta" numeric,
  "unit" text,
  "extended_cost" numeric,
  "date" timestamp with time zone,
  "type" text,
  "item" text,
  "amount" text,
  "item_label" text,
  "item_type" text,
  "item_id" text,
  "color" text,
  "brand" text,
  "roll_label" text,
  "quantity" numeric,
  "source" text,
  "reference_id" text,
  "job_id" text,
  "order_ref" text,
  "quote_ref" text,
  "metadata" jsonb,
  "notes" text,
  "quantity_change" numeric,
  "occurred_at" timestamp with time zone,
  "attempt_id" text,
  "correlation_id" text,
  "quantity_grams" numeric,
  "order_number" text,
  "quote_number" text
);

CREATE TABLE public."hub_reminders" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text,
  "due_date" date,
  "recurrence" text NOT NULL,
  "completed" boolean,
  "next_due_date" date,
  "completed_at" timestamp without time zone,
  "updated_at" timestamp without time zone,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."hub_notes" (
  "user_id" uuid NOT NULL,
  "notes" text NOT NULL,
  "updated_at" timestamp without time zone
);

CREATE TABLE public."order_tracking_public" (
  "order_number" text NOT NULL,
  "user_id" uuid NOT NULL,
  "order_title" text,
  "status" text,
  "payment_status" text,
  "public_status_text" text,
  "public_next_step" text,
  "shipping_or_pickup_note" text,
  "tracking_number" text,
  "payment_link" text,
  "updated_at" timestamp with time zone NOT NULL,
  "paid_date" date,
  "payment_link_stripe" text,
  "payment_link_paypal" text,
  "payment_link_venmo" text,
  "order_total" numeric,
  "source_quote_number" text,
  "po_number" text,
  "po_part_number" text,
  "olipoly_part_number" text,
  "part_revision" text,
  "invoice_number" text,
  "invoice_terms" text
);

CREATE TABLE public."production_material_reservations" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "production_job_id" uuid NOT NULL,
  "order_number" text NOT NULL,
  "raw_material_roll_id" uuid NOT NULL,
  "reserved_grams" numeric NOT NULL,
  "status" text NOT NULL,
  "reservation_command_id" text NOT NULL,
  "release_command_id" text,
  "consume_command_id" text,
  "attempt_id" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "released_at" timestamp with time zone
);

CREATE TABLE public."campaign_submission_items" (
  "id" uuid NOT NULL,
  "campaign_submission_id" uuid NOT NULL,
  "campaign_product_id" uuid NOT NULL,
  "offer_snapshot" jsonb NOT NULL,
  "product_public_code" text NOT NULL,
  "submitted_variant" jsonb NOT NULL,
  "quantity" integer NOT NULL,
  "personalization_requested" boolean NOT NULL,
  "personalization_selection" jsonb NOT NULL,
  "authoritative_base_unit_price" numeric(12,2) NOT NULL,
  "authoritative_personalization_unit_price" numeric(12,2) NOT NULL,
  "authoritative_line_subtotal" numeric(12,2) NOT NULL,
  "item_notes" text,
  "line_sequence" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."catalog_parts" (
  "id" uuid NOT NULL,
  "user_id" uuid,
  "part_key" text NOT NULL,
  "part_name" text NOT NULL,
  "olipoly_part_number" text,
  "customer_part_number" text,
  "part_revision" text,
  "customer_name" text,
  "company_name" text,
  "source_order_number" text,
  "source_quote_number" text,
  "po_number" text,
  "default_material" text,
  "default_color" text,
  "printer_profile" text,
  "layer_height" text,
  "nozzle_size" text,
  "last_quantity" numeric,
  "last_order_total" numeric,
  "estimated_piece_price" numeric,
  "production_notes" text,
  "post_processing_notes" text,
  "packing_notes" text,
  "internal_notes" text,
  "reorder_eligible" boolean,
  "active" boolean,
  "catalog_data" jsonb,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."parts_catalog" (
  "id" uuid NOT NULL,
  "user_id" uuid,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "olipoly_part_number" text,
  "customer_part_number" text,
  "customer_name" text,
  "company_name" text,
  "part_name" text,
  "part_description" text,
  "revision" text,
  "material" text,
  "color" text,
  "printer_profile" text,
  "layer_height" text,
  "nozzle_size" text,
  "estimated_piece_price" numeric,
  "estimated_print_time" text,
  "last_order_number" text,
  "last_quote_number" text,
  "production_notes" text,
  "post_processing_notes" text,
  "active" boolean
);

CREATE TABLE public."active_projects" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "project_title" text NOT NULL,
  "project_type" text NOT NULL,
  "project_status" text NOT NULL,
  "priority" text NOT NULL,
  "customer_name" text,
  "customer_email" text,
  "customer_phone" text,
  "source" text,
  "quantity" numeric,
  "material" text,
  "color" text,
  "estimated_print_hours" numeric,
  "estimated_price" numeric,
  "machine_preference" text,
  "due_date" date,
  "event_name" text,
  "quote_number" text,
  "order_number" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "close_outcome" text,
  "closed_note" text,
  "closed_at" timestamp with time zone,
  "production_closeout_snapshot" jsonb
);

CREATE TABLE public."orders" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "order_number" text NOT NULL,
  "order_date" date,
  "customer_name" text,
  "customer_email" text,
  "order_title" text NOT NULL,
  "quantity" integer NOT NULL,
  "order_total" numeric(12,2) NOT NULL,
  "deposit_amount" numeric(12,2) NOT NULL,
  "balance_amount" numeric(12,2) NOT NULL,
  "due_date" date,
  "status" text NOT NULL,
  "payment_status" text NOT NULL,
  "fulfillment" text NOT NULL,
  "tracking_number" text,
  "payment_link" text,
  "internal_notes" text,
  "public_status_text" text,
  "public_next_step" text,
  "shipping_or_pickup_note" text,
  "source_quote_number" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "stripe_invoice_id" text,
  "paid_date" date,
  "payment_link_stripe" text,
  "payment_link_paypal" text,
  "payment_link_venmo" text,
  "completion_email_sent" boolean,
  "completion_email_sent_at" timestamp with time zone,
  "po_number" text,
  "invoice_number" text,
  "invoice_date" date,
  "invoice_due_date" date,
  "invoice_terms" text,
  "invoice_sent" boolean,
  "invoice_sent_at" timestamp with time zone,
  "ap_email" text,
  "billing_address" text,
  "shipping_address" text,
  "finance_pushed" boolean,
  "finance_pushed_at" timestamp with time zone,
  "po_part_number" text,
  "olipoly_part_number" text,
  "part_revision" text,
  "shipping_contact_name" text,
  "shipping_company" text,
  "created_from_quote" boolean,
  "accepted_date" timestamp with time zone,
  "material" text,
  "color" text,
  "printer_profile" text,
  "layer_height" text,
  "nozzle_size" text,
  "estimated_piece_price" numeric,
  "estimated_print_time" text,
  "production_notes" text,
  "post_processing_notes" text,
  "catalog_part_id" uuid,
  "tax_exempt" boolean,
  "tax_exempt_reason" text,
  "exemption_certificate_on_file" boolean,
  "po_file_on_file" boolean,
  "source_type" text,
  "campaign_id" uuid,
  "campaign_submission_id" uuid,
  "campaign_public_reference" text,
  "campaign_code" text,
  "campaign_conversion_at" timestamp with time zone,
  "campaign_converted_by" uuid,
  "campaign_customer_link_status" text,
  "campaign_customer_id" uuid,
  "campaign_source_snapshot" jsonb,
  "destination_county" text,
  "sales_tax_rate" numeric,
  "taxable_subtotal" numeric,
  "sales_tax_amount" numeric,
  "customer_phone" text
);

CREATE TABLE public."campaign_order_conversion_snapshots" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "campaign_submission_id" uuid NOT NULL,
  "schema_version" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "converted_by" uuid NOT NULL,
  "converted_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."campaign_submissions" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "public_reference" text NOT NULL,
  "submission_source" text NOT NULL,
  "source_event_key" text NOT NULL,
  "source_schema_version" text NOT NULL,
  "payload_fingerprint" text NOT NULL,
  "campaign_snapshot" jsonb NOT NULL,
  "customer_snapshot" jsonb NOT NULL,
  "fulfillment_selection" text NOT NULL,
  "fulfillment_snapshot" jsonb NOT NULL,
  "payment_method_selection" text NOT NULL,
  "payment_selection_snapshot" jsonb NOT NULL,
  "payment_evidence_state" text NOT NULL,
  "customer_notes" text,
  "consent_snapshot" jsonb NOT NULL,
  "source_metadata" jsonb NOT NULL,
  "currency" text NOT NULL,
  "subtotal" numeric(12,2) NOT NULL,
  "personalization_total" numeric(12,2) NOT NULL,
  "shipping_amount" numeric(12,2),
  "tax_amount" numeric(12,2),
  "accepted_total" numeric(12,2) NOT NULL,
  "item_count" integer NOT NULL,
  "review_status" text NOT NULL,
  "internal_review_notes" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "replay_conflict_count" integer NOT NULL,
  "replay_conflict_at" timestamp with time zone,
  "conversion_status" text NOT NULL,
  "conversion_reference" text,
  "submitted_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "converted_order_id" uuid,
  "converted_order_number" text,
  "converted_by" uuid,
  "converted_at" timestamp with time zone
);

CREATE TABLE public."order_pricing_revisions" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "command_id" text NOT NULL,
  "reason" text NOT NULL,
  "totals" jsonb NOT NULL,
  "amount_received" numeric NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."production_job_roll_usage" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "production_job_id" uuid NOT NULL,
  "raw_material_id" uuid,
  "filament_label" text,
  "grams_used" numeric,
  "finished_roll" boolean NOT NULL,
  "spool_freed" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."production_jobs" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "job_title" text NOT NULL,
  "job_category" text NOT NULL,
  "job_status" text NOT NULL,
  "priority" text NOT NULL,
  "customer_name" text,
  "customer_email" text,
  "source_ref" text,
  "quote_number" text,
  "order_number" text,
  "sku" text,
  "due_date" date,
  "target_machine" text,
  "actual_machine" text,
  "quantity_planned" numeric NOT NULL,
  "quantity_completed" numeric NOT NULL,
  "estimated_hours_per_unit" numeric NOT NULL,
  "estimated_total_hours" numeric GENERATED ALWAYS AS ((COALESCE(quantity_planned, (0)::numeric) * COALESCE(estimated_hours_per_unit, (0)::numeric))) STORED,
  "actual_print_hours" numeric,
  "estimated_filaments" jsonb NOT NULL,
  "actual_filaments" jsonb,
  "creates_finished_good" boolean NOT NULL,
  "finished_good_id" uuid,
  "finished_good_name" text,
  "sale_price" numeric NOT NULL,
  "notes" text,
  "completion_notes" text,
  "completed_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "source" text,
  "quantity" integer,
  "machine_preference" text,
  "primary_material_type" text,
  "primary_color" text,
  "colors_count" integer,
  "filament_plan" jsonb,
  "estimated_grams_per_unit" numeric,
  "actual_filament_usage" jsonb,
  "event_name" text,
  "close_outcome" text,
  "closed_note" text,
  "closed_at" timestamp with time zone,
  "add_to_finished_goods" boolean,
  "finished_good_category" text,
  "finished_good_sale_price" numeric,
  "estimated_total_grams" numeric GENERATED ALWAYS AS ((COALESCE(estimated_grams_per_unit, (0)::numeric) * (GREATEST(COALESCE(quantity, 1), 1))::numeric)) STORED,
  "filament_recipe" jsonb,
  "failure_reason" text,
  "exclude_inventory_reduction" boolean NOT NULL,
  "print_started_at" timestamp with time zone,
  "estimated_finish_at" timestamp with time zone,
  "scrap_grams" numeric,
  "actual_filament_breakdown" text,
  "actual_quantity" numeric,
  "actual_grams_used" numeric,
  "close_note" text,
  "raw_material_roll_id" uuid,
  "finished_roll" boolean NOT NULL,
  "spool_freed" boolean NOT NULL,
  "roll_usages" jsonb,
  "job_type" text,
  "production_status" text,
  "primary_material" text,
  "other_colors" text,
  "color_count" numeric,
  "estimated_hours_each" numeric,
  "estimated_grams_each" numeric,
  "estimated_price_each" numeric,
  "image_url" text,
  "finished_sku" text,
  "filament_breakdown" text,
  "job_payload" jsonb,
  "design_fee" numeric,
  "post_processing_fee" numeric,
  "estimated_material_cost" numeric,
  "manual_rank" numeric,
  "design_fee_mode" text,
  "post_processing_fee_mode" text,
  "supply_usage" jsonb,
  "supply_cost" numeric,
  "quote_handoff_status" text,
  "quote_handoff_at" timestamp with time zone,
  "quote_accepted_at" timestamp with time zone,
  "production_source_type" text
);

CREATE TABLE public."finished_goods_inventory" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "sku" text,
  "product_name" text NOT NULL,
  "category" text NOT NULL,
  "qty_on_hand" numeric NOT NULL,
  "target_qty" numeric NOT NULL,
  "reorder_threshold_qty" numeric NOT NULL,
  "sale_price" numeric NOT NULL,
  "estimated_hours_per_unit" numeric NOT NULL,
  "material_recipe" jsonb NOT NULL,
  "location" text,
  "status" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "quantity_on_hand" integer,
  "target_quantity" integer,
  "reorder_threshold" integer,
  "print_hours_per_unit" numeric,
  "estimated_cost_per_unit" numeric,
  "source_job_id" uuid,
  "active" boolean
);

CREATE TABLE public."reusable_spool_pool" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "available_empty" numeric,
  "mounted_in_use" numeric,
  "retired" numeric,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE public."printer_pm" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "machine_name" text NOT NULL,
  "machine_label" text,
  "last_pm_date" date,
  "pm_interval_days" integer NOT NULL,
  "hours_since_pm" numeric NOT NULL,
  "pm_interval_hours" numeric NOT NULL,
  "lifetime_hours" numeric NOT NULL,
  "last_pm_notes" text,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "next_pm_date" date,
  "printer_model" text,
  "last_pm_note" text,
  "status_note" text,
  "machine" text,
  "printer_name" text,
  "nozzle_hours" numeric,
  "notes" text
);

CREATE TABLE public."raw_material_inventory" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "material_type" text NOT NULL,
  "brand" text,
  "color_name" text,
  "color_hex" text,
  "spool_label" text,
  "location" text,
  "starting_grams" numeric NOT NULL,
  "remaining_grams" numeric NOT NULL,
  "reorder_threshold_grams" numeric NOT NULL,
  "cost_per_spool" numeric NOT NULL,
  "cost_per_gram" numeric GENERATED ALWAYS AS (
CASE
    WHEN (COALESCE(starting_grams, (0)::numeric) > (0)::numeric) THEN (COALESCE(cost_per_spool, (0)::numeric) / starting_grams)
    ELSE (0)::numeric
END) STORED,
  "supplier" text,
  "reorder_url" text,
  "status" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "color_family" text,
  "current_grams" numeric,
  "spool_cost" numeric,
  "vendor" text,
  "active" boolean,
  "reserved_grams" numeric,
  "reorder_link" text,
  "reorder_quantity" numeric,
  "roll_label" text,
  "roll_type" text NOT NULL,
  "is_mounted" boolean NOT NULL,
  "reusable_spool" boolean NOT NULL,
  "roll_status" text NOT NULL,
  "color" text NOT NULL,
  "reorder_policy" text,
  "snooze_until" date
);

CREATE TABLE public."non_filament_materials" (
  "id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "item_name" text NOT NULL,
  "category" text,
  "unit_type" text NOT NULL,
  "quantity_on_hand" numeric NOT NULL,
  "cost_per_unit" numeric NOT NULL,
  "reorder_threshold" numeric NOT NULL,
  "supplier" text,
  "reorder_link" text,
  "notes" text,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "reorder_policy" text,
  "snooze_until" date
);

CREATE TABLE public."inventory_spool_pool" (
  "user_id" uuid NOT NULL,
  "available_empty" numeric,
  "retired" numeric,
  "notes" text,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."inventory_settings" (
  "user_id" uuid NOT NULL,
  "setting_key" text NOT NULL,
  "setting_value" jsonb NOT NULL,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."product_recipes" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "recipe_key" uuid NOT NULL,
  "revision_number" integer NOT NULL,
  "revision" text NOT NULL,
  "name" text NOT NULL,
  "olipoly_part_number" text,
  "category" text,
  "active" boolean NOT NULL,
  "default_quantity" integer NOT NULL,
  "suggested_selling_price" numeric(12,2),
  "suggested_piece_price" numeric(12,2),
  "manufacturing_snapshot" jsonb NOT NULL,
  "internal_notes" text,
  "customer_description" text,
  "source_production_job_id" uuid,
  "source_order_number" text,
  "supersedes_recipe_id" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "revision_history" jsonb NOT NULL
);

CREATE TABLE public."financial_entries" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "entry_date" date NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "amount" numeric(10,2) NOT NULL,
  "shipping_charged" numeric(10,2) NOT NULL,
  "shipping_cost" numeric(10,2) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "tax_category" text,
  "material_cost" numeric(10,2) NOT NULL,
  "packaging_cost" numeric(10,2) NOT NULL,
  "labor_cost" numeric(10,2) NOT NULL,
  "other_direct_cost" numeric(10,2) NOT NULL,
  "tax_included" text,
  "sales_tax_rate" numeric(8,4) NOT NULL,
  "sales_tax_collected" numeric(10,2) NOT NULL,
  "vendor_name" text,
  "payment_method" text,
  "receipt_link" text,
  "business_use_percent" numeric(5,2),
  "original_amount" numeric(12,2),
  "miles_driven" numeric(12,2),
  "mileage_rate" numeric(12,4),
  "trip_purpose" text,
  "trip_from" text,
  "trip_to" text,
  "round_trip" boolean,
  "tax_exempt_sale" boolean,
  "sales_county" text,
  "destination_county" text,
  "order_id" uuid,
  "order_number" text,
  "finance_command_id" text,
  "finance_command" text,
  "finance_command_owned" boolean NOT NULL,
  "correction_of_entry_id" uuid,
  "reversal_of_entry_id" uuid,
  "posted_by" uuid,
  "posted_at" timestamp with time zone,
  "correction_reason" text,
  "accepted_commercial_snapshot" jsonb NOT NULL,
  "invoice_breakdown_status" text,
  "correction_group_id" uuid,
  "replacement_for_entry_id" uuid,
  "correction_kind" text
);

CREATE TABLE public."asset_links" (
  "id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "asset_revision_id" uuid NOT NULL,
  "record_type" text NOT NULL,
  "record_key" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "link_type" text NOT NULL
);

CREATE TABLE public."customers" (
  "id" uuid NOT NULL,
  "customer_name" text NOT NULL,
  "company_name" text,
  "email" text,
  "phone" text,
  "tax_exempt" boolean,
  "po_customer" boolean,
  "notes" text,
  "lifetime_revenue" numeric,
  "order_count" integer,
  "first_order_date" timestamp with time zone,
  "last_order_date" timestamp with time zone,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
);

CREATE TABLE public."asset_records" (
  "id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "filename" text NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" text NOT NULL,
  "category" text NOT NULL,
  "file_size" bigint NOT NULL,
  "revision" integer NOT NULL,
  "revision_group_id" uuid NOT NULL,
  "supersedes_asset_id" uuid,
  "description" text,
  "uploaded_at" timestamp with time zone NOT NULL,
  "uploaded_by" text,
  "status" text NOT NULL,
  "archived_at" timestamp with time zone,
  "designation" text NOT NULL,
  "sha256" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE OR REPLACE FUNCTION public.allocate_order_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_value bigint;
begin
  v_value := nextval('public.olipoly_order_number_seq'::regclass);
  return 'OP-' || lpad(v_value::text, 6, '0');
end $function$
;

CREATE OR REPLACE FUNCTION public.prevent_campaign_order_snapshot_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin raise exception 'Campaign Order conversion snapshots are immutable' using errcode='55000'; end $function$
;

CREATE OR REPLACE FUNCTION public.convert_campaign_submission_to_order(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid(); v_submission public.campaign_submissions%rowtype; v_order public.orders%rowtype;
  v_items jsonb; v_item_count integer; v_quantity integer; v_line_total numeric(12,2); v_expected numeric(12,2);
  v_order_number text; v_now timestamptz := now(); v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_submission from public.campaign_submissions where id=p_submission_id for update;
  if not found or v_submission.user_id is distinct from v_actor then raise exception 'Submission not found or access denied' using errcode='42501'; end if;

  if v_submission.review_status='converted' or v_submission.conversion_status='converted' then
    select * into v_order from public.orders where id=v_submission.converted_order_id and campaign_submission_id=v_submission.id and user_id=v_actor;
    if not found or v_order.order_number is distinct from v_submission.converted_order_number then raise exception 'Converted submission Order evidence is inconsistent' using errcode='23514'; end if;
    return jsonb_build_object('outcome','already_converted','order_id',v_order.id,'order_number',v_order.order_number,'order_status',v_order.status);
  end if;
  if v_submission.review_status <> 'approved_for_conversion' then raise exception 'Submission is not approved for conversion' using errcode='22023'; end if;

  select jsonb_agg(jsonb_build_object(
      'line_sequence',i.line_sequence,'campaign_product_id',i.campaign_product_id,'product_public_code',i.product_public_code,
      'offer_snapshot',i.offer_snapshot,'submitted_variant',i.submitted_variant,'quantity',i.quantity,
      'personalization_requested',i.personalization_requested,'personalization_selection',i.personalization_selection,
      'authoritative_base_unit_price',i.authoritative_base_unit_price,'authoritative_personalization_unit_price',i.authoritative_personalization_unit_price,
      'authoritative_line_subtotal',i.authoritative_line_subtotal,'item_notes',i.item_notes) order by i.line_sequence),
    count(*)::integer,coalesce(sum(i.quantity),0)::integer,coalesce(sum(i.authoritative_line_subtotal),0)
    into v_items,v_item_count,v_quantity,v_line_total
    from public.campaign_submission_items i where i.campaign_submission_id=v_submission.id;
  if v_item_count < 1 or v_item_count is distinct from (select count(*)::integer from public.campaign_submission_items where campaign_submission_id=v_submission.id) then raise exception 'Invalid campaign item snapshot' using errcode='23514'; end if;
  v_expected := v_submission.subtotal + v_submission.personalization_total + coalesce(v_submission.shipping_amount,0) + coalesce(v_submission.tax_amount,0);
  if v_line_total is distinct from (v_submission.subtotal+v_submission.personalization_total)
     or v_submission.accepted_total is distinct from v_expected or v_quantity is distinct from v_submission.item_count then
    raise exception 'Invalid campaign commercial snapshot' using errcode='23514';
  end if;

  -- RC2.4's public input has no trusted Customer authority. In particular, a UUID
  -- inside customer_snapshot is untrusted public text and is never used for linkage.
  v_order_number := public.allocate_order_number();
  v_snapshot := jsonb_build_object(
    'source',jsonb_build_object('type','campaign','submission_id',v_submission.id,'public_reference',v_submission.public_reference,'source_event_key',v_submission.source_event_key),
    'campaign',v_submission.campaign_snapshot,'submission',jsonb_build_object('schema_version',v_submission.source_schema_version,'submitted_at',v_submission.submitted_at),
    'customer',v_submission.customer_snapshot,'fulfillment',jsonb_build_object('selection',v_submission.fulfillment_selection,'snapshot',v_submission.fulfillment_snapshot),
    'payment_evidence',jsonb_build_object('selection',v_submission.payment_method_selection,'state',v_submission.payment_evidence_state,'snapshot',v_submission.payment_selection_snapshot),
    'totals',jsonb_build_object('currency',v_submission.currency,'subtotal',v_submission.subtotal,'personalization_total',v_submission.personalization_total,'shipping_amount',v_submission.shipping_amount,'tax_amount',v_submission.tax_amount,'accepted_total',v_submission.accepted_total,'quantity',v_quantity),
    'items',v_items,'customer_notes',v_submission.customer_notes,'converted_at',v_now,'converted_by',v_actor);

  insert into public.orders(user_id,order_number,status,quantity,order_total,deposit_amount,balance_amount,payment_status,fulfillment,customer_name,customer_email,customer_phone,order_title,source_type,campaign_id,campaign_submission_id,campaign_public_reference,campaign_code,campaign_conversion_at,campaign_converted_by,campaign_customer_link_status,campaign_customer_id,campaign_source_snapshot,created_at,updated_at)
  values(v_actor,v_order_number,'ready_to_print',v_quantity,v_submission.accepted_total,0,v_submission.accepted_total,'unpaid',v_submission.fulfillment_selection,
    nullif(v_submission.customer_snapshot->>'name',''),nullif(v_submission.customer_snapshot->>'email',''),nullif(v_submission.customer_snapshot->>'phone',''),
    coalesce(nullif(v_submission.campaign_snapshot->>'name',''),'Campaign Order'), 'campaign',v_submission.campaign_id,v_submission.id,v_submission.public_reference,
    coalesce(v_submission.campaign_snapshot->>'campaign_code',v_submission.campaign_snapshot->>'campaign_slug'),v_now,v_actor,'unresolved_review_required',null,v_snapshot,v_now,v_now)
  returning * into v_order;

  insert into public.campaign_order_conversion_snapshots(user_id,order_id,campaign_submission_id,schema_version,snapshot,converted_by,converted_at)
  values(v_actor,v_order.id,v_submission.id,v_submission.source_schema_version,v_snapshot,v_actor,v_now);
  update public.campaign_submissions set review_status='converted',conversion_status='converted',conversion_reference=v_order.order_number,
    converted_order_id=v_order.id,converted_order_number=v_order.order_number,converted_by=v_actor,converted_at=v_now,updated_at=v_now where id=v_submission.id;
  return jsonb_build_object('outcome','converted','order_id',v_order.id,'order_number',v_order.order_number,'order_status',v_order.status);
end $function$
;

CREATE OR REPLACE FUNCTION public.preserve_production_attempt_pointer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_attempt_id text;
begin
  if new.production_status = 'qc'
     and jsonb_typeof(new.job_payload->'last_completed_attempt') = 'object' then
    v_attempt_id := nullif(new.job_payload->'last_completed_attempt'->>'id', '');
    if v_attempt_id is not null then
      new.job_payload := coalesce(new.job_payload, '{}'::jsonb)
        || jsonb_build_object('production_status', 'qc', 'current_attempt_id', v_attempt_id);
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_invoice_authority_to_finance_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_snapshot jsonb;
  v_totals jsonb;
  v_final numeric;
  v_order_total numeric;
  v_shipping_charged numeric;
  v_shipping_explicit numeric;
  v_shipping_source text;
  v_complete boolean := false;
  v_numeric_pattern constant text := '^[0-9]+([.][0-9]+)?$';
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;

  select o.order_total into v_order_total from public.orders o where o.id=new.order_id and o.user_id=new.user_id;
  v_totals:=public.current_order_commercial_totals(new.order_id);
  if v_totals->>'shipping_deferred'='true' then
    raise exception 'FINANCE_SHIPPING_PENDING: finalize the customer shipping charge before posting' using errcode='22023';
  end if;

  v_complete := jsonb_typeof(v_totals)='object'
    and v_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total']
    and (v_totals->>'final_total') ~ v_numeric_pattern;
  if v_complete then v_final := round((v_totals->>'final_total')::numeric,2); end if;

  if (v_complete and v_order_total is not null and v_final=round(v_order_total::numeric,2)) is not true then
    raise exception 'FINANCE_INVOICE_TOTALS_UNRESOLVED: authoritative invoice totals are unavailable or do not match the Order'
      using errcode='22023';
  end if;

  -- Shipping revenue priority is entirely server-side and snapshot-owned:
  --   1. invoice_totals.shipping_charged (new explicit contract),
  --   2. invoice_totals.shipping (older explicit line),
  --   3. zero only for the verified legacy customer_totals contract. Its required
  --      final_total is the documented subtotal plus tax and has no separate
  --      shipping component. Shipping production cost remains part of pricing and
  --      is never treated as customer shipping revenue or shipping_cost here.
  if v_totals ? 'shipping_charged' then
    if jsonb_typeof(v_totals->'shipping_charged') <> 'number'
       or (v_totals->>'shipping_charged') !~ v_numeric_pattern then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping_charged is malformed or negative'
        using errcode='22023';
    end if;
    v_shipping_charged := (v_totals->>'shipping_charged')::numeric;
    v_shipping_source := 'invoice_totals.shipping_charged';
  end if;

  if v_totals ? 'shipping' then
    if jsonb_typeof(v_totals->'shipping') <> 'number'
       or (v_totals->>'shipping') !~ v_numeric_pattern then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping is malformed or negative'
        using errcode='22023';
    end if;
    v_shipping_explicit := (v_totals->>'shipping')::numeric;
    if v_shipping_charged is not null and v_shipping_charged is distinct from v_shipping_explicit then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping values contradict each other'
        using errcode='22023';
    end if;
    if v_shipping_charged is null then
      v_shipping_charged := v_shipping_explicit;
      v_shipping_source := 'invoice_totals.shipping';
    end if;
  end if;

  if v_shipping_charged is null then
    v_shipping_charged := 0;
    v_shipping_source := 'verified_legacy_totals_no_shipping_component';
  end if;

  new.sales_tax_collected := (v_totals->>'tax')::numeric;
  new.shipping_charged := v_shipping_charged;
  new.invoice_breakdown_status := 'verified';
  new.accepted_commercial_snapshot := coalesce(new.accepted_commercial_snapshot,'{}'::jsonb) || jsonb_build_object(
    'reconciliation_status','verified',
    'breakdown_source','current_order_commercial_snapshot',
    'accepted_commercial_breakdown',v_totals,
    'shipping_charged',v_shipping_charged,
    'shipping_charged_source',v_shipping_source);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_correlation_id text)
 RETURNS SETOF orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_receipt public.order_payment_command_receipts%rowtype;
  v_previous_payment_status text;
  v_now timestamptz := statement_timestamp();
begin
  if v_actor is null then raise exception 'Authenticated order owner is required' using errcode='42501'; end if;
  if p_order_id is null or p_expected_updated_at is null or nullif(btrim(coalesce(p_correlation_id,'')),'') is null then
    raise exception 'Order ID, expected updated_at, and payment command identity are required' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('order-payment:' || p_correlation_id));
  select * into v_receipt from public.order_payment_command_receipts where command_identity=p_correlation_id;
  if found then
    if v_receipt.owner_id is distinct from v_actor or v_receipt.order_id is distinct from p_order_id or v_receipt.command is distinct from 'mark_paid' then
      raise exception 'Payment command identity is already used for another owner, Order, or command' using errcode='22023';
    end if;
    return query select o.* from public.orders o where o.id=v_receipt.order_id and o.user_id=v_actor;
    return;
  end if;

  select * into v_order from public.orders where id=p_order_id and user_id=v_actor for update;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  -- A repeated semantic command is a no-op even when it has a fresh command ID.
  -- Return the current authoritative row without changing its concurrency token.
  if v_order.payment_status = 'paid' and coalesce(v_order.balance_amount,0) = 0 then
    insert into public.order_payment_command_receipts(command_identity,owner_id,order_id,command,previous_payment_status,resulting_updated_at,result_snapshot,created_at)
    values(p_correlation_id,v_actor,v_order.id,'mark_paid',v_order.payment_status,v_order.updated_at,to_jsonb(v_order),v_now);
    return next v_order;
    return;
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order changed after it was loaded' using errcode='40001'; end if;
  if lower(coalesce(v_order.status,'')) in ('cancelled','canceled','void') then raise exception 'Cancelled Orders cannot accept payment commands' using errcode='55000'; end if;
  if coalesce(v_order.order_total,0) < 0 then raise exception 'Order total is invalid' using errcode='22023'; end if;

  v_previous_payment_status := v_order.payment_status;
  update public.orders set payment_status='paid', balance_amount=0, paid_date=coalesce(paid_date,v_now::date), updated_at=v_now
   where id=v_order.id and user_id=v_actor returning * into v_order;
  insert into public.order_payment_command_receipts(command_identity,owner_id,order_id,command,previous_payment_status,resulting_updated_at,result_snapshot,created_at)
  values(p_correlation_id,v_actor,v_order.id,'mark_paid',v_previous_payment_status,v_order.updated_at,to_jsonb(v_order),v_now);
  return next v_order;
end $function$
;

CREATE OR REPLACE FUNCTION public.require_finance_eligible_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_order public.orders%rowtype;
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;
  select * into v_order from public.orders where id=new.order_id and user_id=new.user_id;
  if not found then raise exception 'FINANCE_ORDER_NOT_FOUND: authoritative Order is unavailable' using errcode='42501'; end if;
  if v_order.payment_status not in ('paid','deposit_paid') then raise exception 'FINANCE_PAYMENT_INCOMPLETE: Order is still marked Unpaid' using errcode='55000'; end if;
  if coalesce(v_order.order_total,0) <= 0 then raise exception 'FINANCE_TOTAL_REQUIRED: authoritative Order total must be greater than zero' using errcode='22023'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.production_workflow_command(p_production_job_id uuid, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb DEFAULT '{}'::jsonb, p_correlation_id text DEFAULT NULL::text, p_causation_id text DEFAULT NULL::text)
 RETURNS production_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid:=auth.uid(); v_job public.production_jobs%rowtype; v_receipt public.workflow_command_receipts%rowtype;
 v_now timestamptz:=now(); v_from text; v_to text; v_command text:=lower(btrim(coalesce(p_command,''))); v_key text:=nullif(btrim(coalesce(p_correlation_id,'')),''); v_attempt jsonb;
begin
 perform set_config('lock_timeout','2000ms',true);
 if v_actor is null then raise exception 'Authentication is required for Production workflow commands' using errcode='28000'; end if;
 if p_expected_updated_at is null or v_key is null then raise exception 'expected_updated_at and command identity are required' using errcode='22004'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended(v_key,0)) then raise exception 'Production workflow command identity is already in progress' using errcode='55P03'; end if;
 select * into v_receipt from public.workflow_command_receipts where command_identity=v_key;
 if found then
   if v_receipt.owner_id<>v_actor or v_receipt.production_job_id<>p_production_job_id or v_receipt.command<>v_command then raise exception 'Command identity is already used for another workflow command' using errcode='23505'; end if;
   select * into v_job from jsonb_populate_record(null::public.production_jobs,v_receipt.result_snapshot); return v_job;
 end if;
 begin select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update nowait;
 exception when lock_not_available then raise exception 'Production workflow job is already in progress' using errcode='55P03'; end;
 if not found then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
 if v_job.production_source_type<>'legacy_standalone' or v_job.order_number is not null then raise exception 'Job-scoped workflow is restricted to explicitly approved standalone legacy Production' using errcode='23514'; end if;
 if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production workflow changed since this page loaded; refresh before retrying' using errcode='PT409',detail='appCode=40001 conflictScope=production_row'; end if;
 v_from:=v_job.production_status;
 if v_command='start_print' and v_from='ready_to_print' then v_to:='printing';
 elsif v_command='complete_print' and v_from='printing' then
   v_to:='qc';
   if coalesce(p_payload->>'actual_machine','')='' or coalesce(p_payload->>'actual_grams_used','') !~ '^[0-9]+(\.[0-9]+)?$' or coalesce(p_payload->>'actual_print_hours','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Complete Print requires authoritative actuals' using errcode='22023'; end if;
   v_attempt:=coalesce(p_payload->'production_attempt',jsonb_build_object('id','attempt-'||v_job.id||'-'||extract(epoch from v_now),'captured_at',v_now,'actual_grams_used',p_payload->'actual_grams_used','scrap_grams',coalesce(p_payload->'scrap_grams','0'::jsonb),'actual_print_hours',p_payload->'actual_print_hours','actual_machine',p_payload->>'actual_machine','actual_quantity',p_payload->'actual_quantity','roll_usages',coalesce(p_payload->'roll_usages','[]')));
 elsif v_command='close' and v_from='ready_for_fulfillment' then v_to:='closed';
 else raise exception 'Invalid standalone Production transition from % using %',v_from,v_command using errcode='22023'; end if;
 update public.production_jobs set production_status=v_to,
  print_started_at=case when v_command='start_print' then coalesce(print_started_at,v_now) else print_started_at end,
  completed_at=case when v_command='complete_print' then v_now else completed_at end,
  actual_machine=case when v_command='complete_print' then p_payload->>'actual_machine' else actual_machine end,
  actual_quantity=case when v_command='complete_print' then nullif(p_payload->>'actual_quantity','')::numeric else actual_quantity end,
  actual_print_hours=case when v_command='complete_print' then (p_payload->>'actual_print_hours')::numeric else actual_print_hours end,
  actual_grams_used=case when v_command='complete_print' then (p_payload->>'actual_grams_used')::numeric else actual_grams_used end,
  scrap_grams=case when v_command='complete_print' then coalesce(nullif(p_payload->>'scrap_grams','')::numeric,0) else scrap_grams end,
  roll_usages=case when v_command='complete_print' then coalesce(p_payload->'roll_usages','[]') else roll_usages end,
  job_payload=coalesce(job_payload,'{}')||jsonb_build_object('production_status',v_to,'updated_at',v_now)||case when v_command='complete_print' then jsonb_build_object('last_completed_attempt',v_attempt,'production_attempts',coalesce(job_payload->'production_attempts','[]')||jsonb_build_array(v_attempt)) else '{}'::jsonb end,
  updated_at=v_now where id=v_job.id and user_id=v_actor returning * into v_job;
 insert into public.workflow_command_receipts(command_identity,owner_id,production_job_id,command,from_state,to_state,resulting_updated_at,result_snapshot,created_at)
 values(v_key,v_actor,v_job.id,v_command,v_from,v_to,v_job.updated_at,to_jsonb(v_job),v_now);
 return v_job;
end $function$
;

CREATE OR REPLACE FUNCTION public.approve_legacy_standalone_production(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_command_identity text)
 RETURNS production_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid:=auth.uid(); v_job public.production_jobs%rowtype; v_report record;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if nullif(btrim(coalesce(p_command_identity,'')),'') is null then raise exception 'Operator approval identity is required' using errcode='22004'; end if;
 select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update;
 if not found then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
 if v_job.production_source_type='legacy_standalone' then return v_job; end if;
 if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production job changed; refresh before approval' using errcode='PT409'; end if;
 select * into v_report from public.production_legacy_classification_report where production_job_id=v_job.id;
 if v_report.classification<>'LEGACY_STANDALONE' or v_report.matching_order_count<>0 or v_report.modern_provenance_markers->>'identity_fields'<>'false' then
   raise exception 'Standalone classification rejected: modern, repairable, conflicting, or ambiguous provenance exists' using errcode='23514';
 end if;
 update public.production_jobs set production_source_type='legacy_standalone',updated_at=now() where id=v_job.id returning * into v_job;
 insert into public.production_linkage_audit(user_id,production_job_id,command_identity,event_type,from_status,to_status,evidence)
 values(v_actor,v_job.id,p_command_identity,'legacy_standalone_approved',v_job.production_status,v_job.production_status,jsonb_build_object('approved_without_order',true))
 on conflict(command_identity) do nothing;
 return v_job;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_effective_financial_entries()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    to_jsonb(root)

    -- The latest cumulative effective snapshot overlays the immutable original.
    || coalesce(latest_receipt.effective_record, '{}'::jsonb)

    -- Server-owned reporting and audit metadata always wins over any keys that
    -- may appear inside effective_record.
    || jsonb_build_object(
      'id',
        root.id,

      'original_entry_id',
        root.id,

      'effective_entry_id',
        coalesce(latest_receipt.effective_entry_id, root.id),

      'correction_group_id',
        latest_receipt.correction_group_id,

      'correction_kind',
        latest_receipt.correction_kind,

      'correction_status',
        case
          when latest_receipt.command_identity is null then 'original'
          else 'active'
        end,

      'is_corrected',
        latest_receipt.command_identity is not null,

      'correction_command_identity',
        latest_receipt.command_identity,

      'metadata_correction_entry_id',
        latest_receipt.metadata_entry_id,

      'reversal_entry_id',
        latest_receipt.reversal_entry_id,

      'replacement_entry_id',
        latest_receipt.replacement_entry_id,

      'correction_reason',
        latest_receipt.reason,

      'changed_fields',
        coalesce(latest_receipt.changed_fields, '{}'::jsonb),

      'correction_history',
        coalesce(history.items, '[]'::jsonb),

      'effective_version_at',
        coalesce(
          latest_receipt.created_at,
          nullif(to_jsonb(root)->>'posted_at', '')::timestamptz,
          root.created_at
        ),

      -- One original/effective transaction contributes exactly one report row.
      'report_transaction_count',
        1
    )

  from public.financial_entries root

  left join lateral (
    select r.*
    from public.finance_correction_receipts r
    where r.owner_id = auth.uid()
      and r.original_entry_id = root.id
      and coalesce(
        nullif(r.effective_record->>'correction_status', ''),
        'active'
      ) <> 'voided'
    order by
      r.created_at desc,
      r.command_identity desc
    limit 1
  ) latest_receipt on true

  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'command_identity',
            r.command_identity,

          'correction_group_id',
            r.correction_group_id,

          'correction_kind',
            r.correction_kind,

          'metadata_entry_id',
            r.metadata_entry_id,

          'reversal_entry_id',
            r.reversal_entry_id,

          'replacement_entry_id',
            r.replacement_entry_id,

          'effective_entry_id',
            r.effective_entry_id,

          'reason',
            r.reason,

          'changed_fields',
            coalesce(r.changed_fields, '{}'::jsonb),

          'created_at',
            r.created_at,

          'status',
            coalesce(
              nullif(r.effective_record->>'correction_status', ''),
              'active'
            )
        )
        order by
          r.created_at,
          r.command_identity
      ) as items

    from public.finance_correction_receipts r
    where r.owner_id = auth.uid()
      and r.original_entry_id = root.id
  ) history on true

  where auth.uid() is not null
    and root.user_id = auth.uid()

    -- Technical correction ledger rows must not become additional visible
    -- financial transactions.
    and nullif(to_jsonb(root)->>'correction_of_entry_id', '') is null
    and nullif(to_jsonb(root)->>'reversal_of_entry_id', '') is null
    and nullif(to_jsonb(root)->>'replacement_for_entry_id', '') is null

  order by
    root.entry_date desc,
    root.created_at desc,
    root.id;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_production_job(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_command_identity text)
 RETURNS production_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.production_jobs%rowtype;
  v_receipt public.workflow_command_receipts%rowtype;
  v_from text;
  v_to text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text := nullif(btrim(coalesce(p_command_identity, '')), '');
begin
  perform set_config('lock_timeout', '2000ms', true);
  if v_actor is null then
    raise exception 'Authentication is required for Production cancellation' using errcode = '28000';
  end if;
  if p_production_job_id is null or p_expected_updated_at is null or v_key is null or v_reason is null then
    raise exception 'Production job, expected version, cancellation reason, and command identity are required' using errcode = '22004';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended(v_key, 0)) then
    raise exception 'Production cancellation is already in progress' using errcode = '55P03';
  end if;

  select * into v_receipt from public.workflow_command_receipts where command_identity = v_key;
  if found then
    if v_receipt.owner_id <> v_actor
       or v_receipt.production_job_id <> p_production_job_id
       or v_receipt.command <> 'cancel' then
      raise exception 'Command identity is already used for another workflow command' using errcode = '23505';
    end if;
    select * into v_job
      from jsonb_populate_record(null::public.production_jobs, v_receipt.result_snapshot);
    return v_job;
  end if;

  begin
    select * into v_job
      from public.production_jobs
     where id = p_production_job_id and user_id = v_actor
     for update nowait;
  exception when lock_not_available then
    raise exception 'Production job is already being changed' using errcode = '55P03';
  end;
  if not found then
    raise exception 'Production job not found for authenticated owner' using errcode = '42501';
  end if;
  if v_job.order_number is not null then
    raise exception 'Linked accepted work must be canceled through the Order workflow' using errcode = '23514';
  end if;
  if v_job.updated_at is distinct from p_expected_updated_at then
    raise exception 'Production changed since this page loaded; refresh before retrying'
      using errcode = 'PT409', detail = 'appCode=40001 conflictScope=production_row';
  end if;

  v_from := v_job.production_status;
  if v_from in ('void', 'canceled') then
    return v_job;
  end if;
  if v_from in ('closed', 'completed', 'archived', 'failed_scrap') then
    raise exception 'Historical Production cannot be canceled' using errcode = '23514';
  end if;
  v_to := case when v_from in ('estimate', 'waiting_customer', 'quote_sent', 'quote_declined') then 'void' else 'canceled' end;

  -- Release only active reservations. Consumed reservations, inventory
  -- transactions, and consumption receipts remain immutable history.
  update public.raw_material_inventory r
     set reserved_grams = greatest(coalesce(r.reserved_grams, 0) - a.reserved_grams, 0),
         updated_at = v_now
    from public.production_material_reservations a
   where a.user_id = v_actor
     and a.production_job_id = v_job.id
     and a.status = 'active'
     and a.raw_material_roll_id = r.id
     and r.user_id = v_actor;

  update public.production_material_reservations
     set status = 'released', release_command_id = v_key,
         released_at = v_now, updated_at = v_now
   where user_id = v_actor and production_job_id = v_job.id and status = 'active';

  update public.production_jobs
     set production_status = v_to,
         close_note = '[Canceled] ' || v_reason,
         estimated_finish_at = null,
         job_payload = coalesce(job_payload, '{}'::jsonb) || jsonb_build_object(
           'production_status', v_to,
           'cancellation_reason', v_reason,
           'canceled_at', v_now,
           'updated_at', v_now
         ),
         updated_at = v_now
   where id = v_job.id and user_id = v_actor
   returning * into v_job;

  insert into public.workflow_command_receipts(
    command_identity, owner_id, production_job_id, command, from_state,
    to_state, resulting_updated_at, result_snapshot, created_at
  ) values (
    v_key, v_actor, v_job.id, 'cancel', v_from, v_to,
    v_job.updated_at, to_jsonb(v_job), v_now
  );
  return v_job;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.correct_financial_entry(p_original_entry_id uuid, p_corrected_record jsonb, p_changed_fields text[], p_reason text, p_expected_effective_posted_at timestamp with time zone, p_tax_override_enabled boolean, p_tax_override_reason text, p_correlation_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  -- Canonical live mapping: amount is the income taxable/pre-tax ledger amount;
  -- sales_county, sales_tax_rate, sales_tax_collected and tax_exempt_sale are
  -- stored directly. Friendly taxable/destination aliases are not row fields.
  v_actor uuid:=auth.uid(); v_root public.financial_entries%rowtype; v_effective public.financial_entries%rowtype;
  v_effective_version timestamptz;
  v_receipt public.finance_correction_receipts%rowtype; v_group uuid:=gen_random_uuid(); v_now timestamptz:=statement_timestamp();
  v_current jsonb; v_proposed jsonb; v_corrected jsonb; v_changed jsonb:='{}'::jsonb; v_key text; v_kind text;
  v_type text; v_date date; v_amount numeric; v_income_amount numeric; v_rate numeric; v_calculated_tax numeric; v_tax numeric;
  v_effective_amount numeric; v_effective_rate numeric;
  v_shipping_charged numeric; v_shipping_cost numeric; v_material numeric; v_packaging numeric; v_labor numeric; v_other numeric;
  v_business numeric; v_miles numeric; v_mileage_rate numeric; v_reversal public.financial_entries%rowtype; v_replacement public.financial_entries%rowtype; v_metadata public.financial_entries%rowtype;
  v_financial_keys constant text[]:=array['type','amount','original_amount','shipping_charged','sales_tax_rate','sales_tax_collected','tax_exempt_sale','shipping_cost','material_cost','packaging_cost','labor_cost','other_direct_cost','business_use_percent','miles_driven','mileage_rate'];
begin
  if v_actor is null then raise exception 'Authenticated Finance operator is required' using errcode='42501'; end if;
  if p_original_entry_id is null or jsonb_typeof(p_corrected_record)<>'object' then raise exception 'Original entry and complete corrected record are required' using errcode='22023'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 or length(p_reason)>500 then raise exception 'Reason for correction is required' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_correlation_id,'')),'') is null or length(p_correlation_id)>200 then raise exception 'Correction command identity is required' using errcode='22023'; end if;
  if p_expected_effective_posted_at is null then raise exception 'Expected effective timestamp is required' using errcode='22004'; end if;
  if coalesce(cardinality(p_changed_fields),0)=0 then raise exception 'At least one changed field is required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtext('full-finance-correction:'||p_correlation_id));
  select * into v_receipt from public.finance_correction_receipts where command_identity=p_correlation_id;
  if found then
    if v_receipt.owner_id is distinct from v_actor or v_receipt.original_entry_id is distinct from p_original_entry_id then raise exception 'Correction identity belongs to another command' using errcode='23505'; end if;
    return jsonb_build_object('idempotent',true,'correction_kind',v_receipt.correction_kind,'correction_group_id',v_receipt.correction_group_id,'metadata_entry_id',v_receipt.metadata_entry_id,'reversal_entry_id',v_receipt.reversal_entry_id,'replacement_entry_id',v_receipt.replacement_entry_id,'effective_entry_id',v_receipt.effective_entry_id,'effective_record',v_receipt.effective_record);
  end if;

  select * into v_root from public.financial_entries where id=p_original_entry_id and user_id=v_actor for update;
  if not found then raise exception 'Original Finance entry not found for this operator' using errcode='42501'; end if;
  if not coalesce(v_root.finance_command_owned,false) or v_root.correction_of_entry_id is not null or v_root.reversal_of_entry_id is not null or v_root.replacement_for_entry_id is not null then raise exception 'Correction root must be an original authoritative posting' using errcode='22023'; end if;

  select f.* into v_effective from public.finance_correction_receipts r join public.financial_entries f on f.id=r.replacement_entry_id
   where r.owner_id=v_actor and r.original_entry_id=v_root.id and r.replacement_entry_id is not null order by r.created_at desc limit 1 for update of f;
  if not found then v_effective:=v_root; end if;
  select coalesce(max(created_at),coalesce(v_effective.posted_at,v_effective.created_at)) into v_effective_version from public.finance_correction_receipts where owner_id=v_actor and original_entry_id=v_root.id;
  if v_effective_version is distinct from p_expected_effective_posted_at then raise exception 'Effective Finance entry changed; refresh before correcting' using errcode='40001'; end if;
  v_effective_amount:=coalesce(v_effective.amount,(v_effective.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,taxable_subtotal}')::numeric,(v_effective.accepted_commercial_snapshot->>'taxable_subtotal')::numeric,0);
  v_effective_rate:=case when coalesce(v_effective.sales_tax_rate,0)=0 and coalesce(v_effective.sales_tax_collected,0)>0 then coalesce((v_effective.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,tax_rate}')::numeric,(v_effective.accepted_commercial_snapshot->>'sales_tax_rate')::numeric,0) else coalesce(v_effective.sales_tax_rate,0) end;

  v_type:=lower(btrim(coalesce(p_corrected_record->>'type','')));
  if v_type not in ('income','expense') then raise exception 'Entry type must be income or expense' using errcode='22023'; end if;
  begin v_date:=(p_corrected_record->>'entry_date')::date; exception when others then raise exception 'Correction date is invalid' using errcode='22007'; end;
  v_amount:=case when jsonb_typeof(p_corrected_record->'amount')='number' then public.finance_adjustment_value(p_corrected_record,'amount'::text) else v_effective_amount end;
  v_income_amount:=case when v_type='income' then v_amount else 0 end;
  v_rate:=case when jsonb_typeof(p_corrected_record->'sales_tax_rate')='number' then public.finance_adjustment_value(p_corrected_record,'sales_tax_rate'::text) else v_effective_rate end;
  v_shipping_charged:=case when jsonb_typeof(p_corrected_record->'shipping_charged')='number' then public.finance_adjustment_value(p_corrected_record,'shipping_charged'::text) else coalesce(v_effective.shipping_charged,0) end;
  v_shipping_cost:=case when jsonb_typeof(p_corrected_record->'shipping_cost')='number' then public.finance_adjustment_value(p_corrected_record,'shipping_cost'::text) else coalesce(v_effective.shipping_cost,0) end;
  v_material:=case when jsonb_typeof(p_corrected_record->'material_cost')='number' then public.finance_adjustment_value(p_corrected_record,'material_cost'::text) else coalesce(v_effective.material_cost,0) end;
  v_packaging:=case when jsonb_typeof(p_corrected_record->'packaging_cost')='number' then public.finance_adjustment_value(p_corrected_record,'packaging_cost'::text) else coalesce(v_effective.packaging_cost,0) end;
  v_labor:=case when jsonb_typeof(p_corrected_record->'labor_cost')='number' then public.finance_adjustment_value(p_corrected_record,'labor_cost'::text) else coalesce(v_effective.labor_cost,0) end;
  v_other:=case when jsonb_typeof(p_corrected_record->'other_direct_cost')='number' then public.finance_adjustment_value(p_corrected_record,'other_direct_cost'::text) else coalesce(v_effective.other_direct_cost,0) end;
  v_business:=case when jsonb_typeof(p_corrected_record->'business_use_percent')='number' then public.finance_adjustment_value(p_corrected_record,'business_use_percent'::text) else coalesce(v_effective.business_use_percent,100) end;
  v_miles:=case when jsonb_typeof(p_corrected_record->'miles_driven')='number' then public.finance_adjustment_value(p_corrected_record,'miles_driven'::text) else coalesce(v_effective.miles_driven,0) end;
  v_mileage_rate:=case when jsonb_typeof(p_corrected_record->'mileage_rate')='number' then public.finance_adjustment_value(p_corrected_record,'mileage_rate'::text) else coalesce(v_effective.mileage_rate,0) end;
  if v_amount<0 or v_income_amount<0 or v_rate<0 or v_rate>20 or v_shipping_charged<0 or v_shipping_cost<0 or v_material<0 or v_packaging<0 or v_labor<0 or v_other<0 or v_business<0 or v_business>100 or v_miles<0 or v_mileage_rate<0 then raise exception 'Corrected monetary values are invalid' using errcode='22023'; end if;
  if nullif(btrim(p_corrected_record->>'title'),'') is null or nullif(btrim(p_corrected_record->>'category'),'') is null then raise exception 'Title and category are required' using errcode='22023'; end if;
  if v_type='expense' and (v_income_amount<>0 or v_shipping_charged<>0 or v_rate<>0 or coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false)) then raise exception 'Expense correction contains income-only fields' using errcode='22023'; end if;
  if v_type='income' and (p_changed_fields && array['sales_county','amount','original_amount','sales_tax_rate','sales_tax_collected','tax_exempt_sale']::text[]) and not coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) and v_income_amount>0 and not public.is_ohio_county(p_corrected_record->>'sales_county') then raise exception 'Select the destination county used for sales-tax reporting' using errcode='22023'; end if;
  v_calculated_tax:=case when v_type='expense' or coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) then 0 else round((v_income_amount+case when v_root.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,shipping_in_taxable_subtotal}'='true' then v_shipping_charged else 0 end)*v_rate/100,2) end;
  if coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false) and (v_rate<>0 or nullif(btrim(coalesce(p_corrected_record->>'tax_exempt_reason','')),'') is null) then raise exception 'Tax exemption metadata is contradictory' using errcode='22023'; end if;
  if coalesce(p_tax_override_enabled,false) then
    if nullif(btrim(coalesce(p_tax_override_reason,'')),'') is null then raise exception 'Tax override explanation is required' using errcode='22023'; end if;
    v_tax:=public.finance_adjustment_value(p_corrected_record,'sales_tax_collected'::text);
  elsif p_changed_fields && array['amount','original_amount','sales_tax_rate','tax_exempt_sale']::text[]
    or (v_root.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,shipping_in_taxable_subtotal}'='true' and 'shipping_charged'=any(p_changed_fields)) then
    v_tax:=v_calculated_tax;
  else
    -- Metadata-only corrections preserve the posted tax exactly.
    v_tax:=coalesce(v_effective.sales_tax_collected,0);
  end if;

  v_corrected:=jsonb_build_object('type',v_type,'entry_date',v_date,'category',p_corrected_record->>'category','tax_category',coalesce(p_corrected_record->>'tax_category','auto'),'title',p_corrected_record->>'title','notes',coalesce(p_corrected_record->>'notes',''),'vendor_name',coalesce(p_corrected_record->>'vendor_name',''),'payment_method',coalesce(p_corrected_record->>'payment_method',''),'receipt_link',coalesce(p_corrected_record->>'receipt_link',''),'business_use_percent',v_business,'amount',case when v_type='income' then v_income_amount else v_amount end,'original_amount',case when jsonb_typeof(p_corrected_record->'original_amount')='number' then public.finance_adjustment_value(p_corrected_record,'original_amount'::text) else coalesce(v_effective.original_amount,v_amount) end,'sales_county',case when v_type='income' then coalesce(p_corrected_record->>'sales_county','') else '' end,'sales_tax_rate',case when v_type='income' then v_rate else 0 end,'sales_tax_collected',case when v_type='income' then v_tax else 0 end,'tax_exempt_sale',v_type='income' and coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false),'shipping_charged',case when v_type='income' then v_shipping_charged else 0 end,'shipping_cost',v_shipping_cost,'material_cost',case when v_type='income' then v_material else 0 end,'packaging_cost',case when v_type='income' then v_packaging else 0 end,'labor_cost',case when v_type='income' then v_labor else 0 end,'other_direct_cost',case when v_type='income' then v_other else 0 end,'miles_driven',case when v_type='expense' then v_miles else 0 end,'mileage_rate',case when v_type='expense' then v_mileage_rate else 0 end,'trip_purpose',case when v_type='expense' then coalesce(p_corrected_record->>'trip_purpose','') else '' end,'trip_from',case when v_type='expense' then coalesce(p_corrected_record->>'trip_from','') else '' end,'trip_to',case when v_type='expense' then coalesce(p_corrected_record->>'trip_to','') else '' end,'round_trip',v_type='expense' and coalesce((p_corrected_record->>'round_trip')::boolean,false),'tax_exempt_reason',coalesce(p_corrected_record->>'tax_exempt_reason',''),'exemption_certificate_on_file',coalesce((p_corrected_record->>'exemption_certificate_on_file')::boolean,false),'calculated_sales_tax',v_calculated_tax,'tax_override_enabled',coalesce(p_tax_override_enabled,false),'tax_override_reason',coalesce(p_tax_override_reason,''));
  if not coalesce(p_tax_override_enabled,false) then v_corrected:=v_corrected-'tax_override_enabled'-'tax_override_reason'; end if;
  if not coalesce(p_tax_override_enabled,false) and v_income_amount=v_effective_amount and v_rate=v_effective_rate and coalesce((p_corrected_record->>'tax_exempt_sale')::boolean,false)=coalesce(v_effective.tax_exempt_sale,false) then v_corrected:=v_corrected-'calculated_sales_tax'; end if;
  v_current:=to_jsonb(v_effective)||jsonb_build_object('sales_tax_rate',v_effective_rate,'amount',v_effective_amount,'original_amount',case when v_effective.type='income' then v_effective_amount else coalesce(v_effective.original_amount,v_effective.amount) end)||coalesce((select effective_record from public.finance_correction_receipts where owner_id=v_actor and original_entry_id=v_root.id order by created_at desc limit 1),'{}'::jsonb);
  v_proposed:=p_corrected_record;
  for v_key in select jsonb_object_keys(v_proposed) loop if v_current->v_key is distinct from v_proposed->v_key then v_changed:=v_changed||jsonb_build_object(v_key,jsonb_build_object('old',v_current->v_key,'new',v_proposed->v_key)); end if; end loop;
  if v_changed='{}'::jsonb then raise exception 'Corrected record does not change any field' using errcode='22023'; end if;
  v_kind:=case when exists(select 1 from jsonb_object_keys(v_changed) k where k=any(v_financial_keys)) then 'reversal_replacement' else 'metadata_only' end;

  if v_kind='metadata_only' then
    v_corrected:=v_current||v_proposed;
    if not coalesce(p_tax_override_enabled,false) then v_corrected:=v_corrected-'tax_override_enabled'-'tax_override_reason'; end if;
    insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,business_use_percent,shipping_charged,sales_tax_collected,tax_exempt_sale,tax_included,sales_tax_rate,sales_county,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,order_id,order_number,finance_command_id,finance_command,finance_command_owned,correction_of_entry_id,posted_by,posted_at,correction_reason,correction_group_id,correction_kind,accepted_commercial_snapshot)
    values(v_actor,v_effective.type,v_date,p_corrected_record->>'category',p_corrected_record->>'tax_category',p_corrected_record->>'title','Metadata-only correction: '||p_reason,0,0,100,0,0,false,'no',0,p_corrected_record->>'sales_county',0,0,0,0,0,v_root.order_id,v_root.order_number,p_correlation_id,'correct_entry_metadata',true,v_root.id,v_actor,v_now,p_reason,v_group,v_kind,coalesce(v_root.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object('correction_root_entry_id',v_root.id,'effective_entry_id',v_effective.id,'correction_group_id',v_group,'corrected_record',v_corrected,'changed_fields',v_changed,'corrected_by',v_actor,'corrected_at',v_now)) returning * into v_metadata;
  else
    insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,business_use_percent,shipping_charged,sales_tax_collected,tax_exempt_sale,tax_included,sales_tax_rate,sales_county,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,order_id,order_number,finance_command_id,finance_command,finance_command_owned,correction_of_entry_id,reversal_of_entry_id,posted_by,posted_at,correction_reason,correction_group_id,correction_kind,accepted_commercial_snapshot)
    values(v_actor,v_effective.type,v_date,v_effective.category,v_effective.tax_category,'Reversal - '||coalesce(v_effective.title,v_effective.id::text),'Full reversal for correction: '||p_reason,-coalesce(v_effective.amount,0),-coalesce(v_effective.original_amount,v_effective.amount,0),coalesce(v_effective.business_use_percent,100),-coalesce(v_effective.shipping_charged,0),-coalesce(v_effective.sales_tax_collected,0),coalesce(v_effective.tax_exempt_sale,false),'no',coalesce(v_effective.sales_tax_rate,0),v_effective.sales_county,-coalesce(v_effective.shipping_cost,0),-coalesce(v_effective.material_cost,0),-coalesce(v_effective.packaging_cost,0),-coalesce(v_effective.labor_cost,0),-coalesce(v_effective.other_direct_cost,0),v_root.order_id,v_root.order_number,p_correlation_id||':reversal','correct_entry_reversal',true,v_root.id,v_effective.id,v_actor,v_now,p_reason,v_group,v_kind,jsonb_build_object('correction_root_entry_id',v_root.id,'correction_group_id',v_group,'changed_fields',v_changed,'corrected_by',v_actor,'corrected_at',v_now)) returning * into v_reversal;
    insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,vendor_name,payment_method,receipt_link,business_use_percent,shipping_charged,sales_tax_collected,tax_exempt_sale,tax_included,sales_tax_rate,sales_county,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost,miles_driven,mileage_rate,trip_purpose,trip_from,trip_to,round_trip,order_id,order_number,finance_command_id,finance_command,finance_command_owned,correction_of_entry_id,replacement_for_entry_id,posted_by,posted_at,correction_reason,correction_group_id,correction_kind,accepted_commercial_snapshot)
    values(v_actor,v_type,v_date,v_corrected->>'category',v_corrected->>'tax_category',v_corrected->>'title',v_corrected->>'notes',v_amount,(v_corrected->>'original_amount')::numeric,v_corrected->>'vendor_name',v_corrected->>'payment_method',v_corrected->>'receipt_link',v_business,case when v_type='income' then v_shipping_charged else 0 end,case when v_type='income' then v_tax else 0 end,coalesce((v_corrected->>'tax_exempt_sale')::boolean,false),'no',case when v_type='income' then v_rate else 0 end,v_corrected->>'sales_county',v_shipping_cost,case when v_type='income' then v_material else 0 end,case when v_type='income' then v_packaging else 0 end,case when v_type='income' then v_labor else 0 end,case when v_type='income' then v_other else 0 end,case when v_type='expense' then v_miles else 0 end,case when v_type='expense' then v_mileage_rate else 0 end,v_corrected->>'trip_purpose',v_corrected->>'trip_from',v_corrected->>'trip_to',coalesce((v_corrected->>'round_trip')::boolean,false),v_root.order_id,v_root.order_number,p_correlation_id||':replacement','correct_entry_replacement',true,v_root.id,v_effective.id,v_actor,v_now,p_reason,v_group,v_kind,coalesce(v_root.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object('correction_root_entry_id',v_root.id,'correction_group_id',v_group,'reversal_entry_id',v_reversal.id,'corrected_record',v_corrected,'changed_fields',v_changed,'tax_override_enabled',coalesce(p_tax_override_enabled,false),'tax_override_reason',coalesce(p_tax_override_reason,''),'calculated_sales_tax',v_calculated_tax,'corrected_by',v_actor,'corrected_at',v_now)) returning * into v_replacement;
  end if;
  insert into public.finance_correction_receipts(command_identity,owner_id,original_entry_id,effective_entry_id,correction_group_id,correction_kind,metadata_entry_id,reversal_entry_id,replacement_entry_id,reason,changed_fields,effective_record,created_at)
  values(p_correlation_id,v_actor,v_root.id,coalesce(v_replacement.id,v_effective.id),v_group,v_kind,v_metadata.id,v_reversal.id,v_replacement.id,p_reason,v_changed,v_corrected,v_now) returning * into v_receipt;
  return jsonb_build_object('idempotent',false,'correction_kind',v_kind,'correction_group_id',v_group,'metadata_entry_id',v_metadata.id,'reversal_entry_id',v_reversal.id,'replacement_entry_id',v_replacement.id,'effective_entry_id',v_receipt.effective_entry_id,'changed_fields',v_changed,'effective_record',v_corrected);
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_command_owned_financial_entry_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
begin

  if coalesce(old.finance_command_owned, false)

     or old.finance_command_id is not null
     or old.finance_command is not null

     or old.order_id is not null
     or old.order_number is not null

     or old.posted_by is not null
     or old.posted_at is not null

     or old.correction_of_entry_id is not null
     or old.reversal_of_entry_id is not null
     or old.replacement_for_entry_id is not null
     or old.correction_group_id is not null
     or old.correction_kind is not null

  then

    raise exception
      'Posted Finance entries are immutable; create an append-only correction instead.'
      using errcode = '55000';

  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;

  return old;

end
$function$
;

CREATE OR REPLACE FUNCTION public.create_manual_financial_entry(p_entry jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid:=auth.uid(); v_entry public.financial_entries%rowtype; v_type text; v_amount numeric; v_original numeric;
begin
  if v_actor is null then raise exception 'Authenticated Finance operator is required' using errcode='42501'; end if;
  if jsonb_typeof(p_entry)<>'object' then raise exception 'Manual Finance entry payload is required' using errcode='22023'; end if;
  v_type:=lower(btrim(coalesce(p_entry->>'type',''))); v_amount:=public.finance_adjustment_value(p_entry,'amount'); v_original:=public.finance_adjustment_value(p_entry,'original_amount');
  perform public.finance_adjustment_value(p_entry,k) from unnest(array['business_use_percent','miles_driven','mileage_rate','sales_tax_collected','shipping_charged','sales_tax_rate','shipping_cost','material_cost','packaging_cost','labor_cost','other_direct_cost']) k;
  if v_type not in ('income','expense') or v_amount<0 or v_original<0 or nullif(btrim(p_entry->>'title'),'') is null or nullif(btrim(p_entry->>'category'),'') is null then raise exception 'Manual Finance entry is invalid' using errcode='22023'; end if;
  insert into public.financial_entries(user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,vendor_name,payment_method,receipt_link,business_use_percent,miles_driven,mileage_rate,trip_purpose,trip_from,trip_to,round_trip,destination_county,sales_tax_collected,tax_exempt_sale,shipping_charged,tax_included,sales_tax_rate,shipping_cost,material_cost,packaging_cost,labor_cost,other_direct_cost)
  values(v_actor,v_type,(p_entry->>'entry_date')::date,p_entry->>'category',p_entry->>'tax_category',p_entry->>'title',coalesce(p_entry->>'notes',''),coalesce(v_amount,0),coalesce(v_original,0),coalesce(p_entry->>'vendor_name',''),coalesce(p_entry->>'payment_method',''),coalesce(p_entry->>'receipt_link',''),coalesce((p_entry->>'business_use_percent')::numeric,100),coalesce((p_entry->>'miles_driven')::numeric,0),coalesce((p_entry->>'mileage_rate')::numeric,0),coalesce(p_entry->>'trip_purpose',''),coalesce(p_entry->>'trip_from',''),coalesce(p_entry->>'trip_to',''),coalesce((p_entry->>'round_trip')::boolean,false),coalesce(p_entry->>'destination_county',''),coalesce((p_entry->>'sales_tax_collected')::numeric,0),coalesce((p_entry->>'tax_exempt_sale')::boolean,false),coalesce((p_entry->>'shipping_charged')::numeric,0),'no',coalesce((p_entry->>'sales_tax_rate')::numeric,0),coalesce((p_entry->>'shipping_cost')::numeric,0),coalesce((p_entry->>'material_cost')::numeric,0),coalesce((p_entry->>'packaging_cost')::numeric,0),coalesce((p_entry->>'labor_cost')::numeric,0),coalesce((p_entry->>'other_direct_cost')::numeric,0)) returning * into v_entry;
  return jsonb_build_object('entry_id',v_entry.id,'entry',to_jsonb(v_entry));
end $function$
;

CREATE OR REPLACE FUNCTION public.finance_adjustment_value(p_adjustments jsonb, p_key text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_value numeric;
  v_allowed_keys constant text[] := array[
    'amount','original_amount','sales_tax_rate','sales_tax_collected',
    'shipping_charged','shipping_cost','material_cost','packaging_cost',
    'labor_cost','other_direct_cost','business_use_percent','miles_driven',
    'mileage_rate'
  ];
begin
  if p_key is null or not (p_key = any(v_allowed_keys)) then
    raise exception 'Unknown Finance adjustment key: %', coalesce(p_key, '<null>')
      using errcode = '22023';
  end if;
  if not (p_adjustments ? p_key) then return 0; end if;
  if jsonb_typeof(p_adjustments -> p_key) <> 'number' then
    raise exception 'Finance adjustment % must be a JSON number', p_key
      using errcode = '22023';
  end if;
  v_value := (p_adjustments ->> p_key)::numeric;
  if v_value::text in ('NaN','Infinity','-Infinity') or abs(v_value) > 999999999.99 then
    raise exception 'Finance adjustment % must be finite and within range', p_key
      using errcode = '22003';
  end if;
  return round(v_value, 2);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_ohio_county(p_county text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 select btrim(coalesce(p_county,'')) = any(array['Adams','Allen','Ashland','Ashtabula','Athens','Auglaize','Belmont','Brown','Butler','Carroll','Champaign','Clark','Clermont','Clinton','Columbiana','Coshocton','Crawford','Cuyahoga','Darke','Defiance','Delaware','Erie','Fairfield','Fayette','Franklin','Fulton','Gallia','Geauga','Greene','Guernsey','Hamilton','Hancock','Hardin','Harrison','Henry','Highland','Hocking','Holmes','Huron','Jackson','Jefferson','Knox','Lake','Lawrence','Licking','Logan','Lorain','Lucas','Madison','Mahoning','Marion','Medina','Meigs','Mercer','Miami','Monroe','Montgomery','Morgan','Morrow','Muskingum','Noble','Ottawa','Paulding','Perry','Pickaway','Pike','Portage','Preble','Putnam','Richland','Ross','Sandusky','Scioto','Seneca','Shelby','Stark','Summit','Trumbull','Tuscarawas','Union','Van Wert','Vinton','Warren','Washington','Wayne','Williams','Wood','Wyandot']);
$function$
;

CREATE OR REPLACE FUNCTION public.get_order_invoice_snapshot_base(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_snapshot jsonb;
  v_revision public.order_pricing_revisions%rowtype;
  v_totals jsonb;
  v_version integer;
  v_source text;
  v_status text;
  v_final numeric;
  v_order_total numeric;
  v_balance numeric;
  v_amount_paid numeric;
  v_complete boolean := false;
  v_numeric_pattern constant text := '^-?[0-9]+([.][0-9]+)?$';
begin
  if v_actor is null then raise exception 'Authenticated owner is required' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id and user_id=v_actor;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;

  select s.snapshot into v_snapshot
    from public.quote_accepted_commercial_snapshots s
   where s.user_id=v_actor and (s.order_number=v_order.order_number or s.quote_number=v_order.source_quote_number)
   order by (s.order_number=v_order.order_number) desc limit 1;

  select * into v_revision from public.order_pricing_revisions
    where order_id=v_order.id and user_id=v_actor order by revision desc limit 1;
  if found then
    v_totals:=v_revision.totals; v_version:=1; v_source:='order_pricing_revision';
  elsif v_snapshot is null then
    v_status := 'missing_snapshot'; v_source := 'order_aggregates';
  elsif v_snapshot ? 'invoice_totals_schema_version' then
    if (v_snapshot->>'invoice_totals_schema_version') !~ '^[0-9]+$' or (v_snapshot->>'invoice_totals_schema_version')::integer <> 1 then
      v_status := 'unsupported_snapshot'; v_source := 'versioned_accepted_snapshot';
    else
      v_version := 1; v_totals := v_snapshot->'invoice_totals'; v_source := 'versioned_accepted_snapshot';
    end if;
  else
    v_totals := coalesce(v_snapshot #> '{offer,quote_data,customer_totals}', v_snapshot #> '{offer,customer_totals}');
    v_source := 'legacy_offer_quote_data_customer_totals';
  end if;

  if v_status is null then
    v_complete := jsonb_typeof(v_totals)='object' and v_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total'];
    if not v_complete then
      v_status := case when jsonb_typeof(v_totals)='object' then 'aggregate_only' else 'malformed_snapshot' end;
    elsif (v_totals->>'final_total') !~ v_numeric_pattern then
      v_status := 'malformed_snapshot';
    else
      v_final := round((v_totals->>'final_total')::numeric,2);
      v_order_total := case when v_order.order_total is null then null else round(v_order.order_total::numeric,2) end;
      v_status := case when v_order_total is null or v_final <> v_order_total then 'totals_mismatch' else 'verified' end;
    end if;
  end if;

  v_balance := v_order.balance_amount;
  v_amount_paid := public.current_order_amount_received(v_order.id);

  return jsonb_build_object(
    'pricing_revision',case when v_revision.id is null then null else jsonb_build_object('number',v_revision.revision,'reason',v_revision.reason,'created_at',v_revision.created_at) end,
    'shipping_deferred',coalesce((v_totals->>'shipping_deferred')::boolean,false),
    'credit_amount',greatest(0,v_amount_paid-v_order.order_total),
    'reconciliation_status',v_status,'breakdown_source',v_source,'invoice_totals_schema_version',v_version,
    'identity',jsonb_strip_nulls(jsonb_build_object(
      'order_id',v_order.id,'order_number',v_order.order_number,'invoice_number',v_order.invoice_number,
      'quote_number',v_order.source_quote_number,'customer_name',v_order.customer_name,'customer_email',v_order.customer_email,
      'company_name',v_order.shipping_company,'billing_address',v_order.billing_address,'shipping_address',v_order.shipping_address,
      'project_title',v_order.order_title,'fulfillment_method',v_order.fulfillment,'issue_date',v_order.invoice_date,
      'due_date',v_order.invoice_due_date,'tax_exempt',v_order.tax_exempt,'tracking_number',v_order.tracking_number)),
    'accepted_commercial_breakdown',case when v_complete then v_totals else null end,
    'current_payment_state',jsonb_build_object(
      'order_total',v_order.order_total,'deposit_amount',v_order.deposit_amount,'balance_amount',v_order.balance_amount,
      'payment_status',v_order.payment_status,'paid_date',v_order.paid_date,'invoice_number',v_order.invoice_number,
      'amount_paid',v_amount_paid,'amount_paid_source',case when v_amount_paid is null then null else 'derived_from_order_total_and_balance' end),
    'component_breakdown_available',v_status='verified'
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.get_quote_public(p_public_token text, p_quote_number text)
 RETURNS TABLE(quote_number text, quote_title text, quote_total numeric, quote_status text, quote_data jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    q.quote_number,
    q.quote_title,
    q.quote_total,
    q.quote_status,
    q.quote_data
  from public.quotes q
  where q.quote_number = p_quote_number
    and q.public_token = p_public_token
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_order_invoice_snapshot(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_result jsonb;
begin
  if v_actor is null then raise exception 'Authenticated owner is required' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id and user_id=v_actor;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  v_result:=public.get_order_invoice_snapshot_base(p_order_id);
  return v_result || jsonb_build_object('tax_metadata',jsonb_build_object(
    'destination_county',v_order.destination_county,
    'sales_tax_rate',coalesce(v_result#>'{accepted_commercial_breakdown,tax_rate}',to_jsonb(v_order.sales_tax_rate)),
    'taxable_subtotal',coalesce(v_result#>'{accepted_commercial_breakdown,taxable_subtotal}',to_jsonb(v_order.taxable_subtotal)),
    'sales_tax_collected',coalesce(v_result#>'{accepted_commercial_breakdown,tax}',to_jsonb(v_order.sales_tax_amount)),
    'tax_exempt',coalesce(v_order.tax_exempt,false),
    'tax_exempt_reason',v_order.tax_exempt_reason,
    'exemption_certificate_on_file',coalesce(v_order.exemption_certificate_on_file,false)));
end $function$
;

CREATE OR REPLACE FUNCTION public.fulfillment_workflow_command(p_order_number text, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb DEFAULT '{}'::jsonb, p_correlation_id text DEFAULT NULL::text, p_causation_id text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_order public.orders%rowtype;
  v_job public.production_jobs%rowtype;
  v_command text := lower(btrim(coalesce(p_command,'')));
  v_to text;
  v_event text;
  v_from text;
  v_command_id text := nullif(btrim(p_correlation_id),'');
begin
  if v_actor is null then raise exception 'Authentication is required for Fulfillment workflow commands' using errcode='28000'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_command_id, 0));

  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found or v_order.user_id is distinct from v_actor then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  if v_command = 'close_order' then
    v_to := 'closed'; v_event := 'order.closed';
  else
    raise exception 'Invalid Fulfillment workflow command: %', p_command using errcode='22023';
  end if;

  if exists (
    select 1 from public.project_events
     where correlation_id = v_command_id
       and event_type = v_event
       and user_id = v_actor
       and aggregate_type = 'order'
       and aggregate_id = v_order.id::text
       and payload->>'command' = v_command
  ) then
    return v_order;
  end if;
  if exists (select 1 from public.project_events where correlation_id = v_command_id and not (event_type = v_event and user_id = v_actor and aggregate_type = 'order' and aggregate_id = v_order.id::text and payload->>'command' = v_command)) then
    raise exception 'Command identity is already used for a different workflow command' using errcode='23505';
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order workflow changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  v_from := v_order.status;

  select * into v_job from public.production_jobs where user_id=v_actor and order_number=v_order.order_number limit 1 for update;
  if not found then raise exception 'Linked Production job not found for %', p_order_number using errcode='P0002'; end if;
  if v_order.status <> 'ready_for_fulfillment' or v_job.production_status <> 'ready_for_fulfillment' then raise exception 'Close requires ready_for_fulfillment' using errcode='22023'; end if;
  if coalesce(p_payload->>'fulfillment_confirmed_at','') = '' or coalesce(p_payload->>'fulfillment_method','') = '' then raise exception 'Fulfillment confirmation requires fulfillment_confirmed_at and fulfillment_method' using errcode='22023'; end if;

  update public.orders set status=v_to, updated_at=v_now where id=v_order.id and user_id=v_actor returning * into v_order;
  if not found then raise exception 'Order workflow update affected no rows' using errcode='40001'; end if;
  update public.production_jobs set production_status=v_to, updated_at=v_now where id=v_job.id and user_id=v_actor returning * into v_job;
  if not found then raise exception 'Production fulfillment projection affected no rows' using errcode='40001'; end if;
  update public.order_tracking_public set status=v_to, public_status_text=public.workflow_public_status_text(v_to), public_next_step=public.workflow_public_next_step(v_to), updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
  if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;

  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,v_event,jsonb_build_object('from',v_from,'to',v_to),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_command_id,p_causation_id,1,jsonb_build_object('command',v_command,'from',v_from,'status',v_to,'occurred_at',v_now,'fulfillment_confirmation',coalesce(p_payload,'{}'::jsonb)))
  on conflict (correlation_id, event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;
  return v_order;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.capture_accepted_order_tax_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_snapshot jsonb; v_totals jsonb; v_county text; v_rate numeric; v_taxable numeric; v_tax numeric;
begin
  if nullif(btrim(coalesce(new.source_quote_number,'')),'') is null then return new; end if;
  select snapshot into v_snapshot from public.quote_accepted_commercial_snapshots
   where user_id=new.user_id and (order_number=new.order_number or quote_number=new.source_quote_number)
   order by (order_number=new.order_number) desc limit 1;
  v_totals:=coalesce(v_snapshot->'invoice_totals',v_snapshot#>'{offer,quote_data,customer_totals}',v_snapshot#>'{offer,customer_totals}');
  if jsonb_typeof(v_totals)<>'object' then return new; end if;
  v_county:=nullif(btrim(coalesce(v_totals->>'destination_county',v_snapshot#>>'{offer,fields,taxCounty}',v_snapshot#>>'{offer,quote_data,fields,taxCounty}')),'');
  v_rate:=case when v_totals ? 'tax_rate' then (v_totals->>'tax_rate')::numeric end;
  v_taxable:=case when v_totals ? 'taxable_subtotal' then (v_totals->>'taxable_subtotal')::numeric end;
  v_tax:=case when v_totals ? 'tax' then (v_totals->>'tax')::numeric end;
  if v_county is not null and not public.is_ohio_county(v_county) then raise exception 'Accepted destination county is invalid' using errcode='22023'; end if;
  new.destination_county:=coalesce(new.destination_county,v_county);
  new.sales_tax_rate:=coalesce(new.sales_tax_rate,v_rate);
  new.taxable_subtotal:=coalesce(new.taxable_subtotal,v_taxable);
  new.sales_tax_amount:=coalesce(new.sales_tax_amount,v_tax);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.respond_to_quote_public(p_public_token text, p_quote_number text, p_response text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_tracking_owner uuid;
  v_quote_accepted_order_number text;
  v_order_created_order_number text;
  v_response text := lower(btrim(coalesce(p_response,'')));
  v_order_number text;
  v_now timestamptz := now();
  v_snapshot jsonb;
  v_snapshot_id uuid;
  v_existing_snapshot public.quote_accepted_commercial_snapshots%rowtype;
  v_correlation text := gen_random_uuid()::text;
  v_quote_accepted_event_id uuid := gen_random_uuid();
  v_quantity integer;
  v_raw_quantity numeric;
  v_order_total numeric;
  v_deposit_amount numeric;
  v_balance_amount numeric;
  v_payment_status text;
  v_order_title text;
  v_raw_fulfillment text;
  v_fulfillment text;
  v_customer_phone text;
begin
  if v_response in ('accept','approved','approve') then v_response := 'accepted'; end if;
  if v_response in ('declined','decline','rejected','reject','change_requested','change-requested','changes','request_changes','requested_changes') then v_response := 'change_requested'; end if;
  if v_response not in ('accepted','change_requested') then raise exception 'Invalid quote response' using errcode = '22023'; end if;

  select * into v_quote
    from public.quotes
   where quote_number = p_quote_number
     and public_token = p_public_token
   for update;
  if not found then raise exception 'Quote response link is invalid or expired' using errcode = 'P0002'; end if;

  if v_quote.quote_number !~ '^Q-[0-9]{6}$' then
    raise exception 'Invalid Quote number format for acceptance: %', v_quote.quote_number using errcode = '22023';
  end if;

  if coalesce(v_quote.customer_response,'') = 'accepted' or v_quote.converted_to_order is true then
    if v_response <> 'accepted' then
      raise exception 'Accepted quotes cannot be changed through the public response RPC' using errcode = '25006';
    end if;
    select * into v_order from public.orders where source_quote_number = v_quote.quote_number and user_id = v_quote.user_id for update;
    if not found then select * into v_order from public.orders where order_number = v_quote.converted_order_number and user_id = v_quote.user_id for update; end if;
    if v_order.id is null then
      raise exception 'Accepted Quote is missing its Order evidence for %', v_quote.quote_number using errcode = '23514';
    end if;
    if v_order.user_id is distinct from v_quote.user_id or nullif(v_order.source_quote_number,'') is distinct from v_quote.quote_number then
      raise exception 'Accepted Quote Order evidence is inconsistent for %', v_quote.quote_number using errcode = '23514';
    end if;
    select * into v_existing_snapshot from public.quote_accepted_commercial_snapshots where quote_number = v_quote.quote_number;
    if v_existing_snapshot.id is null
       or v_existing_snapshot.user_id is distinct from v_quote.user_id
       or v_existing_snapshot.quote_number is distinct from v_quote.quote_number
       or v_existing_snapshot.order_number is distinct from v_order.order_number then
      raise exception 'Accepted Quote snapshot evidence is inconsistent for %', v_quote.quote_number using errcode = '23514';
    end if;
    select user_id into v_tracking_owner from public.order_tracking_public where order_number = v_order.order_number for update;
    if not found or v_tracking_owner is distinct from v_quote.user_id then
      raise exception 'Accepted Quote tracking evidence is inconsistent for %', v_quote.quote_number using errcode = '23514';
    end if;
    select order_number into v_quote_accepted_order_number from public.project_events where user_id = v_quote.user_id and quote_number = v_quote.quote_number and event_type = 'quote.accepted';
    select order_number into v_order_created_order_number from public.project_events where user_id = v_quote.user_id and quote_number = v_quote.quote_number and event_type = 'order.created';
    if v_quote_accepted_order_number is distinct from v_order.order_number
       or v_order_created_order_number is distinct from v_order.order_number then
      raise exception 'Accepted Quote event evidence is inconsistent for %', v_quote.quote_number using errcode = '23514';
    end if;
    return jsonb_build_object('response','accepted','status','accepted','order_number',v_order.order_number);
  end if;

  if v_response = 'change_requested' then
    update public.quotes
       set customer_response = 'change_requested', customer_response_message = p_message, quote_status = 'change_requested', updated_at = v_now
     where id = v_quote.id and coalesce(customer_response,'') <> 'change_requested';
    insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
    values(gen_random_uuid(),v_quote.user_id,v_quote.quote_number,null,'quote.change_requested',jsonb_build_object('quote_number',v_quote.quote_number,'message',p_message),v_now,v_now,'quote',v_quote.quote_number,'public_customer',null,v_correlation,null,1,jsonb_build_object('response','change_requested'))
    on conflict (user_id, quote_number, event_type) where event_type = 'quote.change_requested' do nothing;
    return jsonb_build_object('response','change_requested','status','recorded');
  end if;

  select * into v_order
    from public.orders
   where source_quote_number = v_quote.quote_number
   for update;
  if found and v_order.user_id is distinct from v_quote.user_id then
    raise exception 'Quote Order ownership collision for %', v_quote.quote_number using errcode = '23505';
  end if;

  v_raw_quantity := coalesce(nullif(v_quote.quote_data #>> '{fields,qty}','')::numeric, 1);
  if v_raw_quantity::text in ('NaN', 'Infinity', '-Infinity') or v_raw_quantity <= 0 or v_raw_quantity <> trunc(v_raw_quantity) then
    raise exception 'Quote quantity must be a positive whole number for %', v_quote.quote_number using errcode = '22023';
  end if;
  v_quantity := v_raw_quantity::integer;

  v_order_total := v_quote.quote_total;
  -- Blueprint v1 permits an intentional exact zero-dollar accepted Quote for approved no-charge/warranty work; NULL, negative, or non-finite totals are invalid.
  if v_order_total is null or v_order_total::text in ('NaN', 'Infinity', '-Infinity') or v_order_total < 0 then
    raise exception 'Quote total must be a finite nonnegative amount for %', v_quote.quote_number using errcode = '22023';
  end if;

  v_deposit_amount := coalesce(nullif(v_quote.quote_data #>> '{fields,depositAmount}','')::numeric, 0);
  if v_deposit_amount::text in ('NaN', 'Infinity', '-Infinity') or v_deposit_amount < 0 or v_deposit_amount > v_order_total then
    raise exception 'Quote deposit must be nonnegative and cannot exceed total for %', v_quote.quote_number using errcode = '22023';
  end if;
  v_balance_amount := v_order_total - v_deposit_amount;
  v_payment_status := case when v_deposit_amount > 0 then 'deposit_due' else 'unpaid' end;
  v_order_title := coalesce(nullif(btrim(v_quote.quote_title),''), nullif(btrim(v_quote.customer_name),''), 'Accepted Quote');
  -- Quote contact metadata is authoritative in quote_data.fields; legacy production drafts are fallback-only.
  v_customer_phone := nullif(btrim(coalesce(
    v_quote.quote_data #>> '{fields,customerPhone}',
    v_quote.quote_data #>> '{fields,customer_phone}',
    v_quote.quote_data #>> '{production_draft,customer_phone}',
    v_quote.quote_data #>> '{production_draft,phone}',
    ''
  )), '');
  if lower(coalesce(v_customer_phone,'')) in ('n/a','na','none','not available','not provided','unknown','-','—') then
    v_customer_phone := null;
  end if;
  v_raw_fulfillment := lower(btrim(coalesce(nullif(v_quote.quote_data #>> '{fields,fulfillment}',''), nullif(v_quote.quote_data #>> '{fields,deliveryMethod}',''), '')));
  v_fulfillment := case
    when v_raw_fulfillment in ('','pickup','pick up','pick-up','customer pickup','local pickup','in-store pickup') then 'pickup'
    when v_raw_fulfillment in ('delivery','deliver','local delivery','dropoff','drop-off','drop off') then 'delivery'
    when v_raw_fulfillment in ('shipping','ship','shipped','shipment','mail','mailing','usps','ups','fedex') then 'shipping'
    else 'pickup'
  end;

  if v_order.id is null then
    v_order_number := public.allocate_order_number();
  else
    v_order_number := v_order.order_number;
  end if;

  select id into v_snapshot_id from public.quote_accepted_commercial_snapshots where quote_number = v_quote.quote_number;
  if not found then
    v_snapshot := jsonb_build_object(
      'quote_number', v_quote.quote_number,
      'order_number', v_order_number,
      'accepted_at', v_now,
      'customer', jsonb_build_object('name', v_quote.customer_name, 'email', v_quote.customer_email, 'phone', v_customer_phone),
      'offer', coalesce(v_quote.quote_data,'{}'::jsonb),
      'totals', jsonb_build_object('order_total', v_order_total, 'deposit_amount', v_deposit_amount, 'balance_amount', v_balance_amount, 'quantity', v_quantity),
      'terms', jsonb_build_object('message', p_message, 'fulfillment', v_fulfillment, 'raw_fulfillment', v_raw_fulfillment, 'payment_status', v_payment_status)
    );
    insert into public.quote_accepted_commercial_snapshots(user_id, quote_number, order_number, accepted_at, snapshot)
    values (v_quote.user_id, v_quote.quote_number, v_order_number, v_now, v_snapshot)
    returning id into v_snapshot_id;
  end if;

  if v_order.id is null then
    insert into public.orders(user_id, order_number, source_quote_number, source_type, created_from_quote, accepted_date, status, quantity, order_total, deposit_amount, balance_amount, payment_status, fulfillment, customer_name, customer_email, customer_phone, order_title, created_at, updated_at)
    values (v_quote.user_id, v_order_number, v_quote.quote_number, 'quote', true, v_now, 'ready_to_print', v_quantity, v_order_total, v_deposit_amount, v_balance_amount, v_payment_status, v_fulfillment, v_quote.customer_name, v_quote.customer_email, v_customer_phone, v_order_title, v_now, v_now)
    on conflict (source_quote_number) where nullif(btrim(source_quote_number),'') is not null do nothing;
    select * into v_order from public.orders where source_quote_number = v_quote.quote_number and user_id = v_quote.user_id for update;
    if not found then raise exception 'Order creation failed for accepted quote %', v_quote.quote_number using errcode = '40001'; end if;
  end if;

  update public.quotes
     set customer_response = 'accepted', customer_response_message = coalesce(customer_response_message, p_message), quote_status = 'converted_to_order', converted_to_order = true, converted_order_number = v_order.order_number, accepted_date = coalesce(accepted_date, v_now), accepted_at = coalesce(accepted_at, v_now), accepted_commercial_snapshot_id = coalesce(accepted_commercial_snapshot_id, v_snapshot_id), accepted_commercial_snapshot = coalesce(accepted_commercial_snapshot, (select snapshot from public.quote_accepted_commercial_snapshots where id = v_snapshot_id)), updated_at = v_now
   where id = v_quote.id;

  update public.production_jobs
     set production_status = 'ready_to_print', order_number = v_order.order_number, quote_number = coalesce(quote_number, v_quote.quote_number), updated_at = v_now
   where user_id = v_quote.user_id
     and quote_number = v_quote.quote_number
     and coalesce(production_status,'') in ('waiting_customer','quote_sent','quote_accepted','awaiting_approval','waiting_for_customer')
     and coalesce(production_status,'') not in ('printing','qc','ready_for_fulfillment','closed','canceled')
     and coalesce((job_payload->>'actual_usage_captured')::boolean, false) is false;

  select user_id into v_tracking_owner from public.order_tracking_public where order_number = v_order.order_number for update;
  if found and v_tracking_owner is distinct from v_quote.user_id then
    raise exception 'Tracking ownership collision for %', v_order.order_number using errcode = '23505';
  end if;
  insert into public.order_tracking_public(user_id, order_number, order_title, order_total, payment_status, status, public_status_text, public_next_step, updated_at)
  values(v_quote.user_id, v_order.order_number, v_order_title, v_order_total, v_payment_status, 'ready_to_print', 'Your order is approved and ready for production.', 'Printing will begin when the assigned machine is available.', v_now)
  on conflict (order_number) do nothing;

  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(v_quote_accepted_event_id,v_quote.user_id,v_quote.quote_number,v_order.order_number,'quote.accepted',jsonb_build_object('quote_number',v_quote.quote_number,'order_number',v_order.order_number),v_now,v_now,'quote',v_quote.quote_number,'public_customer',null,v_correlation,null,1,jsonb_build_object('response','accepted'))
  on conflict (user_id, quote_number, event_type) where event_type in ('quote.accepted','order.created') do nothing;
  select event_id into v_quote_accepted_event_id from public.project_events where user_id = v_quote.user_id and quote_number = v_quote.quote_number and event_type = 'quote.accepted';
  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_quote.user_id,v_quote.quote_number,v_order.order_number,'order.created',jsonb_build_object('quote_number',v_quote.quote_number,'order_number',v_order.order_number),v_now,v_now,'order',v_order.order_number,'public_customer',null,v_correlation,v_quote_accepted_event_id::text,1,jsonb_build_object('source_quote_number',v_quote.quote_number))
  on conflict (user_id, quote_number, event_type) where event_type in ('quote.accepted','order.created') do nothing;

  return jsonb_build_object('response','accepted','status','accepted','order_number',v_order.order_number);
exception when others then
  raise; -- PostgreSQL rolls back every required acceptance write in this function transaction.
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_order_tax_metadata_to_finance_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_order public.orders%rowtype; v_snapshot jsonb; v_totals jsonb; v_rate numeric; v_taxable numeric; v_tax numeric; v_county text;
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;
  select * into v_order from public.orders where id=new.order_id and user_id=new.user_id;
  v_totals:=public.current_order_commercial_totals(new.order_id);
  if jsonb_typeof(v_totals) is distinct from 'object' then raise exception 'FINANCE_INVOICE_TOTALS_UNRESOLVED: authoritative invoice totals are unavailable' using errcode='22023'; end if;
  v_rate:=coalesce((v_totals->>'tax_rate')::numeric,v_order.sales_tax_rate);
  v_taxable:=coalesce((v_totals->>'taxable_subtotal')::numeric,v_order.taxable_subtotal);
  v_tax:=coalesce((v_totals->>'tax')::numeric,v_order.sales_tax_amount);
  v_county:=nullif(btrim(v_order.destination_county),'');
  if v_rate is null or v_rate<0 or v_rate>20 or v_taxable is null or v_taxable<0 or v_tax is null or v_tax<0 then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: authoritative taxable subtotal, rate, or tax is invalid' using errcode='22023'; end if;
  if coalesce(v_order.tax_exempt,false) and (v_rate<>0 or v_tax<>0 or nullif(btrim(coalesce(v_order.tax_exempt_reason,'')),'') is null) then raise exception 'FINANCE_TAX_METADATA_CONTRADICTORY: tax exemption metadata is incomplete or contradictory' using errcode='22023'; end if;
  if not coalesce(v_order.tax_exempt,false) and v_tax>0 and v_county is null then raise exception 'FINANCE_TAX_COUNTY_REQUIRED: Select the destination county before posting this taxable order to Finance' using errcode='22023'; end if;
  if v_county is not null and not public.is_ohio_county(v_county) then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: destination county is invalid' using errcode='22023'; end if;
  if not coalesce(v_order.tax_exempt,false) and round(v_taxable*v_rate/100,2) is distinct from round(v_tax,2) then raise exception 'FINANCE_TAX_METADATA_UNRESOLVED: taxable subtotal, rate, and collected tax do not reconcile' using errcode='22023'; end if;
  new.sales_county:=v_county;
  new.sales_tax_rate:=v_rate;
  new.sales_tax_collected:=v_tax;
  new.tax_exempt_sale:=coalesce(v_order.tax_exempt,false);
  -- Revenue excludes separately reported shipping; tax base includes it only
  -- when the new customer-pricing contract explicitly says so.
  new.amount:=v_taxable-case when v_totals->>'shipping_in_taxable_subtotal'='true' then coalesce((v_totals->>'shipping_charged')::numeric,0) else 0 end;
  new.original_amount:=new.amount;
  new.accepted_commercial_snapshot:=coalesce(new.accepted_commercial_snapshot,'{}'::jsonb)||jsonb_build_object(
    'destination_county',v_county,'sales_county',v_county,'sales_tax_rate',v_rate,
    'taxable_subtotal',v_taxable,'sales_tax_collected',v_tax,
    'tax_exempt',coalesce(v_order.tax_exempt,false),'tax_exempt_reason',v_order.tax_exempt_reason,
    'exemption_certificate_on_file',coalesce(v_order.exemption_certificate_on_file,false),'tax_metadata_status','verified');
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.normalize_order_customer_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
begin
  new.customer_phone := nullif(btrim(new.customer_phone), '');
  if lower(coalesce(new.customer_phone, '')) in
     ('n/a', 'na', 'none', 'not available', 'not provided', 'unknown', '-', '—') then
    new.customer_phone := null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_manual_financial_entry(p_entry_id uuid, p_entry jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_entry public.financial_entries%rowtype;
  v_type text;
  v_amount numeric;
  v_original numeric;
begin
  if v_actor is null then raise exception 'Authenticated Finance operator is required' using errcode = '42501'; end if;
  if p_entry_id is null or jsonb_typeof(p_entry) <> 'object' then raise exception 'Manual Finance entry payload is required' using errcode = '22023'; end if;
  v_type := lower(btrim(coalesce(p_entry->>'type', '')));
  v_amount := public.finance_adjustment_value(p_entry, 'amount');
  v_original := public.finance_adjustment_value(p_entry, 'original_amount');
  perform public.finance_adjustment_value(p_entry, k) from unnest(array['business_use_percent','miles_driven','mileage_rate','sales_tax_collected','shipping_charged','sales_tax_rate','shipping_cost','material_cost','packaging_cost','labor_cost','other_direct_cost']) k;
  if v_type not in ('income','expense') or v_amount < 0 or v_original < 0 or nullif(btrim(p_entry->>'title'),'') is null or nullif(btrim(p_entry->>'category'),'') is null then raise exception 'Manual Finance entry is invalid' using errcode = '22023'; end if;
  update public.financial_entries set
    type=v_type, entry_date=(p_entry->>'entry_date')::date, category=p_entry->>'category', tax_category=p_entry->>'tax_category', title=p_entry->>'title', notes=coalesce(p_entry->>'notes',''), amount=coalesce(v_amount,0), original_amount=coalesce(v_original,0), vendor_name=coalesce(p_entry->>'vendor_name',''), payment_method=coalesce(p_entry->>'payment_method',''), receipt_link=coalesce(p_entry->>'receipt_link',''), business_use_percent=coalesce((p_entry->>'business_use_percent')::numeric,100), miles_driven=coalesce((p_entry->>'miles_driven')::numeric,0), mileage_rate=coalesce((p_entry->>'mileage_rate')::numeric,0), trip_purpose=coalesce(p_entry->>'trip_purpose',''), trip_from=coalesce(p_entry->>'trip_from',''), trip_to=coalesce(p_entry->>'trip_to',''), round_trip=coalesce((p_entry->>'round_trip')::boolean,false), destination_county=coalesce(p_entry->>'destination_county',''), sales_tax_collected=coalesce((p_entry->>'sales_tax_collected')::numeric,0), tax_exempt_sale=coalesce((p_entry->>'tax_exempt_sale')::boolean,false), shipping_charged=coalesce((p_entry->>'shipping_charged')::numeric,0), tax_included='no', sales_tax_rate=coalesce((p_entry->>'sales_tax_rate')::numeric,0), shipping_cost=coalesce((p_entry->>'shipping_cost')::numeric,0), material_cost=coalesce((p_entry->>'material_cost')::numeric,0), packaging_cost=coalesce((p_entry->>'packaging_cost')::numeric,0), labor_cost=coalesce((p_entry->>'labor_cost')::numeric,0), other_direct_cost=coalesce((p_entry->>'other_direct_cost')::numeric,0)
  where id=p_entry_id and user_id=v_actor and not coalesce(finance_command_owned,false) and finance_command_id is null and finance_command is null and order_id is null and order_number is null and posted_by is null and posted_at is null and correction_of_entry_id is null and reversal_of_entry_id is null and replacement_for_entry_id is null and correction_group_id is null and correction_kind is null
  returning * into v_entry;
  if not found then raise exception 'Manual Finance entry was not found or is not editable' using errcode='42501'; end if;
  return jsonb_build_object('entry_id',v_entry.id,'entry',to_jsonb(v_entry));
end
$function$
;

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin new.updated_at:=now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_production_attempt(p_production_job_id uuid, p_attempt_id text, p_correlation_id text, p_expected_updated_at timestamp with time zone, p_roll_usages jsonb, p_workflow_command text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.production_jobs%rowtype;
  v_order public.orders%rowtype;
  v_reservation public.production_material_reservations%rowtype;
  v_roll public.raw_material_inventory%rowtype;
  v_attempt jsonb;
  v_attempts jsonb;
  v_command text := lower(btrim(coalesce(p_workflow_command,'')));
  v_key text := nullif(btrim(coalesce(p_correlation_id,'')),'');
  v_target text;
  v_event text;
  v_usage record;
  v_total numeric := 0;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_receipt public.production_attempt_consumption_receipts%rowtype;
  v_tx record;
  v_is_standalone boolean := false;
begin
  perform set_config('lock_timeout','2000ms',true);
  if v_actor is null then raise exception 'Authentication is required for Inventory consumption' using errcode='28000'; end if;
  if p_production_job_id is null or nullif(btrim(coalesce(p_attempt_id,'')),'') is null or v_key is null or p_expected_updated_at is null then
    raise exception 'Production job, attempt identity, command identity, and expected_updated_at are required' using errcode='22004';
  end if;
  if v_command not in ('pass_qc','needs_reprint') then
    raise exception 'Inventory consumption is only permitted at QC Pass or Needs Reprint command boundaries' using errcode='22023';
  end if;
  v_target := case v_command when 'pass_qc' then 'ready_for_fulfillment' else 'ready_to_print' end;
  v_event := case v_command when 'pass_qc' then 'order.qc_passed' else 'order.needs_reprint' end;

  if not pg_try_advisory_xact_lock(hashtextextended('inventory-consumption:'||v_key,0)) then
    raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=command';
  end if;
  select * into v_receipt from public.production_attempt_consumption_receipts where command_identity=v_key;
  if found then
    if v_receipt.owner_id is distinct from v_actor or v_receipt.production_job_id is distinct from p_production_job_id or v_receipt.attempt_id is distinct from p_attempt_id then
      raise exception 'Command identity is already used for another attempt' using errcode='23505';
    end if;
    return v_receipt.result_snapshot || jsonb_build_object('idempotent',true);
  end if;
  if exists(select 1 from public.production_attempt_consumption_receipts where owner_id=v_actor and production_job_id=p_production_job_id and attempt_id=p_attempt_id) then
    raise exception 'Attempt identity is already consumed by another command identity' using errcode='23505';
  end if;

  -- Read identity without locking, then use the same Order -> Production lock
  -- order as production_workflow_command. NOWAIT plus lock_timeout prevents a
  -- browser request from waiting behind an unrelated operator transaction.
  select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor;
  if not found then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  -- Modern linked jobs normally have a NULL source type. Keep this boolean
  -- non-null so both QC validation and Order/tracker projection always run.
  v_is_standalone := v_job.production_source_type is not distinct from 'legacy_standalone';
  begin
    if v_is_standalone then
      if v_job.order_number is not null then raise exception 'Standalone Production cannot contain Order identity' using errcode='23514'; end if;
      select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update nowait;
    else
      if v_job.order_number is null then raise exception 'Accepted linked Order not found for modern Production job' using errcode='23514'; end if;
      select * into v_order from public.orders where user_id=v_actor and order_number=v_job.order_number for update nowait;
      if not found then raise exception 'Accepted linked Order not found for modern Production job' using errcode='23514'; end if;
      select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update nowait;
      if v_order.source_quote_number is distinct from coalesce(v_job.quote_number,nullif(v_job.job_payload->>'quote_number',''))
         or nullif(v_job.job_payload->>'order_number','') is not null and v_job.job_payload->>'order_number' is distinct from v_order.order_number
         or nullif(v_job.job_payload->>'order_id','') is not null and v_job.job_payload->>'order_id' is distinct from v_order.id::text then
        raise exception 'Modern Production Quote/Order provenance mismatch' using errcode='23514';
      end if;
    end if;
  exception when lock_not_available then
    raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=order_production';
  end;
  if v_job.updated_at is distinct from p_expected_updated_at then
    raise exception 'This Production job changed after the page loaded. Refresh before retrying.' using errcode='PT409',detail='appCode=40001 conflictScope=production_row';
  end if;
  if v_job.production_status <> 'qc' or (not v_is_standalone and v_order.status <> 'qc') then raise exception 'QC command requires qc' using errcode='22023'; end if;

  select elem into v_attempt from jsonb_array_elements(coalesce(v_job.job_payload->'production_attempts','[]'::jsonb)) elem
   where elem->>'id'=p_attempt_id order by elem->>'captured_at' desc nulls last limit 1;
  if v_attempt is null and coalesce(v_job.job_payload->'last_completed_attempt'->>'id','')=p_attempt_id then v_attempt:=v_job.job_payload->'last_completed_attempt'; end if;
  if v_attempt is null then raise exception 'Authoritative Production attempt evidence was not found' using errcode='23514'; end if;

  if coalesce(v_job.exclude_inventory_reduction,false) then
    v_result:=jsonb_build_object('production_job_id',p_production_job_id,'attempt_id',p_attempt_id,'correlation_id',v_key,'idempotent',false,'inventory_mode','excluded','inventory_skipped',true,'rolls','[]'::jsonb);
  else
    if jsonb_typeof(p_roll_usages)<>'array' or jsonb_array_length(p_roll_usages)=0 then raise exception 'Record actual material usage before passing QC.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_roll_usages) u where nullif(u->>'raw_material_roll_id','') is null or coalesce(u->>'grams_used','') !~ '^[0-9]+(\.[0-9]+)?$' or (u->>'grams_used')::numeric<=0) then raise exception 'Every roll usage requires a roll and positive finite grams' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_roll_usages) u group by u->>'raw_material_roll_id' having count(*)>1) then raise exception 'Duplicate roll usage lines are not allowed' using errcode='23505'; end if;

    for v_usage in select (u->>'raw_material_roll_id')::uuid roll_id,(u->>'grams_used')::numeric grams from jsonb_array_elements(p_roll_usages) u order by 1 loop
      begin
        select * into v_reservation from public.production_material_reservations
         where user_id=v_actor and production_job_id=p_production_job_id and raw_material_roll_id=v_usage.roll_id and status='active'
         for update nowait;
        select * into v_roll from public.raw_material_inventory
         where id=v_usage.roll_id and user_id=v_actor for update nowait;
      exception when lock_not_available then
        raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=reservation_roll';
      end;
      if v_reservation.id is null or v_roll.id is null or v_reservation.reserved_grams < v_usage.grams or v_roll.remaining_grams < v_usage.grams then
        raise exception 'Applicable active reservation is missing, cross-owner, or has insufficient available material' using errcode='23514';
      end if;
      update public.raw_material_inventory
         set remaining_grams=remaining_grams-v_usage.grams,
             reserved_grams=greatest(coalesce(reserved_grams,0)-v_reservation.reserved_grams,0), updated_at=v_now
       where id=v_roll.id and user_id=v_actor;
      update public.production_material_reservations
         set status='consumed',consume_command_id=v_key,attempt_id=p_attempt_id,consumed_at=v_now,updated_at=v_now
       where id=v_reservation.id and user_id=v_actor;
      insert into public.inventory_transactions(id,user_id,created_at,occurred_at,transaction_type,type,production_job_id,attempt_id,correlation_id,raw_material_id,quantity_grams,order_number,quote_number,note)
      values(gen_random_uuid(),v_actor,v_now,v_now,'production_attempt_consumption','raw_usage',p_production_job_id,p_attempt_id,v_key,v_roll.id,-v_usage.grams,v_job.order_number,v_job.quote_number,'Authoritative Production attempt material consumption')
      returning id,raw_material_id,quantity_grams into v_tx;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('raw_material_id',v_tx.raw_material_id,'quantity_grams',v_tx.quantity_grams,'transaction_id',v_tx.id));
      v_total:=v_total+v_usage.grams;
    end loop;
    v_result:=jsonb_build_object('production_job_id',p_production_job_id,'attempt_id',p_attempt_id,'correlation_id',v_key,'idempotent',false,'inventory_mode','included','total_grams',v_total,'rolls',v_results);
  end if;

  select coalesce(jsonb_agg(case when elem->>'id'=p_attempt_id then elem||jsonb_build_object('consumed_at',v_now,'consumption_correlation_id',v_key) else elem end),'[]'::jsonb)
    into v_attempts from jsonb_array_elements(coalesce(v_job.job_payload->'production_attempts','[]'::jsonb)) elem;
  update public.production_jobs
     set production_status=v_target,
         job_payload=coalesce(job_payload,'{}'::jsonb)||jsonb_build_object('production_status',v_target,'updated_at',v_now,'production_attempts',v_attempts,'last_completed_attempt',v_attempt||jsonb_build_object('consumed_at',v_now,'consumption_correlation_id',v_key)),
         updated_at=v_now
   where id=v_job.id and user_id=v_actor returning * into v_job;
  if not v_is_standalone then
    update public.orders set status=v_target,updated_at=v_now where id=v_order.id and user_id=v_actor returning * into v_order;
    if not found then raise exception 'Order workflow projection affected no rows' using errcode='40001'; end if;
    update public.order_tracking_public set status=v_target,public_status_text=public.workflow_public_status_text(v_target),public_next_step=public.workflow_public_next_step(v_target),updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
    if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;
    insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
    values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,v_event,jsonb_build_object('from','qc','to',v_target),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_key,null,1,jsonb_build_object('command',v_command,'from','qc','status',v_target,'production_job_id',v_job.id))
    on conflict (correlation_id,event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;
  end if;

  v_result:=v_result||jsonb_build_object('production_job',to_jsonb(v_job),'record_class',case when v_is_standalone then 'LEGACY_STANDALONE' else 'MODERN_LINKED' end,'order_status',case when v_is_standalone then null else v_order.status end,'lifecycle_completed',true);
  insert into public.production_attempt_consumption_receipts(command_identity,owner_id,production_job_id,attempt_id,inventory_mode,result_snapshot,created_at)
  values(v_key,v_actor,p_production_job_id,p_attempt_id,v_result->>'inventory_mode',v_result,v_now);
  return v_result;
exception when lock_not_available then
  raise exception 'Inventory is busy. No material or QC status was changed.' using errcode='55P03',detail='appCode=INVENTORY_BUSY lockScope=bounded_statement';
end; $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_order_tracking_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_order_metadata(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS SETOF orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_allowed constant text[] := array[
    'order_date','customer_name','customer_email','customer_phone','order_title',
    'fulfillment','tracking_number','po_number','tax_exempt','tax_exempt_reason',
    'destination_county','sales_tax_rate','exemption_certificate_on_file',
    'po_file_on_file','po_part_number','shipping_contact_name','shipping_company',
    'ap_email','billing_address','shipping_address','shipping_or_pickup_note',
    'invoice_date','invoice_due_date','invoice_terms','olipoly_part_number',
    'part_revision','internal_notes'
  ];
  v_rejected text[];
begin
  if v_actor is null then
    raise exception 'Authenticated order owner is required'
      using errcode = '42501', detail = 'update_order_metadata requires auth.uid()', hint = 'Sign in and retry.';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Order metadata changes must be a JSON object' using errcode = '22023';
  end if;

  select array_agg(key order by key) into v_rejected
  from jsonb_object_keys(p_changes) as key
  where not (key = any(v_allowed));
  if v_rejected is not null then
    raise exception 'Protected order fields cannot be changed through normal Save'
      using errcode = '22023', detail = 'Rejected keys: ' || array_to_string(v_rejected, ', '), hint = 'Use the owning lifecycle, payment, invoice, or Finance command.';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and user_id = v_actor for update;
  if not found then
    raise exception 'Order not found for authenticated owner'
      using errcode = '42501', detail = 'The order ID is not owned by auth.uid().', hint = 'Do not retry this request.';
  end if;
  if lower(coalesce(v_order.status, '')) in ('closed','fulfilled','cancelled','canceled') then
    raise exception 'This order is closed and cannot be edited'
      using errcode = '55000', detail = 'Closed, fulfilled, and cancelled orders are immutable through normal Save.';
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'Order changed after it was loaded'
      using errcode = '40001', detail = 'The expected updated_at value no longer matches.', hint = 'Refresh before retrying.';
  end if;

  update public.orders set
    order_date = case when p_changes ? 'order_date' then (p_changes->>'order_date')::date else order_date end,
    customer_name = case when p_changes ? 'customer_name' then p_changes->>'customer_name' else customer_name end,
    customer_email = case when p_changes ? 'customer_email' then p_changes->>'customer_email' else customer_email end,
    customer_phone = case when p_changes ? 'customer_phone' then p_changes->>'customer_phone' else customer_phone end,
    order_title = case when p_changes ? 'order_title' then p_changes->>'order_title' else order_title end,
    fulfillment = case when p_changes ? 'fulfillment' then p_changes->>'fulfillment' else fulfillment end,
    tracking_number = case when p_changes ? 'tracking_number' then p_changes->>'tracking_number' else tracking_number end,
    po_number = case when p_changes ? 'po_number' then p_changes->>'po_number' else po_number end,
    tax_exempt = case when p_changes ? 'tax_exempt' then (p_changes->>'tax_exempt')::boolean else tax_exempt end,
    tax_exempt_reason = case when p_changes ? 'tax_exempt_reason' then p_changes->>'tax_exempt_reason' else tax_exempt_reason end,
    destination_county = case when p_changes ? 'destination_county' then p_changes->>'destination_county' else destination_county end,
    sales_tax_rate = case when p_changes ? 'sales_tax_rate' then (p_changes->>'sales_tax_rate')::numeric else sales_tax_rate end,
    exemption_certificate_on_file = case when p_changes ? 'exemption_certificate_on_file' then (p_changes->>'exemption_certificate_on_file')::boolean else exemption_certificate_on_file end,
    po_file_on_file = case when p_changes ? 'po_file_on_file' then (p_changes->>'po_file_on_file')::boolean else po_file_on_file end,
    po_part_number = case when p_changes ? 'po_part_number' then p_changes->>'po_part_number' else po_part_number end,
    shipping_contact_name = case when p_changes ? 'shipping_contact_name' then p_changes->>'shipping_contact_name' else shipping_contact_name end,
    shipping_company = case when p_changes ? 'shipping_company' then p_changes->>'shipping_company' else shipping_company end,
    ap_email = case when p_changes ? 'ap_email' then p_changes->>'ap_email' else ap_email end,
    billing_address = case when p_changes ? 'billing_address' then p_changes->>'billing_address' else billing_address end,
    shipping_address = case when p_changes ? 'shipping_address' then p_changes->>'shipping_address' else shipping_address end,
    shipping_or_pickup_note = case when p_changes ? 'shipping_or_pickup_note' then p_changes->>'shipping_or_pickup_note' else shipping_or_pickup_note end,
    invoice_date = case when p_changes ? 'invoice_date' then nullif(p_changes->>'invoice_date','')::date else invoice_date end,
    invoice_due_date = case when p_changes ? 'invoice_due_date' then nullif(p_changes->>'invoice_due_date','')::date else invoice_due_date end,
    invoice_terms = case when p_changes ? 'invoice_terms' then p_changes->>'invoice_terms' else invoice_terms end,
    olipoly_part_number = case when p_changes ? 'olipoly_part_number' then p_changes->>'olipoly_part_number' else olipoly_part_number end,
    part_revision = case when p_changes ? 'part_revision' then p_changes->>'part_revision' else part_revision end,
    internal_notes = case when p_changes ? 'internal_notes' then p_changes->>'internal_notes' else internal_notes end
  where id = v_order.id returning * into v_order;

  return next v_order;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_production_quote_provenance_drift()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.production_job_id is not null and new.production_job_id is distinct from old.production_job_id then
    raise exception 'Production Quote provenance is immutable' using errcode='23514';
  end if;
  if old.quote_number is distinct from new.quote_number and old.production_job_id is not null then
    raise exception 'Production Quote number is immutable' using errcode='23514';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_production_quote(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_command_identity text, p_quote jsonb)
 RETURNS quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_job public.production_jobs%rowtype;
  v_quote public.quotes%rowtype;
  v_number text := nullif(btrim(p_quote->>'quote_number'),'');
  v_now timestamptz := now();
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_production_job_id is null or p_expected_updated_at is null or nullif(btrim(coalesce(p_command_identity,'')),'') is null or v_number is null then
    raise exception 'Production job, concurrency token, command identity, and Quote number are required' using errcode='22004';
  end if;

  select * into v_job from public.production_jobs
   where id=p_production_job_id and user_id=v_actor for update;
  if not found then raise exception 'Production job not found or access denied' using errcode='42501'; end if;

  select * into v_quote from public.quotes where production_job_id=v_job.id for update;
  if found then
    if v_quote.user_id is distinct from v_actor or v_quote.quote_number is distinct from v_number then
      raise exception 'Production job already has a different Quote identity' using errcode='23505';
    end if;
  else
    if v_job.updated_at is distinct from p_expected_updated_at then
      raise exception 'Production estimate changed; refresh before saving Quote' using errcode='40001';
    end if;
    if v_job.order_number is not null or coalesce(v_job.production_status,'estimate') not in ('estimate','waiting_customer') then
      raise exception 'Production job is not eligible for Quote creation' using errcode='22023';
    end if;
    if v_job.quote_number is not null and v_job.quote_number is distinct from v_number then
      raise exception 'Production and Quote numbers disagree' using errcode='23514';
    end if;
  end if;

  insert into public.quotes(
    user_id,quote_number,invoice_number,quote_status,customer_name,customer_email,
    quote_title,quote_total,po_number,tax_exempt,tax_exempt_reason,
    exemption_certificate_on_file,po_file_on_file,customer_part_number,
    po_part_number,olipoly_part_number,part_revision,shipping_contact_name,
    shipping_company,shipping_address,billing_address,quote_data,
    production_job_id,updated_at
  ) values (
    v_actor,v_number,nullif(p_quote->>'invoice_number',''),coalesce(nullif(p_quote->>'quote_status',''),'pending'),
    nullif(p_quote->>'customer_name',''),nullif(p_quote->>'customer_email',''),nullif(p_quote->>'quote_title',''),
    (p_quote->>'quote_total')::numeric,nullif(p_quote->>'po_number',''),coalesce((p_quote->>'tax_exempt')::boolean,false),
    nullif(p_quote->>'tax_exempt_reason',''),coalesce((p_quote->>'exemption_certificate_on_file')::boolean,false),
    coalesce((p_quote->>'po_file_on_file')::boolean,false),nullif(p_quote->>'customer_part_number',''),
    nullif(p_quote->>'po_part_number',''),nullif(p_quote->>'olipoly_part_number',''),nullif(p_quote->>'part_revision',''),
    nullif(p_quote->>'shipping_contact_name',''),nullif(p_quote->>'shipping_company',''),nullif(p_quote->>'shipping_address',''),
    nullif(p_quote->>'billing_address',''),coalesce(p_quote->'quote_data','{}'::jsonb),v_job.id,v_now
  )
  on conflict (production_job_id) where production_job_id is not null do update set
    invoice_number=excluded.invoice_number, quote_status=excluded.quote_status,
    customer_name=excluded.customer_name, customer_email=excluded.customer_email,
    quote_title=excluded.quote_title, quote_total=excluded.quote_total, po_number=excluded.po_number,
    tax_exempt=excluded.tax_exempt, tax_exempt_reason=excluded.tax_exempt_reason,
    exemption_certificate_on_file=excluded.exemption_certificate_on_file, po_file_on_file=excluded.po_file_on_file,
    customer_part_number=excluded.customer_part_number, po_part_number=excluded.po_part_number,
    olipoly_part_number=excluded.olipoly_part_number, part_revision=excluded.part_revision,
    shipping_contact_name=excluded.shipping_contact_name, shipping_company=excluded.shipping_company,
    shipping_address=excluded.shipping_address, billing_address=excluded.billing_address,
    quote_data=excluded.quote_data, updated_at=excluded.updated_at
  returning * into v_quote;

  update public.production_jobs set
    quote_number=v_number,
    production_status=case when production_status='estimate' then 'waiting_customer' else production_status end,
    job_payload=jsonb_set(jsonb_set(coalesce(job_payload,'{}'::jsonb),'{quote_number}',to_jsonb(v_number),true),'{quote_id}',to_jsonb(v_quote.id),true),
    updated_at=v_now
  where id=v_job.id returning * into v_job;

  insert into public.production_linkage_audit(user_id,production_job_id,quote_id,command_identity,event_type,from_status,to_status,evidence)
  values(v_actor,v_job.id,v_quote.id,p_command_identity,'production_quote_linked',v_job.production_status,'waiting_customer',jsonb_build_object('quote_number',v_number))
  on conflict(command_identity) do nothing;
  return v_quote;
end $function$
;

CREATE OR REPLACE FUNCTION public.link_production_after_quote_order_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_quote public.quotes%rowtype; v_job public.production_jobs%rowtype; v_now timestamptz := now();
begin
  if new.source_type is distinct from 'quote' or new.created_from_quote is not true then return new; end if;
  select * into v_quote from public.quotes where quote_number=new.source_quote_number for update;
  if not found then raise exception 'Quote-created Order has no authoritative Quote' using errcode='23514'; end if;
  if v_quote.user_id is distinct from new.user_id then raise exception 'Quote/Order owner mismatch' using errcode='23514'; end if;
  if v_quote.production_job_id is null then return new; end if;
  select * into v_job from public.production_jobs where id=v_quote.production_job_id for update;
  if not found or v_job.user_id is distinct from new.user_id then raise exception 'Production provenance owner mismatch' using errcode='23514'; end if;
  if v_job.quote_number is distinct from v_quote.quote_number or nullif(v_job.job_payload->>'quote_number','') is distinct from v_quote.quote_number then
    raise exception 'Production/Quote identity mismatch for %', v_quote.quote_number using errcode='23514';
  end if;
  if v_job.order_number is not null and v_job.order_number is distinct from new.order_number then
    raise exception 'Production job already links another Order' using errcode='23514';
  end if;
  if coalesce(v_job.production_status,'') not in ('estimate','waiting_customer','quote_sent','quote_accepted','awaiting_approval','waiting_for_customer','ready_to_print') then
    raise exception 'Production lifecycle is not eligible for Order conversion' using errcode='22023';
  end if;
  if coalesce((v_job.job_payload->>'actual_usage_captured')::boolean,false) then
    raise exception 'Production job already has actual-production evidence' using errcode='23514';
  end if;
  update public.production_jobs set
    order_number=new.order_number, quote_number=v_quote.quote_number, production_status='ready_to_print',
    job_payload=jsonb_set(jsonb_set(jsonb_set(coalesce(job_payload,'{}'::jsonb),'{quote_number}',to_jsonb(v_quote.quote_number),true),'{order_number}',to_jsonb(new.order_number),true),'{order_id}',to_jsonb(new.id),true),
    updated_at=v_now
  where id=v_job.id;
  insert into public.production_linkage_audit(user_id,production_job_id,quote_id,order_id,command_identity,event_type,from_status,to_status,evidence)
  values(new.user_id,v_job.id,v_quote.id,new.id,'order-conversion:'||new.id,'production_order_linked',v_job.production_status,'ready_to_print',jsonb_build_object('quote_number',v_quote.quote_number,'order_number',new.order_number));
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.seed_default_printers()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.printer_pm (user_id, printer_name, printer_model, last_pm_date, next_pm_date, pm_interval_days, pm_interval_hours)
  values
    (auth.uid(), 'P1S', 'Bambu Lab P1S', current_date, current_date + 30, 30, 250),
    (auth.uid(), 'P2S', 'Bambu Lab P2S', current_date, current_date + 30, 30, 250)
  on conflict (user_id, printer_name) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.repair_production_quote_order_linkage(p_production_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid:=auth.uid(); v_job public.production_jobs%rowtype; v_quote public.quotes%rowtype; v_order public.orders%rowtype; v_count int; v_identity text;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update;
 if not found then raise exception 'Production job not found or access denied' using errcode='42501'; end if;
 if v_job.production_source_type='legacy_standalone' then raise exception 'Standalone approval conflicts with linkage repair' using errcode='23514'; end if;
 v_identity:=coalesce(v_job.quote_number,nullif(btrim(v_job.job_payload->>'quote_number'),''));
 if v_identity is null or (v_job.quote_number is not null and nullif(btrim(v_job.job_payload->>'quote_number'),'') is not null and v_job.quote_number is distinct from nullif(btrim(v_job.job_payload->>'quote_number'),'')) then raise exception 'Unique Quote provenance is required' using errcode='23514'; end if;
 select count(*) into v_count from public.quotes where user_id=v_actor and quote_number=v_identity;
 if v_count<>1 then raise exception 'Expected exactly one same-owner Quote; found %',v_count using errcode='23514'; end if;
 select * into v_quote from public.quotes where user_id=v_actor and quote_number=v_identity for update;
 if v_quote.production_job_id is not null and v_quote.production_job_id<>v_job.id then raise exception 'Quote has conflicting Production provenance' using errcode='23514'; end if;
 select count(*) into v_count from public.orders where source_quote_number=v_identity;
 if v_count<>1 then raise exception 'Expected exactly one Order candidate; found %',v_count using errcode='23514'; end if;
 select * into v_order from public.orders where source_quote_number=v_identity for update;
 if v_order.user_id<>v_actor then raise exception 'Order candidate owner mismatch' using errcode='42501'; end if;
 if v_order.created_from_quote is not true or v_order.source_type is distinct from 'quote' then raise exception 'Order candidate is not Quote-created' using errcode='23514'; end if;
 if v_job.order_number is not null and v_job.order_number<>v_order.order_number then raise exception 'Production job has conflicting Order identity' using errcode='23514'; end if;
 if nullif(v_job.job_payload->>'order_number','') is not null and v_job.job_payload->>'order_number'<>v_order.order_number then raise exception 'Payload has conflicting Order identity' using errcode='23514'; end if;
 if nullif(v_job.job_payload->>'order_id','') is not null and v_job.job_payload->>'order_id'<>v_order.id::text then raise exception 'Payload has conflicting Order ID' using errcode='23514'; end if;
 update public.quotes set production_job_id=v_job.id where id=v_quote.id and production_job_id is null;
 update public.production_jobs set quote_number=coalesce(quote_number,v_identity),order_number=v_order.order_number,production_source_type='legacy_repaired',
   job_payload=coalesce(job_payload,'{}')||jsonb_build_object('quote_number',v_identity,'order_number',v_order.order_number,'order_id',v_order.id),updated_at=now()
 where id=v_job.id returning * into v_job;
 insert into public.production_linkage_audit(user_id,production_job_id,quote_id,order_id,command_identity,event_type,from_status,to_status,evidence)
 values(v_actor,v_job.id,v_quote.id,v_order.id,'legacy-repair:'||v_job.id||':'||v_order.id,'legacy_linkage_repaired',v_job.production_status,v_job.production_status,jsonb_build_object('quote_number',v_identity,'order_number',v_order.order_number)) on conflict(command_identity) do nothing;
 return jsonb_build_object('outcome','linked','production_job',to_jsonb(v_job),'order_id',v_order.id,'idempotent',v_job.production_source_type='legacy_repaired');
end $function$
;

CREATE OR REPLACE FUNCTION public.reset_printer_pm(p_machine_name text, p_last_pm_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text)
 RETURNS printer_pm
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_pm public.printer_pm%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.printer_pm(user_id, machine_name, machine_label, last_pm_date, next_pm_date, hours_since_pm, last_pm_notes)
  values(v_user, p_machine_name, p_machine_name, p_last_pm_date, p_last_pm_date + 30, 0, p_notes)
  on conflict(user_id, machine_name) do update
  set last_pm_date = p_last_pm_date,
      next_pm_date = p_last_pm_date + coalesce(public.printer_pm.pm_interval_days, 30),
      hours_since_pm = 0,
      last_pm_notes = p_notes,
      updated_at = now()
  returning * into v_pm;

  insert into public.inventory_transactions(user_id, transaction_type, machine_name, note)
  values(v_user, 'pm_reset', p_machine_name, coalesce(p_notes,'PM marked complete.'));

  return v_pm;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.production_workflow_command(p_order_number text, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb DEFAULT '{}'::jsonb, p_correlation_id text DEFAULT NULL::text, p_causation_id text DEFAULT NULL::text)
 RETURNS production_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_order public.orders%rowtype;
  v_job public.production_jobs%rowtype;
  v_command text := lower(btrim(coalesce(p_command,'')));
  v_to text;
  v_event text;
  v_from text;
  v_command_id text := nullif(btrim(p_correlation_id),'');
  v_actual_grams numeric;
  v_scrap_grams numeric;
  v_actual_hours numeric;
  v_actual_quantity numeric;
  v_actual_machine text;
  v_actual_filament_breakdown text;
  v_roll_usage jsonb;
  v_attempt jsonb;
  v_actual_filaments jsonb;
  v_actual_filament_usage jsonb;
begin
  perform set_config('lock_timeout','2000ms',true);
  if v_actor is null then raise exception 'Authentication is required for Production workflow commands' using errcode='28000'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;
  begin
    perform pg_advisory_xact_lock(hashtextextended(v_command_id, 0));
  exception when lock_not_available then
    raise exception 'Production workflow command identity is already in progress' using errcode='55P03', detail='lockScope=command';
  end;

  begin
    select * into v_order from public.orders where order_number = p_order_number for update nowait;
  exception when lock_not_available then
    raise exception 'Production workflow Order is already in progress' using errcode='55P03', detail='lockScope=order';
  end;
  if not found or v_order.user_id is distinct from v_actor then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;

  begin
    select * into v_job from public.production_jobs
     where user_id = v_actor and (order_number = v_order.order_number or (v_order.source_quote_number is not null and quote_number = v_order.source_quote_number))
     order by case when order_number = v_order.order_number then 0 else 1 end, updated_at desc nulls last
     limit 1 for update nowait;
  exception when lock_not_available then
    raise exception 'Production workflow job is already in progress' using errcode='55P03', detail='lockScope=job';
  end;
  if not found then raise exception 'Linked Production job not found for %', p_order_number using errcode='P0002'; end if;
  if v_job.order_number is distinct from v_order.order_number then raise exception 'Production/Order linkage mismatch for %', p_order_number using errcode='23514'; end if;
  if v_command = 'start_print' then
    v_to := 'printing'; v_event := 'order.printing_started';
  elsif v_command = 'complete_print' then
    v_to := 'qc'; v_event := 'order.print_completed';
    if coalesce(jsonb_typeof(p_payload->'actual_grams_used') not in ('number','string'), true)
       or coalesce(jsonb_typeof(p_payload->'actual_print_hours') not in ('number','string'), true)
       or (p_payload ? 'scrap_grams' and coalesce(jsonb_typeof(p_payload->'scrap_grams') not in ('number','string'), true))
       or coalesce(p_payload->>'actual_grams_used','') !~ '^[0-9]+(\.[0-9]+)?$'
       or coalesce(p_payload->>'actual_print_hours','') !~ '^[0-9]+(\.[0-9]+)?$'
       or coalesce(nullif(p_payload->>'scrap_grams',''),'0') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Complete Print requires finite nonnegative numeric actual_grams_used, scrap_grams, and actual_print_hours' using errcode='22023';
    end if;
    v_actual_grams := (p_payload->>'actual_grams_used')::numeric;
    v_scrap_grams := coalesce(nullif(p_payload->>'scrap_grams','')::numeric, 0);
    v_actual_hours := (p_payload->>'actual_print_hours')::numeric;
    if v_actual_grams::text in ('NaN','Infinity','-Infinity') or v_scrap_grams::text in ('NaN','Infinity','-Infinity') or v_actual_hours::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Complete Print actuals must be finite' using errcode='22023';
    end if;
    if coalesce(p_payload->>'actual_machine','') = '' then raise exception 'Complete Print requires actual_machine' using errcode='22023'; end if;
    if coalesce(p_payload->>'actual_quantity','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Complete Print requires finite nonnegative actual_quantity' using errcode='22023'; end if;
    v_actual_quantity := (p_payload->>'actual_quantity')::numeric;
    if v_actual_quantity::text in ('NaN','Infinity','-Infinity') or v_actual_quantity < 0 then raise exception 'Complete Print actual_quantity must be finite and nonnegative' using errcode='22023'; end if;
    if p_payload ? 'actual_filament_breakdown' and jsonb_typeof(p_payload->'actual_filament_breakdown') not in ('array','object','string','null') then raise exception 'actual_filament_breakdown has invalid JSON structure' using errcode='22023'; end if;
    if p_payload ? 'roll_usages' and jsonb_typeof(p_payload->'roll_usages') <> 'array' then raise exception 'roll_usages must be an array' using errcode='22023'; end if;
    if p_payload ? 'production_attempt' and jsonb_typeof(p_payload->'production_attempt') <> 'object' then raise exception 'production_attempt must be an object' using errcode='22023'; end if;
    if p_payload ? 'actual_filaments' and jsonb_typeof(p_payload->'actual_filaments') not in ('array','object','null') then raise exception 'actual_filaments must be JSON array/object' using errcode='22023'; end if;
    if p_payload ? 'actual_filament_usage' and jsonb_typeof(p_payload->'actual_filament_usage') not in ('array','object','null') then raise exception 'actual_filament_usage must be JSON array/object' using errcode='22023'; end if;
    v_actual_machine := p_payload->>'actual_machine';
    v_actual_filament_breakdown := nullif(p_payload->>'actual_filament_breakdown','');
    v_roll_usage := coalesce(p_payload->'roll_usages', '[]'::jsonb);
    v_actual_filaments := coalesce(p_payload->'actual_filaments', 'null'::jsonb);
    v_actual_filament_usage := coalesce(p_payload->'actual_filament_usage', 'null'::jsonb);
    v_attempt := coalesce(p_payload->'production_attempt', jsonb_build_object('captured_at', v_now, 'actual_grams_used', v_actual_grams, 'scrap_grams', v_scrap_grams, 'actual_print_hours', v_actual_hours, 'actual_machine', v_actual_machine, 'actual_quantity', v_actual_quantity, 'roll_usages', v_roll_usage, 'actual_filaments', v_actual_filaments, 'actual_filament_usage', v_actual_filament_usage));
  elsif v_command = 'pass_qc' then
    v_to := 'ready_for_fulfillment'; v_event := 'order.qc_passed';
  elsif v_command = 'needs_reprint' then
    v_to := 'ready_to_print'; v_event := 'order.needs_reprint';
  else
    raise exception 'Invalid Production workflow command: %', p_command using errcode='22023';
  end if;

  if exists (
    select 1 from public.project_events
     where correlation_id = v_command_id
       and event_type = v_event
       and user_id = v_actor
       and aggregate_type = 'order'
       and aggregate_id = v_order.id::text
       and payload->>'command' = v_command
  ) then
    return v_job;
  end if;
  if exists (select 1 from public.project_events where correlation_id = v_command_id and not (event_type = v_event and user_id = v_actor and aggregate_type = 'order' and aggregate_id = v_order.id::text and payload->>'command' = v_command)) then
    raise exception 'Command identity is already used for a different workflow command' using errcode='23505';
  end if;
  if v_job.updated_at is distinct from p_expected_updated_at then
    raise exception 'Production workflow changed since this page loaded; refresh before retrying'
      using errcode='PT409',
            detail=format('appCode=40001 conflictScope=production_row expected=%s authoritative=%s expectedText=%s authoritativeText=%s expectedEpoch=%s authoritativeEpoch=%s jobId=%s orderNumber=%s',
              p_expected_updated_at,
              v_job.updated_at,
              to_char(p_expected_updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
              to_char(v_job.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
              extract(epoch from p_expected_updated_at),
              extract(epoch from v_job.updated_at),
              v_job.id,
              v_order.order_number),
            hint='Refresh Production Control before issuing another workflow command';
  end if;
  v_from := v_job.production_status;
  if v_command = 'start_print' and (v_job.production_status <> 'ready_to_print' or v_order.status <> 'ready_to_print') then raise exception 'Start Print requires ready_to_print' using errcode='22023'; end if;
  if v_command = 'complete_print' and (v_job.production_status <> 'printing' or v_order.status <> 'printing') then raise exception 'Complete Print requires printing' using errcode='22023'; end if;
  if v_command in ('pass_qc','needs_reprint') and (v_job.production_status <> 'qc' or v_order.status <> 'qc') then raise exception 'QC command requires qc' using errcode='22023'; end if;

  update public.production_jobs
     set production_status = v_to,
         actual_machine = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_machine else actual_machine end,
         actual_quantity = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_quantity else actual_quantity end,
         actual_print_hours = case when v_command='needs_reprint' then null else coalesce(v_actual_hours, actual_print_hours) end,
         actual_grams_used = case when v_command='needs_reprint' then null else coalesce(v_actual_grams, actual_grams_used) end,
         scrap_grams = case when v_command='needs_reprint' then null else coalesce(v_scrap_grams, scrap_grams) end,
         actual_filament_breakdown = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_filament_breakdown else actual_filament_breakdown end,
         actual_filaments = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_filaments else actual_filaments end,
         actual_filament_usage = case when v_command='needs_reprint' then null when v_command='complete_print' then v_actual_filament_usage else actual_filament_usage end,
         roll_usages = case when v_command='needs_reprint' then '[]'::jsonb when v_command='complete_print' then v_roll_usage else roll_usages end,
         completed_at = case when v_command='needs_reprint' then null when v_command='complete_print' then v_now else completed_at end,
         print_started_at = case when v_command='start_print' then coalesce(print_started_at, v_now) when v_command='needs_reprint' then null else print_started_at end,
         job_payload = case
           when v_command='complete_print' then coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'order_number', v_order.order_number, 'updated_at', v_now, 'last_completed_attempt', v_attempt, 'production_attempts', coalesce(job_payload->'production_attempts','[]'::jsonb) || jsonb_build_array(v_attempt))
           when v_command='needs_reprint' then coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'order_number', v_order.order_number, 'updated_at', v_now, 'current_attempt', jsonb_build_object('created_at', v_now), 'needs_reprint_at', v_now)
           else coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'order_number', v_order.order_number, 'updated_at', v_now)
         end,
         updated_at = v_now
   where id = v_job.id and user_id = v_actor
   returning * into v_job;
  if not found then raise exception 'Production workflow update affected no rows' using errcode='40001'; end if;

  update public.orders set status = v_to, updated_at = v_now where id = v_order.id and user_id = v_actor returning * into v_order;
  if not found then raise exception 'Order workflow projection affected no rows' using errcode='40001'; end if;

  update public.order_tracking_public
     set status = v_to, public_status_text = public.workflow_public_status_text(v_to), public_next_step = public.workflow_public_next_step(v_to), updated_at = v_now
   where order_number = v_order.order_number and user_id = v_actor;
  if not found then raise exception 'Tracking projection affected no rows' using errcode='40001'; end if;

  insert into public.project_events(event_id,user_id,quote_number,order_number,event_type,details,created_at,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,correlation_id,causation_id,schema_version,payload)
  values(gen_random_uuid(),v_actor,v_order.source_quote_number,v_order.order_number,v_event,jsonb_build_object('from',v_from,'to',v_to),v_now,v_now,'order',v_order.id::text,'authenticated_user',v_actor::text,v_command_id,p_causation_id,1,jsonb_build_object('command',v_command,'from',v_from,'status',v_to,'production_job_id',v_job.id,'actuals',coalesce(p_payload,'{}'::jsonb)))
  on conflict (correlation_id, event_type) where correlation_id is not null and event_type in ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed') do nothing;

  return v_job;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.workflow_public_status_text(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_status when 'ready_to_print' then 'Your order is ready for production.' when 'printing' then 'Your order is printing.' when 'qc' then 'Your order is in quality control and finishing.' when 'ready_for_fulfillment' then 'Your order is ready for pickup or shipment.' when 'closed' then 'Your order is complete.' else null end
$function$
;

CREATE OR REPLACE FUNCTION public.mark_printer_pm_complete(p_printer_name text, p_pm_date date DEFAULT CURRENT_DATE, p_next_pm_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid;
  v_next date;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(coalesce(p_printer_name,'')), '') is null then
    raise exception 'Printer name is required';
  end if;

  v_next := coalesce(p_next_pm_date, p_pm_date + 30);

  insert into public.printer_pm (
    user_id, printer_name, last_pm_date, next_pm_date, pm_interval_days, hours_since_pm, pm_interval_hours, lifetime_hours, last_pm_note
  ) values (
    v_user, trim(p_printer_name), p_pm_date, v_next, 30, 0, 250, 0, p_note
  )
  on conflict (user_id, printer_name)
  do update set
    last_pm_date = excluded.last_pm_date,
    next_pm_date = excluded.next_pm_date,
    hours_since_pm = 0,
    last_pm_note = excluded.last_pm_note,
    updated_at = now();

  return jsonb_build_object('ok', true, 'printer_name', trim(p_printer_name), 'last_pm_date', p_pm_date, 'next_pm_date', v_next);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.workflow_public_next_step(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_status when 'ready_to_print' then 'Printing will begin when the assigned machine is available.' when 'printing' then 'Quality control and finishing follow printing.' when 'qc' then 'The finished order will be prepared for pickup or shipment.' when 'ready_for_fulfillment' then 'OliPoly 3D will coordinate the final handoff.' when 'closed' then 'No further production action is required.' else null end
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_production_material(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_reservation_command_id text, p_roll_reservations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid(); v_now timestamptz := now(); v_job public.production_jobs%rowtype; v_order public.orders%rowtype;
  v_line jsonb; v_roll_id uuid; v_grams numeric; v_existing jsonb; v_results jsonb := '[]'::jsonb; v_reserved_total numeric := 0;
begin
  if v_actor is null then raise exception 'Authentication is required for Inventory reservation' using errcode='28000'; end if;
  if p_production_job_id is null or p_expected_updated_at is null or nullif(btrim(coalesce(p_reservation_command_id,'')),'') is null then raise exception 'Production job, optimistic concurrency, and command identity are required' using errcode='22004'; end if;
  if jsonb_typeof(p_roll_reservations) <> 'array' or jsonb_array_length(p_roll_reservations) = 0 then raise exception 'Explicit reservation roll lines are required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_reservation_command_id, 0));

  select jsonb_agg(jsonb_build_object('reservation_id', id, 'raw_material_roll_id', raw_material_roll_id, 'reserved_grams', reserved_grams, 'status', status) order by raw_material_roll_id) into v_existing
  from public.production_material_reservations where user_id = v_actor and production_job_id = p_production_job_id and reservation_command_id = p_reservation_command_id;
  if v_existing is not null then
    if exists (select 1 from public.production_material_reservations where reservation_command_id = p_reservation_command_id and (user_id is distinct from v_actor or production_job_id is distinct from p_production_job_id)) then raise exception 'Command identity is already used for another owner or job' using errcode='23505'; end if;
    return jsonb_build_object('production_job_id', p_production_job_id, 'reservation_command_id', p_reservation_command_id, 'idempotent', true, 'reservations', v_existing);
  end if;
  if exists (select 1 from public.production_material_reservations where reservation_command_id = p_reservation_command_id and user_id is distinct from v_actor) then raise exception 'Command identity is already used by another owner' using errcode='23505'; end if;

  select * into v_job from public.production_jobs where id = p_production_job_id for update;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if v_job.production_status <> 'ready_to_print' then raise exception 'Material can only be reserved when linked Production is ready_to_print' using errcode='22023'; end if;
  if v_job.order_number is null then raise exception 'Production job must be linked to an accepted Order before Inventory reservation' using errcode='23514'; end if;
  select * into v_order from public.orders where user_id = v_actor and order_number = v_job.order_number for update;
  if not found then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;

  for v_line in select * from jsonb_array_elements(p_roll_reservations) loop
    if nullif(v_line->>'raw_material_roll_id','') is null then raise exception 'Every reservation must include raw_material_roll_id' using errcode='22004'; end if;
    v_roll_id := (v_line->>'raw_material_roll_id')::uuid;
    if coalesce(v_line->>'grams_reserved','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Reservation quantities must be finite numbers' using errcode='22023'; end if;
    v_grams := (v_line->>'grams_reserved')::numeric;
    if v_grams::text in ('NaN','Infinity','-Infinity') or v_grams <= 0 then raise exception 'Reservation quantity must be greater than zero and finite' using errcode='22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_roll_reservations) d where d->>'raw_material_roll_id' = v_roll_id::text group by d->>'raw_material_roll_id' having count(*) > 1) then raise exception 'Duplicate roll reservation lines are not allowed' using errcode='23505'; end if;
    perform 1 from public.raw_material_inventory r where r.id = v_roll_id and r.user_id = v_actor and (coalesce(r.remaining_grams,0) - coalesce(r.reserved_grams,0)) >= v_grams for update;
    if not found then raise exception 'Raw material roll is missing, cross-owner, or has insufficient available material' using errcode='23514'; end if;
    update public.raw_material_inventory set reserved_grams = coalesce(reserved_grams,0) + v_grams, updated_at = v_now where id = v_roll_id and user_id = v_actor;
    insert into public.production_material_reservations(user_id, production_job_id, order_number, raw_material_roll_id, reserved_grams, status, reservation_command_id, created_at, updated_at)
    values(v_actor, p_production_job_id, v_job.order_number, v_roll_id, v_grams, 'active', p_reservation_command_id, v_now, v_now)
    returning jsonb_build_object('reservation_id', id, 'raw_material_roll_id', raw_material_roll_id, 'reserved_grams', reserved_grams, 'status', status) into v_line;
    v_results := v_results || jsonb_build_array(v_line); v_reserved_total := v_reserved_total + v_grams;
  end loop;
  return jsonb_build_object('production_job_id', p_production_job_id, 'reservation_command_id', p_reservation_command_id, 'idempotent', false, 'reserved_grams', v_reserved_total, 'reservations', v_results);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.release_production_material_reservation(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_release_command_id text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid(); v_now timestamptz := now(); v_job public.production_jobs%rowtype; v_order public.orders%rowtype; v_existing jsonb; v_results jsonb; v_total numeric;
begin
  if v_actor is null then raise exception 'Authentication is required for Inventory reservation release' using errcode='28000'; end if;
  if p_production_job_id is null or p_expected_updated_at is null or nullif(btrim(coalesce(p_release_command_id,'')),'') is null then raise exception 'Production job, optimistic concurrency, and command identity are required' using errcode='22004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_release_command_id, 0));
  select jsonb_agg(jsonb_build_object('reservation_id', id, 'raw_material_roll_id', raw_material_roll_id, 'released_grams', reserved_grams, 'status', status) order by raw_material_roll_id) into v_existing from public.production_material_reservations where user_id = v_actor and production_job_id = p_production_job_id and release_command_id = p_release_command_id;
  if v_existing is not null then return jsonb_build_object('production_job_id', p_production_job_id, 'release_command_id', p_release_command_id, 'idempotent', true, 'reservations', v_existing); end if;
  if exists (select 1 from public.production_material_reservations where release_command_id = p_release_command_id and (user_id is distinct from v_actor or production_job_id is distinct from p_production_job_id)) then raise exception 'Command identity is already used for another owner or job' using errcode='23505'; end if;
  select * into v_job from public.production_jobs where id = p_production_job_id for update;
  if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
  if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
  if v_job.order_number is null then raise exception 'Production job must be linked to an accepted Order before Inventory release' using errcode='23514'; end if;
  select * into v_order from public.orders where user_id = v_actor and order_number = v_job.order_number for update;
  if not found then raise exception 'Accepted linked Order not found for Production job' using errcode='23514'; end if;
  if v_job.production_status not in ('ready_to_print','printing','qc','ready_for_fulfillment','closed') then raise exception 'Invalid lifecycle command for reservation release' using errcode='22023'; end if;
  perform 1 from public.production_material_reservations where user_id = v_actor and production_job_id = p_production_job_id and status = 'active' for update;
  if not found then return jsonb_build_object('production_job_id', p_production_job_id, 'release_command_id', p_release_command_id, 'idempotent', false, 'released_grams', 0, 'reservations', '[]'::jsonb); end if;
  update public.raw_material_inventory r set reserved_grams = greatest(coalesce(r.reserved_grams,0) - a.reserved_grams, 0), updated_at = v_now from public.production_material_reservations a where a.user_id = v_actor and a.production_job_id = p_production_job_id and a.status = 'active' and a.raw_material_roll_id = r.id and r.user_id = v_actor;
  update public.production_material_reservations set status = 'released', release_command_id = p_release_command_id, released_at = v_now, updated_at = v_now where user_id = v_actor and production_job_id = p_production_job_id and status = 'active';
  select coalesce(sum(reserved_grams),0), coalesce(jsonb_agg(jsonb_build_object('reservation_id', id, 'raw_material_roll_id', raw_material_roll_id, 'released_grams', reserved_grams, 'status', status) order by raw_material_roll_id), '[]'::jsonb) into v_total, v_results from public.production_material_reservations where user_id = v_actor and production_job_id = p_production_job_id and release_command_id = p_release_command_id;
  return jsonb_build_object('production_job_id', p_production_job_id, 'release_command_id', p_release_command_id, 'idempotent', false, 'released_grams', v_total, 'reservations', v_results);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.link_accepted_quote_to_production(p_quote_number text, p_public_token text, p_order_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q record;
  v_job_id text;
  v_order text;
begin
  select * into q
  from public.quotes
  where quote_number = p_quote_number
    and public_token = p_public_token
  limit 1;

  if q is null then
    raise exception 'Quote not found or token invalid.';
  end if;

  if coalesce(q.customer_response, '') <> 'accepted' then
    raise exception 'Quote has not been accepted yet.';
  end if;

  v_job_id := nullif(q.quote_data #>> '{fields,productionJobId}', '');
  if v_job_id is null then
    v_job_id := nullif(q.quote_data ->> 'production_job_id', '');
  end if;

  if v_job_id is null then
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'No production job id on quote.');
  end if;

  v_order := coalesce(nullif(p_order_number, ''), nullif(q.converted_order_number, ''), regexp_replace(q.quote_number, '^Q-', 'OP-'));

  update public.production_jobs pj
  set
    job_payload = coalesce(pj.job_payload, '{}'::jsonb)
      || jsonb_build_object(
        'quote_number', q.quote_number,
        'order_number', v_order,
        'production_status', 'ready_to_print',
        'quote_accepted_at', now(),
        'quote_link_status', 'accepted_linked_to_order'
      ),
    updated_at = now()
  where pj.id::text = v_job_id;

  return jsonb_build_object('ok', true, 'linked', found, 'production_job_id', v_job_id, 'order_number', v_order);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_campaign_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.next_document_counter(counter_key text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  normalized_key text := lower(trim(counter_key));
  next_value bigint;
begin
  if normalized_key not in ('quote', 'order', 'invoice') then
    raise exception 'Unsupported document counter key: %', counter_key using errcode = '22023';
  end if;

  insert into public.document_counters as dc (key, value, updated_at)
  values (normalized_key, 1, now())
  on conflict (key) do update
    set value = dc.value + 1,
        updated_at = now()
  returning value into next_value;

  return next_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.next_quote_invoice_number()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  next_val bigint;
begin
  update public.document_counters
  set value = value + 1,
      updated_at = now()
  where key = 'quote_invoice'
  returning value into next_val;

  return next_val;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_quote_accepted_snapshot_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'accepted commercial snapshots are immutable' using errcode = '2F000';
end; $function$
;

CREATE OR REPLACE FUNCTION public.enforce_accepted_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin new.status:=public.normalize_accepted_order_status(new.status); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.normalize_accepted_order_status(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case lower(coalesce(trim(p_status), ''))
    when 'printing' then 'printing'
    when 'in_production' then 'printing'
    when 'qc' then 'qc'
    when 'post_processing' then 'qc'
    when 'production_complete' then 'qc'
    when 'qc_complete' then 'qc'
    when 'ready_for_fulfillment' then 'ready_for_fulfillment'
    when 'ready' then 'ready_for_fulfillment'
    when 'ready_for_pickup' then 'ready_for_fulfillment'
    when 'awaiting_pickup' then 'ready_for_fulfillment'
    when 'delivery_scheduled' then 'ready_for_fulfillment'
    when 'shipped' then 'ready_for_fulfillment'
    when 'delivered' then 'ready_for_fulfillment'
    when 'closed' then 'closed'
    when 'completed' then 'closed'
    when 'production_closed' then 'closed'
    when 'canceled' then 'closed'
    when 'cancelled' then 'closed'
    when 'archived' then 'closed'
    else 'ready_to_print'
  end
$function$
;

CREATE OR REPLACE FUNCTION public.set_linked_workflow_status(p_order_number text, p_status text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'set_linked_workflow_status is retired; use production_workflow_command or fulfillment_workflow_command' using errcode='0A000';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_production_job(p_job_id uuid, p_actual_machine text, p_quantity_completed numeric, p_actual_print_hours numeric, p_actual_filaments jsonb DEFAULT '[]'::jsonb, p_completion_notes text DEFAULT NULL::text, p_add_finished_good boolean DEFAULT false, p_finished_good_id uuid DEFAULT NULL::uuid, p_finished_good_name text DEFAULT NULL::text, p_sku text DEFAULT NULL::text, p_sale_price numeric DEFAULT 0)
 RETURNS production_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'complete_production_job is retired; use production_workflow_command for workflow transitions and a future reviewed Inventory command for inventory consumption'
    using errcode = '2F000',
          hint = 'This legacy RPC bypassed ERP Blueprint v1 workflow authority and Inventory command ownership.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_production_job(p_job_id uuid, p_status text DEFAULT 'completed'::text, p_actual_machine text DEFAULT NULL::text, p_actual_quantity numeric DEFAULT NULL::numeric, p_actual_print_hours numeric DEFAULT NULL::numeric, p_actual_grams_used numeric DEFAULT NULL::numeric, p_actual_filament_breakdown text DEFAULT NULL::text, p_close_note text DEFAULT NULL::text, p_add_finished_good boolean DEFAULT false, p_skip_inventory_reduction boolean DEFAULT false, p_roll_usages jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'complete_production_job is retired; use production_workflow_command for workflow transitions and a future reviewed Inventory command for inventory consumption'
    using errcode = '2F000',
          hint = 'This legacy RPC bypassed ERP Blueprint v1 workflow authority and Inventory command ownership.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_production_job(p_job_id uuid, p_status text DEFAULT 'completed'::text, p_actual_machine text DEFAULT NULL::text, p_actual_quantity numeric DEFAULT NULL::numeric, p_actual_print_hours numeric DEFAULT NULL::numeric, p_actual_grams_used numeric DEFAULT NULL::numeric, p_actual_filament_breakdown text DEFAULT NULL::text, p_close_note text DEFAULT NULL::text, p_add_finished_good boolean DEFAULT false, p_skip_inventory_reduction boolean DEFAULT false, p_raw_material_roll_id uuid DEFAULT NULL::uuid, p_finished_roll boolean DEFAULT false, p_spool_freed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'complete_production_job is retired; use production_workflow_command for workflow transitions and a future reviewed Inventory command for inventory consumption'
    using errcode = '2F000',
          hint = 'This legacy RPC bypassed ERP Blueprint v1 workflow authority and Inventory command ownership.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_order_commercial_totals(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select r.totals from public.order_pricing_revisions r where r.order_id=o.id and r.user_id=o.user_id order by r.revision desc limit 1),
    (select case when s.snapshot->>'invoice_totals_schema_version'='1' then s.snapshot->'invoice_totals'
      when not(s.snapshot ? 'invoice_totals_schema_version') then coalesce(s.snapshot#>'{offer,quote_data,customer_totals}',s.snapshot#>'{offer,customer_totals}') end
     from public.quote_accepted_commercial_snapshots s where s.user_id=o.user_id and (s.order_number=o.order_number or s.quote_number=o.source_quote_number)
     order by (s.order_number=o.order_number) desc limit 1))
  from public.orders o where o.id=p_order_id and o.user_id=auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.current_order_amount_received(p_order_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select greatest(coalesce((select r.amount_received from public.order_pricing_revisions r
    where r.order_id=o.id and r.user_id=o.user_id order by r.revision desc limit 1),0),
    case when o.payment_status='paid' then o.order_total
      when o.payment_status='deposit_paid' then greatest(0,o.order_total-o.balance_amount)
      else 0 end)
  from public.orders o where o.id=p_order_id and o.user_id=auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.complete_production_job(p_job_id uuid, p_status text DEFAULT 'completed'::text, p_actual_machine text DEFAULT NULL::text, p_actual_quantity numeric DEFAULT NULL::numeric, p_actual_print_hours numeric DEFAULT NULL::numeric, p_actual_grams_used numeric DEFAULT NULL::numeric, p_actual_filament_breakdown text DEFAULT NULL::text, p_close_note text DEFAULT NULL::text, p_add_finished_good boolean DEFAULT false, p_skip_inventory_reduction boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'complete_production_job is retired; use production_workflow_command for workflow transitions and a future reviewed Inventory command for inventory consumption'
    using errcode = '2F000',
          hint = 'This legacy RPC bypassed ERP Blueprint v1 workflow authority and Inventory command ownership.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_production_job(p_job_id uuid, p_status text DEFAULT 'completed'::text, p_close_outcome text DEFAULT 'completed'::text, p_closed_note text DEFAULT NULL::text, p_actual_machine text DEFAULT NULL::text, p_actual_print_hours numeric DEFAULT 0, p_filament_usage jsonb DEFAULT '[]'::jsonb, p_add_to_finished_goods boolean DEFAULT false, p_finished_good_name text DEFAULT NULL::text, p_finished_good_category text DEFAULT 'craft_show_stock'::text, p_finished_good_sale_price numeric DEFAULT 0, p_finished_good_quantity integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'complete_production_job is retired; use production_workflow_command for workflow transitions and a future reviewed Inventory command for inventory consumption'
    using errcode = '2F000',
          hint = 'This legacy RPC bypassed ERP Blueprint v1 workflow authority and Inventory command ownership.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revise_order_pricing(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_command_id text, p_reason text, p_totals jsonb)
 RETURNS SETOF orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_prior public.order_pricing_revisions%rowtype;
  v_item jsonb; v_key text; v_qty integer:=0; v_subtotal numeric:=0; v_received numeric; v_total numeric;
  v_rate numeric; v_revision integer; v_now timestamptz:=statement_timestamp();
begin
  if v_actor is null then raise exception 'Authenticated order owner is required' using errcode='42501'; end if;
  if p_expected_updated_at is null or nullif(btrim(p_command_id),'') is null or length(p_command_id)>200
    or nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then
    raise exception 'Order version, command identity, and reason are required' using errcode='22023'; end if;
  select * into v_order from public.orders where id=p_order_id and user_id=v_actor for update;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;
  select * into v_prior from public.order_pricing_revisions where command_id=p_command_id;
  if found then
    if v_prior.user_id<>v_actor or v_prior.order_id<>p_order_id or v_prior.totals is distinct from p_totals or v_prior.reason is distinct from btrim(p_reason) then
      raise exception 'Pricing command identity already used with different changes' using errcode='22023'; end if;
    return next v_order; return;
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order changed; refresh before revising pricing' using errcode='40001'; end if;
  if lower(coalesce(v_order.status,'')) in ('closed','fulfilled','cancelled','canceled','void') or coalesce(v_order.finance_pushed,false)
    or exists(select 1 from public.financial_entries where order_id=v_order.id and finance_command='post_order_income') then
    raise exception 'Closed or Finance-posted orders require a Finance correction' using errcode='55000'; end if;
  if v_order.payment_status='refunded' then raise exception 'Review refunded payments before revising this order' using errcode='55000'; end if;
  if jsonb_typeof(p_totals) is distinct from 'object' or jsonb_typeof(p_totals->'line_items') is distinct from 'array' then
    raise exception 'Itemized pricing snapshot is required' using errcode='22023'; end if;
  if jsonb_array_length(p_totals->'line_items') not between 1 and 100 then raise exception 'Use between 1 and 100 items' using errcode='22023'; end if;
  foreach v_key in array array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total','piece_price','shipping','shipping_charged','rounding_adjustment'] loop
    if jsonb_typeof(p_totals->v_key) is distinct from 'number' or (p_totals->>v_key) !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Invalid pricing field: %',v_key using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(p_totals->'shipping_deferred') is distinct from 'boolean'
    or p_totals->>'shipping_in_taxable_subtotal' is distinct from 'true' then
    raise exception 'Shipping treatment is required' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_totals->'line_items') loop
    if nullif(btrim(v_item->>'id'),'') is null or nullif(btrim(v_item->>'description'),'') is null or length(v_item->>'description')>500 then
      raise exception 'Every item needs an identity and description' using errcode='22023'; end if;
    foreach v_key in array array['quantity','unit_price','line_total'] loop
      if jsonb_typeof(v_item->v_key) is distinct from 'number' or (v_item->>v_key) !~ '^[0-9]+([.][0-9]+)?$' then
        raise exception 'Invalid item field: %',v_key using errcode='22023'; end if;
    end loop;
    if (v_item->>'quantity')::numeric<1 or (v_item->>'quantity')::numeric<>trunc((v_item->>'quantity')::numeric)
      or round((v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric,2)<>(v_item->>'line_total')::numeric then
      raise exception 'Item quantities and amounts do not reconcile' using errcode='22023'; end if;
    v_qty:=v_qty+(v_item->>'quantity')::integer;
    v_subtotal:=v_subtotal+(v_item->>'line_total')::numeric;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_totals->'line_items'))<>jsonb_array_length(p_totals->'line_items') then
    raise exception 'Item identities must be unique' using errcode='22023'; end if;
  v_rate:=case when coalesce(v_order.tax_exempt,false) then 0 else coalesce(v_order.sales_tax_rate,(public.current_order_commercial_totals(v_order.id)->>'tax_rate')::numeric) end;
  if v_rate is null or v_rate<0 or v_rate>20 or v_rate<>(p_totals->>'tax_rate')::numeric then
    raise exception 'Use the saved order tax rate; refresh after saving tax metadata' using errcode='22023'; end if;
  if coalesce(v_order.tax_exempt,false) and nullif(btrim(v_order.tax_exempt_reason),'') is null then
    raise exception 'Save the exemption reason before revising pricing' using errcode='22023'; end if;
  v_total:=(p_totals->>'final_total')::numeric;
  if v_qty<>(p_totals->>'quantity')::numeric or v_subtotal<>(p_totals->>'subtotal')::numeric
    or (p_totals->>'discount')::numeric>v_subtotal
    or round(v_subtotal-(p_totals->>'discount')::numeric+(p_totals->>'shipping')::numeric,2)<>(p_totals->>'taxable_subtotal')::numeric
    or round((p_totals->>'taxable_subtotal')::numeric*v_rate/100,2)<>(p_totals->>'tax')::numeric
    or (p_totals->>'taxable_subtotal')::numeric+(p_totals->>'tax')::numeric<>v_total
    or (p_totals->>'shipping')::numeric<>(p_totals->>'shipping_charged')::numeric
    or ((p_totals->>'shipping_deferred')::boolean and (p_totals->>'shipping')::numeric<>0)
    or (p_totals->>'rounding_adjustment')::numeric<>0 or (p_totals->>'deposit')::numeric<>0 or (p_totals->>'balance')::numeric<>v_total then
    raise exception 'Pricing totals do not reconcile' using errcode='22023'; end if;
  v_received:=public.current_order_amount_received(v_order.id);
  select coalesce(max(revision),0)+1 into v_revision from public.order_pricing_revisions where order_id=v_order.id;
  insert into public.order_pricing_revisions(user_id,order_id,revision,command_id,reason,totals,amount_received)
    values(v_actor,v_order.id,v_revision,p_command_id,btrim(p_reason),p_totals,v_received);
  update public.orders set quantity=v_qty,order_total=v_total,taxable_subtotal=(p_totals->>'taxable_subtotal')::numeric,
    sales_tax_rate=v_rate,sales_tax_amount=(p_totals->>'tax')::numeric,
    balance_amount=greatest(0,v_total-v_received),
    payment_status=case when v_received>=v_total then 'paid' when v_received>0 then 'deposit_paid' when payment_status='deposit_due' then 'deposit_due' else 'unpaid' end,
    paid_date=case when v_received>=v_total then paid_date else null end,updated_at=v_now
    where id=v_order.id returning * into v_order;
  update public.order_tracking_public set order_total=v_order.order_total,payment_status=v_order.payment_status,
    paid_date=v_order.paid_date,updated_at=v_now where order_number=v_order.order_number and user_id=v_actor;
  if not found then raise exception 'Tracking projection missing; pricing revision was not saved' using errcode='40001'; end if;
  return next v_order;
end $function$
;

CREATE OR REPLACE FUNCTION public.public_order_tracking_lookup(tracking_identifier text)
 RETURNS TABLE(order_number text, order_title text, status text, payment_status text, order_total numeric, deposit_amount numeric, balance_amount numeric, public_status_text text, public_next_step text, shipping_or_pickup_note text, tracking_number text, payment_link text, payment_link_stripe text, payment_link_paypal text, payment_link_venmo text, paid_date date, po_number text, invoice_number text, invoice_terms text, shipping_charged numeric, shipping_deferred boolean, credit_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with matches as (
    select o.*,count(*) over() match_count from public.orders o
    where case
      when upper(trim(tracking_identifier)) ~ '^OP-[0-9]{1,6}$' then o.order_number='OP-'||lpad(substring(upper(trim(tracking_identifier)) from 4),6,'0')
      when upper(trim(tracking_identifier)) ~ '^Q-[0-9]{1,6}$' then regexp_replace(o.source_quote_number,'^Q-0*','')=regexp_replace(upper(trim(tracking_identifier)),'^Q-0*','')
      else false end
  )
  select o.order_number::text,otp.order_title::text,otp.status::text,o.payment_status::text,o.order_total::numeric,
    o.deposit_amount::numeric,o.balance_amount::numeric,otp.public_status_text::text,otp.public_next_step::text,
    otp.shipping_or_pickup_note::text,otp.tracking_number::text,otp.payment_link::text,otp.payment_link_stripe::text,
    otp.payment_link_paypal::text,otp.payment_link_venmo::text,o.paid_date::date,otp.po_number::text,o.invoice_number::text,otp.invoice_terms::text,
    coalesce((t.totals->>'shipping_charged')::numeric,(t.totals->>'shipping')::numeric,0),
    coalesce((t.totals->>'shipping_deferred')::boolean,false),greatest(0,coalesce(r.amount_received,0)-o.order_total)
  from matches o join public.order_tracking_public otp on otp.order_number=o.order_number and otp.user_id=o.user_id
  left join lateral (select totals,amount_received from public.order_pricing_revisions where order_id=o.id and user_id=o.user_id order by revision desc limit 1) r on true
  left join lateral (select coalesce(snapshot->'invoice_totals',snapshot#>'{offer,quote_data,customer_totals}',snapshot#>'{offer,customer_totals}') totals
    from public.quote_accepted_commercial_snapshots where user_id=o.user_id and order_number=o.order_number limit 1) s on true
  cross join lateral (select coalesce(r.totals,s.totals) totals) t
  where o.match_count=1 limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.post_order_finance_income(p_order_id uuid, p_order_number text, p_expected_updated_at timestamp with time zone, p_correlation_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_entry public.financial_entries%rowtype;
  v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'Authenticated owner is required'; end if;
  if p_order_id is null or nullif(btrim(p_order_number),'') is null then raise exception 'Order UUID and Order number are required'; end if;
  if p_expected_updated_at is null then raise exception 'p_expected_updated_at is required'; end if;
  if nullif(btrim(p_correlation_id),'') is null then raise exception 'Immutable Finance command identity is required'; end if;

  perform pg_advisory_xact_lock(hashtext('finance-order-posting:' || p_correlation_id));

  select * into v_entry from public.financial_entries where finance_command_id = p_correlation_id for update;
  if found then
    if v_entry.user_id is distinct from v_actor or v_entry.order_id is distinct from p_order_id or v_entry.order_number is distinct from p_order_number or v_entry.finance_command is distinct from 'post_order_income' then
      raise exception 'Finance command identity is already used for another owner, Order, entry, or command';
    end if;
    return jsonb_build_object('idempotent', true, 'entry_id', v_entry.id, 'order_id', v_entry.order_id, 'order_number', v_entry.order_number, 'snapshot', v_entry.accepted_commercial_snapshot);
  end if;

  select * into v_order from public.orders where id = p_order_id and order_number = p_order_number and user_id = v_actor for update;
  if not found then raise exception 'Order not found for authenticated owner'; end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order changed; refresh before posting Finance'; end if;

  select * into v_entry from public.financial_entries where user_id = v_actor and order_id = p_order_id and finance_command = 'post_order_income' and finance_command_owned is true for update;
  if found then raise exception 'Order income has already been posted to Finance'; end if;

  v_snapshot := jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number, 'order_total', coalesce(v_order.order_total,0),
    'deposit_amount', coalesce(v_order.deposit_amount,0), 'balance_amount', coalesce(v_order.balance_amount,0),
    'tax_exempt', coalesce(v_order.tax_exempt,false), 'payment_status', v_order.payment_status,
    'paid_date', v_order.paid_date, 'invoice_number', v_order.invoice_number,
    'source', 'accepted_order_snapshot_from_orders_not_mutable_quote_recalculation'
  );

  insert into public.financial_entries(
    user_id, type, entry_date, category, tax_category, title, notes, amount, original_amount,
    vendor_name, payment_method, business_use_percent, shipping_charged, sales_tax_collected, tax_exempt_sale,
    shipping_cost, material_cost, packaging_cost, labor_cost, other_direct_cost,
    order_id, order_number, finance_command_id, finance_command, finance_command_owned,
    posted_by, posted_at, accepted_commercial_snapshot
  ) values (
    v_actor, 'income', coalesce(v_order.paid_date, current_date), 'Sale', 'income_sales',
    'Order income - ' || p_order_number,
    'Authoritative Finance command posting for Order ' || p_order_number || '. Corrections must be append-only.',
    coalesce(v_order.order_total,0), coalesce(v_order.order_total,0),
    v_order.customer_name, coalesce(v_order.payment_status,''), 100, 0, 0, coalesce(v_order.tax_exempt,false),
    0, 0, 0, 0, 0,
    p_order_id, p_order_number, p_correlation_id, 'post_order_income', true,
    v_actor, statement_timestamp(), v_snapshot
  ) returning * into v_entry;

  update public.orders
     set finance_pushed = true,
         finance_pushed_at = statement_timestamp(),
         internal_notes = concat_ws(E'\n\n', nullif(v_order.internal_notes,''), 'Finance entry ' || v_entry.id || ' posted by authoritative command at ' || statement_timestamp()::text)
   where id = v_order.id and user_id = v_actor;

  return jsonb_build_object('idempotent', false, 'entry_id', v_entry.id, 'order_id', v_entry.order_id, 'order_number', v_entry.order_number, 'snapshot', v_entry.accepted_commercial_snapshot);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.append_finance_correction(p_original_entry_id uuid, p_command text, p_amount numeric, p_reason text, p_correlation_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_original public.financial_entries%rowtype;
  v_entry public.financial_entries%rowtype;
  v_command text := lower(btrim(coalesce(p_command,'')));
begin
  if v_actor is null then raise exception 'Authenticated owner is required'; end if;
  if p_original_entry_id is null then raise exception 'Original Finance entry UUID is required'; end if;
  if v_command not in ('reverse','correct') then raise exception 'Finance correction command must be reverse or correct'; end if;
  if p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Correction amount must be greater than zero and finite'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Correction reason is required'; end if;
  if nullif(btrim(p_correlation_id),'') is null then raise exception 'Immutable Finance command identity is required'; end if;

  perform pg_advisory_xact_lock(hashtext('finance-correction:' || p_correlation_id));
  select * into v_entry from public.financial_entries where finance_command_id = p_correlation_id for update;
  if found then
    if v_entry.user_id is distinct from v_actor
       or v_entry.correction_of_entry_id is distinct from p_original_entry_id
       or v_entry.finance_command is distinct from (
         case
           when v_command = 'reverse' then 'reverse_entry'
           else 'correct_entry'
         end
       )
    then
      raise exception 'Finance command identity is already used for another owner, Order, entry, or command';
    end if;
    return jsonb_build_object('idempotent', true, 'entry_id', v_entry.id, 'original_entry_id', p_original_entry_id);
  end if;

  select * into v_original from public.financial_entries where id = p_original_entry_id and user_id = v_actor for update;
  if not found then raise exception 'Original Finance entry not found for authenticated owner'; end if;
  if v_original.correction_of_entry_id is not null or v_original.reversal_of_entry_id is not null then raise exception 'Correction entries cannot be reversed or corrected again'; end if;
  if v_command = 'reverse' and exists (select 1 from public.financial_entries where user_id = v_actor and reversal_of_entry_id = p_original_entry_id for update) then
    raise exception 'Finance entry has already been reversed';
  end if;

  insert into public.financial_entries(
    user_id, type, entry_date, category, tax_category, title, notes, amount, original_amount,
    vendor_name, payment_method, business_use_percent, shipping_charged, sales_tax_collected, tax_exempt_sale,
    shipping_cost, material_cost, packaging_cost, labor_cost, other_direct_cost,
    order_id, order_number, finance_command_id, finance_command, finance_command_owned,
    correction_of_entry_id, reversal_of_entry_id, posted_by, posted_at, correction_reason, accepted_commercial_snapshot
  ) values (
    v_actor, v_original.type, current_date, coalesce(v_original.category,'Correction'), v_original.tax_category,
    case when v_command='reverse' then 'Reversal - ' else 'Correction - ' end || coalesce(v_original.title, p_original_entry_id::text),
    'Append-only Finance correction for original entry ' || p_original_entry_id || ': ' || p_reason,
    -abs(p_amount), -abs(p_amount), v_original.vendor_name, v_original.payment_method, coalesce(v_original.business_use_percent,100),
    0, 0, coalesce(v_original.tax_exempt_sale,false), 0, 0, 0, 0, 0,
    v_original.order_id, v_original.order_number, p_correlation_id, case when v_command='reverse' then 'reverse_entry' else 'correct_entry' end, true,
    p_original_entry_id, case when v_command='reverse' then p_original_entry_id else null end,
    v_actor, statement_timestamp(), p_reason, coalesce(v_original.accepted_commercial_snapshot,'{}'::jsonb) || jsonb_build_object('corrected_original_entry_id', p_original_entry_id)
  ) returning * into v_entry;

  return jsonb_build_object('idempotent', false, 'entry_id', v_entry.id, 'original_entry_id', p_original_entry_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.version_accepted_invoice_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_customer_totals jsonb := coalesce(new.snapshot #> '{offer,quote_data,customer_totals}', new.snapshot #> '{offer,customer_totals}');
  v_complete boolean;
begin
  v_complete := jsonb_typeof(v_customer_totals) = 'object'
    and v_customer_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total'];
  if v_complete then
    -- Copy already-calculated Quote values. This trigger is deliberately not a calculator.
    new.snapshot := new.snapshot || jsonb_build_object(
      'invoice_totals_schema_version', 1,
      'invoice_totals', v_customer_totals,
      'totals', coalesce(new.snapshot->'totals','{}'::jsonb) || v_customer_totals
    );
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_public_campaign(p_campaign_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_slug text := lower(trim(coalesce(p_campaign_slug,''))); v_payload jsonb;
begin
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then raise exception 'Invalid campaign slug' using errcode='22023'; end if;
  select jsonb_build_object(
    'campaign_slug',c.campaign_slug,'campaign_code',c.campaign_code,'name',c.name,'organization_name',c.organization_name,
    'public_description',c.public_description,
    'status',case when c.status='active' and c.ends_at is not null and c.ends_at<=now() then 'closed' else c.status end,
    'starts_at',c.starts_at,'ends_at',c.ends_at,
    'public_config',jsonb_strip_nulls(jsonb_build_object(
      'fulfillment_options',c.public_config->'fulfillment_options','payment_options',c.public_config->'payment_options',
      'customer_disclosures',c.public_config->'customer_disclosures','terms_version',c.public_config->>'terms_version',
      'payment_link',c.public_config->>'payment_link','payment_link_label',c.public_config->>'payment_link_label',
      'support_contact',c.public_config->>'support_contact')),
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'campaign_product_id',p.id,'campaign_sku',p.campaign_sku,'display_name',p.display_name,'public_description',p.public_description,
      'display_order',p.display_order,'standard_customer_price',p.standard_customer_price,'personalized_customer_price',p.personalized_customer_price,
      'personalization_enabled',p.personalization_enabled,'personalization_instructions',p.personalization_instructions,
      'personalization_limits',p.personalization_limits,'variant_config',p.variant_config,'customer_disclosures',p.customer_disclosures,
      'image_url',p.image_url) order by p.display_order,p.campaign_sku)
      from public.campaign_products p where p.campaign_id=c.id and p.enabled=true),'[]'::jsonb)
  ) into v_payload from public.campaigns c
  where c.campaign_slug=v_slug and c.status in ('scheduled','active','closed')
    and (c.starts_at is null or c.starts_at<=now() or c.status='scheduled') limit 1;
  return v_payload;
end $function$
;

CREATE OR REPLACE FUNCTION public.link_recipe_manifest_revision(p_recipe_id uuid, p_asset_revision_id uuid, p_manifest_role text)
 RETURNS asset_links
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_owner uuid:=auth.uid(); v_link public.asset_links;
begin
  if v_owner is null or p_manifest_role not in ('source_design','export_mesh','slicer_project','reference_image','setup_document','quality_reference','packaging_reference') then raise exception 'Access denied'; end if;
  if not exists(select 1 from public.product_recipes where id=p_recipe_id and user_id=v_owner)
     or not exists(select 1 from public.asset_records where id=p_asset_revision_id and owner_id=v_owner and status='active') then raise exception 'Access denied'; end if;
  update public.asset_links set link_type='manifest:'||p_manifest_role||':historical'
   where owner_id=v_owner and record_type='recipe' and record_key=p_recipe_id::text
     and link_type='manifest:'||p_manifest_role||':current';
  insert into public.asset_links(owner_id,asset_revision_id,record_type,record_key,link_type)
   values(v_owner,p_asset_revision_id,'recipe',p_recipe_id::text,'manifest:'||p_manifest_role||':current')
   on conflict(asset_revision_id,record_type,record_key) do update set link_type=excluded.link_type
   returning * into v_link;
  return v_link;
end $function$
;

CREATE OR REPLACE FUNCTION public.transfer_accepted_quote_asset_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_quote public.quotes%rowtype;
begin
  if nullif(btrim(new.source_quote_number),'') is null then return new; end if;
  select * into v_quote from public.quotes
    where quote_number=new.source_quote_number and user_id=new.user_id;
  if not found then return new; end if;
  insert into public.asset_links(owner_id,asset_revision_id,record_type,record_key,link_type)
  select new.user_id,source.asset_revision_id,'order',new.id::text,'handoff'
  from public.asset_links source
  join public.asset_records asset on asset.id=source.asset_revision_id and asset.owner_id=new.user_id
  where source.owner_id=new.user_id and source.record_type='quote'
    and source.record_key=v_quote.id::text and asset.designation='customer_supplied'
    and asset.status='active'
  on conflict(asset_revision_id,record_type,record_key) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.reject_campaign_submission_snapshot_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_table_name = 'campaign_submission_items' then raise exception 'Campaign submission items are immutable' using errcode='55000'; end if;
  if old.accepted_total = 0 and old.subtotal = 0 and old.updated_at = old.created_at then return new; end if;
  if (to_jsonb(new) - array['review_status','internal_review_notes','reviewed_by','reviewed_at','replay_conflict_count','replay_conflict_at','conversion_status','conversion_reference','converted_order_id','converted_order_number','converted_by','converted_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['review_status','internal_review_notes','reviewed_by','reviewed_at','replay_conflict_count','replay_conflict_at','conversion_status','conversion_reference','converted_order_id','converted_order_number','converted_by','converted_at','updated_at']) then
    raise exception 'Campaign submission sale snapshot is immutable' using errcode='55000';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.preacceptance_production_command(p_job_id uuid, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb DEFAULT '{}'::jsonb, p_correlation_id text DEFAULT NULL::text, p_causation_id text DEFAULT NULL::text)
 RETURNS production_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.production_jobs%rowtype;
  v_command text := lower(btrim(coalesce(p_command,'')));
  v_to text;
  v_command_id text := nullif(btrim(p_correlation_id),'');
  v_job_lock_key bigint := hashtextextended('preacceptance-production-job:' || p_job_id::text, 0);
  v_command_lock_key bigint := hashtextextended('preacceptance-production-command:' || coalesce(nullif(btrim(p_correlation_id),''), ''), 0);
  v_quote_number text := nullif(btrim(p_payload->>'quote_number'),'');
  v_receipt public.workflow_command_receipts%rowtype;
  v_from text;
  v_lock_stage text := 'arguments';
  v_trace boolean := v_command_id like 'diagnostic:%';
  v_trace_fingerprint text := left(md5(coalesce(v_command_id,'')), 12);
begin
  if v_trace then perform set_config('application_name', format('olipoly-preacc s=function_enter j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
  if v_actor is null then raise exception 'Authentication is required for pre-acceptance Production commands' using errcode='28000'; end if;
  if p_job_id is null then raise exception 'p_job_id is required' using errcode='22004'; end if;
  if p_expected_updated_at is null then raise exception 'expected_updated_at is required' using errcode='22004'; end if;
  if v_command_id is null then raise exception 'p_correlation_id command identity is required' using errcode='22004'; end if;
  if v_trace then perform set_config('application_name', format('olipoly-preacc s=arguments_validated j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
  -- Secondary defense only: same-job pre-acceptance requests must be rejected by
  -- the try-lock below before they can wait on a receipt, tuple, or transaction lock.
  perform set_config('lock_timeout', '2s', true);

  -- Concurrency is scoped to the Production aggregate, not the command identity.
  -- A stable 64-bit key is derived from the UUID's canonical text plus a domain
  -- prefix. Different correlation IDs for one job therefore contend here.
  if not pg_try_advisory_xact_lock(v_job_lock_key) then
    raise exception 'Pre-acceptance Production job lock is already held.'
      using errcode='55P03',
            detail=format('lockScope=job jobId=%s lockKey=%s', p_job_id, v_job_lock_key),
            hint='Another transaction owns the job-scoped advisory lock; inspect the matching key and refresh before retrying.';
  end if;
  if v_trace then perform set_config('application_name', format('olipoly-preacc s=job_try_lock_acquired j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;

  -- Command identity remains a separate idempotency concept. This second
  -- nonblocking lock prevents concurrent reuse of one identity across jobs from
  -- waiting on the receipt primary key. Blocking advisory locks are forbidden.
  if not pg_try_advisory_xact_lock(v_command_lock_key) then
    raise exception 'Pre-acceptance command identity lock is already held.'
      using errcode='55P03',
            detail=format('lockScope=command jobId=%s lockKey=%s', p_job_id, v_command_lock_key),
            hint='Another transaction owns the command-identity advisory lock; inspect the matching key and refresh before retrying.';
  end if;
  if v_trace then perform set_config('application_name', format('olipoly-preacc s=command_try_lock_acquired j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;

  -- Receipts are immutable technical outcomes keyed by command_identity. The
  -- advisory command lock serializes creation/replay, so FOR UPDATE is needless.
  begin
    v_lock_stage := 'receipt_lookup';
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=receipt_lookup_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    select * into v_receipt from public.workflow_command_receipts where command_identity = v_command_id;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=receipt_lookup_completed j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    if found then
      if v_receipt.owner_id is distinct from v_actor or v_receipt.production_job_id is distinct from p_job_id or v_receipt.command is distinct from v_command then
        raise exception 'Command identity is already used for a different pre-acceptance Production command' using errcode='23505';
      end if;
      v_lock_stage := 'receipt_replay_production_row';
      if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_row_lock_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
      select * into v_job from public.production_jobs where id = v_receipt.production_job_id and user_id = v_actor for update nowait;
      if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_row_lock_acquired j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
      if not found then raise exception 'Pre-acceptance command receipt no longer matches Production owner/job' using errcode='40001'; end if;
      if v_trace then perform set_config('application_name', format('olipoly-preacc s=function_returning j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
      return v_job;
    end if;

    v_lock_stage := 'production_row';
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_row_lock_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    select * into v_job from public.production_jobs where id = p_job_id for update nowait;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_row_lock_acquired j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    if not found or v_job.user_id is distinct from v_actor then raise exception 'Production job not found for authenticated owner' using errcode='42501'; end if;
    if v_job.order_number is not null then raise exception 'Pre-acceptance command cannot mutate linked Order work' using errcode='22023'; end if;
    if v_job.production_status not in ('estimate','waiting_customer') then raise exception 'Pre-acceptance Production command requires estimate or waiting_customer' using errcode='22023'; end if;
    if v_job.actual_grams_used is not null or v_job.scrap_grams is not null or v_job.actual_print_hours is not null or v_job.print_started_at is not null or v_job.completed_at is not null then raise exception 'Pre-acceptance command rejects actual or completion evidence' using errcode='22023'; end if;
    if v_job.updated_at is distinct from p_expected_updated_at then raise exception 'Production job changed since this page loaded; refresh before retrying' using errcode='40001'; end if;
    v_from := v_job.production_status;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=validations_complete j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;

    if v_command = 'mark_waiting_customer' then v_to := 'waiting_customer';
    elsif v_command = 'return_to_estimate' then v_to := 'estimate';
    else raise exception 'Invalid pre-acceptance Production command: %', p_command using errcode='22023'; end if;

    v_lock_stage := 'production_update';
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_update_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    update public.production_jobs
       set production_status = v_to,
           quote_number = coalesce(v_quote_number, quote_number),
           job_payload = coalesce(job_payload,'{}'::jsonb) || jsonb_build_object('production_status', v_to, 'quote_number', coalesce(v_quote_number, quote_number), 'updated_at', v_now),
           updated_at = v_now
     where id = v_job.id and user_id = v_actor
     returning * into v_job;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=production_update_complete j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    if not found then raise exception 'Pre-acceptance Production update affected no rows' using errcode='40001'; end if;

    v_lock_stage := 'receipt_insert';
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=receipt_insert_started j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    insert into public.workflow_command_receipts(command_identity, owner_id, production_job_id, command, from_state, to_state, resulting_updated_at, result_snapshot, created_at)
    values(v_command_id, v_actor, v_job.id, v_command, v_from, v_to, v_job.updated_at, to_jsonb(v_job), v_now);
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=receipt_insert_complete j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;
    if v_trace then perform set_config('application_name', format('olipoly-preacc s=function_returning j=%s c=%s', left(p_job_id::text,8), v_trace_fingerprint), true); end if;

    return v_job;
  exception
    when lock_not_available then
      if v_lock_stage in ('production_row','receipt_replay_production_row') then
        raise exception 'Production job row is busy in another operation.'
          using errcode='55P03',
                detail=format('lockScope=row_nowait stage=%s jobId=%s', v_lock_stage, p_job_id),
                hint='The nonblocking Production row lock found another transaction; inspect the row holder and refresh before retrying.';
      end if;
      raise exception 'Pre-acceptance database lock timeout.'
        using errcode='55P03',
              detail=format('lockScope=database_lock_timeout stage=%s jobId=%s', v_lock_stage, p_job_id),
              hint='A receipt, relation, update, trigger, index, or transaction lock exceeded the transaction-local two-second bound.';
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_campaign_submission(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_campaign public.campaigns%rowtype; v_product public.campaign_products%rowtype; v_existing public.campaign_submissions%rowtype;
  v_source text:=lower(trim(coalesce(p_request->>'source',''))); v_key text:=trim(coalesce(p_request->>'source_event_key','')); v_fingerprint text;
  v_submission_id uuid; v_product_id uuid; v_item jsonb; v_qty integer; v_personalized boolean; v_base numeric(12,2); v_extra numeric(12,2);
  v_subtotal numeric(12,2):=0; v_personalization numeric(12,2):=0; v_shipping numeric(12,2); v_count integer:=0; v_sequence integer:=0;
  v_customer jsonb:=coalesce(p_request->'customer','{}'); v_fulfillment text:=trim(coalesce(p_request->>'fulfillment_selection','')); v_payment text:=trim(coalesce(p_request->>'payment_method_selection',''));
  v_fulfillment_config jsonb; v_payment_config jsonb; v_seen text[]:='{}'; v_logical_key text;
begin
  if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>65536 then raise exception 'Invalid request' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_request) k where k<>all(array['source','source_event_key','source_schema_version','campaign_code','customer','fulfillment_selection','fulfillment','payment_method_selection','items','customer_notes','consent','source_metadata'])) then raise exception 'Unknown request field' using errcode='22023'; end if;
  if v_source !~ '^[a-z0-9][a-z0-9_-]{1,47}$' or length(v_key) not between 8 and 200 then raise exception 'Invalid source or source event key' using errcode='22023'; end if;
  if jsonb_typeof(p_request->'items')<>'array' or jsonb_array_length(p_request->'items') not between 1 and 25 then raise exception 'Item count is outside allowed range' using errcode='22023'; end if;
  if jsonb_typeof(v_customer)<>'object' or exists(select 1 from jsonb_object_keys(v_customer) k where k<>all(array['name','email','phone','organization'])) then raise exception 'Invalid customer contact' using errcode='22023'; end if;
  if length(trim(coalesce(v_customer->>'name',''))) not between 1 and 160 or length(coalesce(v_customer->>'email','')) not between 3 and 254 or lower(v_customer->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(coalesce(v_customer->>'phone',''))>30 or length(coalesce(v_customer->>'organization',''))>160 then raise exception 'Invalid customer contact' using errcode='22023'; end if;
  if length(coalesce(p_request->>'customer_notes',''))>1000 or jsonb_typeof(coalesce(p_request->'consent','{}'))<>'object' or coalesce((p_request->'consent'->>'acknowledged')::boolean,false) is not true then raise exception 'Invalid notes or consent' using errcode='22023'; end if;
  v_fingerprint:=encode(extensions.digest(convert_to((p_request-'source_metadata')::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.campaign_submissions where submission_source=v_source and source_event_key=v_key for update;
  if found then
    if v_existing.payload_fingerprint<>v_fingerprint then update public.campaign_submissions set replay_conflict_count=replay_conflict_count+1,replay_conflict_at=now(),updated_at=now() where id=v_existing.id; return jsonb_build_object('submission_reference',v_existing.public_reference,'status','conflicting_replay','rejected',true); end if;
    return jsonb_build_object('submission_reference',v_existing.public_reference,'status',v_existing.review_status);
  end if;
  select * into v_campaign from public.campaigns c where c.campaign_slug=lower(trim(p_request->>'campaign_code')) and c.status='active' and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now());
  if not found then raise exception 'Campaign is unavailable' using errcode='22023'; end if;
  if jsonb_typeof(v_campaign.public_config->'fulfillment_options')<>'array' or jsonb_array_length(v_campaign.public_config->'fulfillment_options')=0 or jsonb_typeof(v_campaign.public_config->'payment_options')<>'array' or jsonb_array_length(v_campaign.public_config->'payment_options')=0 then raise exception 'Campaign intake is not configured' using errcode='22023'; end if;
  select value into v_fulfillment_config from jsonb_array_elements(v_campaign.public_config->'fulfillment_options') where (case when jsonb_typeof(value)='string' then value#>>'{}' else coalesce(value->>'value',value->>'code') end)=v_fulfillment limit 1;
  select value into v_payment_config from jsonb_array_elements(v_campaign.public_config->'payment_options') where (case when jsonb_typeof(value)='string' then value#>>'{}' else coalesce(value->>'value',value->>'code') end)=v_payment limit 1;
  if v_fulfillment_config is null or v_payment_config is null or v_fulfillment not in ('event_pickup','local_pickup','shipping') or v_payment not in ('external_online','cash_at_event','pay_later') then raise exception 'Selection is unavailable' using errcode='22023'; end if;
  if v_fulfillment='shipping' then
    if jsonb_typeof(v_fulfillment_config)<>'object' or not(v_fulfillment_config?'shipping_amount') then raise exception 'Shipping is not configured' using errcode='22023'; end if;
    begin v_shipping:=(v_fulfillment_config->>'shipping_amount')::numeric(12,2); exception when others then raise exception 'Shipping is not configured' using errcode='22023'; end;
    if v_shipping<0 or jsonb_typeof(p_request->'fulfillment'->'shipping_address')<>'object' or length(trim(coalesce(p_request->'fulfillment'->'shipping_address'->>'street','')))=0 then raise exception 'Shipping details are invalid' using errcode='22023'; end if;
  end if;
  insert into public.campaign_submissions(user_id,campaign_id,submission_source,source_event_key,source_schema_version,payload_fingerprint,campaign_snapshot,customer_snapshot,fulfillment_selection,fulfillment_snapshot,payment_method_selection,payment_selection_snapshot,customer_notes,consent_snapshot,source_metadata,currency,subtotal,personalization_total,shipping_amount,accepted_total,item_count)
  values(v_campaign.user_id,v_campaign.id,v_source,v_key,coalesce(p_request->>'source_schema_version','1'),v_fingerprint,
    jsonb_build_object('campaign_id',v_campaign.id,'campaign_slug',v_campaign.campaign_slug,'campaign_code',v_campaign.campaign_code,'name',v_campaign.name,'organization_name',v_campaign.organization_name,'status',v_campaign.status,'pricing_schema_version',coalesce(v_campaign.public_config->>'pricing_schema_version','1')),
    jsonb_build_object('name',trim(v_customer->>'name'),'email',lower(trim(v_customer->>'email')),'phone',nullif(trim(v_customer->>'phone'),''),'organization',nullif(trim(v_customer->>'organization'),'')),v_fulfillment,
    jsonb_build_object('selection',v_fulfillment,'configured_option',v_fulfillment_config,'shipping_address',case when v_fulfillment='shipping' then p_request->'fulfillment'->'shipping_address' else null end),
    v_payment,jsonb_build_object('selection',v_payment,'configured_option',v_payment_config),nullif(trim(p_request->>'customer_notes'),''),p_request->'consent',jsonb_build_object('intake','generic_public_campaign'),'USD',0,0,v_shipping,0,1) returning id into v_submission_id;
  for v_item in select value from jsonb_array_elements(p_request->'items') loop
    if jsonb_typeof(v_item)<>'object' or exists(select 1 from jsonb_object_keys(v_item) k where k<>all(array['campaign_product_id','quantity','personalization_requested','personalization','variant','notes'])) or length(coalesce(v_item->>'notes',''))>500 then raise exception 'Invalid item fields' using errcode='22023'; end if;
    begin v_qty:=(v_item->>'quantity')::integer; v_product_id:=(v_item->>'campaign_product_id')::uuid; exception when others then raise exception 'Invalid item selection' using errcode='22023'; end;
    if v_qty not between 1 and 1000 then raise exception 'Quantity is outside allowed range' using errcode='22023'; end if;
    v_logical_key:=(v_item-array['quantity','notes'])::text; if v_logical_key=any(v_seen) then raise exception 'Duplicate item selection' using errcode='22023'; end if; v_seen:=array_append(v_seen,v_logical_key);
    begin v_personalized:=coalesce((v_item->>'personalization_requested')::boolean,false); exception when others then raise exception 'Invalid personalization selection' using errcode='22023'; end;
    select * into v_product from public.campaign_products p where p.id=v_product_id and p.campaign_id=v_campaign.id and p.enabled=true;
    if not found then raise exception 'Campaign product is unavailable' using errcode='22023'; end if;
    if v_personalized and (not v_product.personalization_enabled or v_product.personalized_customer_price is null) then raise exception 'Personalization is unavailable' using errcode='22023'; end if;
    if v_personalized and coalesce((v_product.personalization_limits->>'required')::boolean,false) and length(trim(coalesce(v_item->'personalization'->>'text','')))=0 then raise exception 'Required personalization is missing' using errcode='22023'; end if;
    if not v_personalized and coalesce(v_item->'personalization','{}')<>'{}'::jsonb then raise exception 'Personalization is unavailable' using errcode='22023'; end if;
    v_base:=v_product.standard_customer_price;v_extra:=case when v_personalized then v_product.personalized_customer_price-v_product.standard_customer_price else 0 end;v_subtotal:=v_subtotal+v_base*v_qty;v_personalization:=v_personalization+v_extra*v_qty;v_count:=v_count+v_qty;v_sequence:=v_sequence+1;
    insert into public.campaign_submission_items(campaign_submission_id,campaign_product_id,offer_snapshot,product_public_code,submitted_variant,quantity,personalization_requested,personalization_selection,authoritative_base_unit_price,authoritative_personalization_unit_price,authoritative_line_subtotal,item_notes,line_sequence)
    values(v_submission_id,v_product.id,jsonb_build_object('campaign_product_id',v_product.id,'product_code',v_product.campaign_sku,'title',v_product.display_name,'description',v_product.public_description,'variant_config',v_product.variant_config,'standard_unit_price',v_product.standard_customer_price,'personalized_unit_price',v_product.personalized_customer_price,'personalization_enabled',v_product.personalization_enabled,'personalization_instructions',v_product.personalization_instructions,'personalization_limits',v_product.personalization_limits,'customer_disclosures',v_product.customer_disclosures),v_product.campaign_sku,coalesce(v_item->'variant','{}'),v_qty,v_personalized,coalesce(v_item->'personalization','{}'),v_base,v_extra,(v_base+v_extra)*v_qty,nullif(trim(v_item->>'notes'),''),v_sequence);
  end loop;
  update public.campaign_submissions set subtotal=v_subtotal,personalization_total=v_personalization,accepted_total=v_subtotal+v_personalization+coalesce(v_shipping,0),item_count=v_count where id=v_submission_id;
  select * into v_existing from public.campaign_submissions where id=v_submission_id;return jsonb_build_object('submission_reference',v_existing.public_reference,'status','new');
exception when unique_violation then
  select * into v_existing from public.campaign_submissions where submission_source=v_source and source_event_key=v_key;
  if found and v_existing.payload_fingerprint=v_fingerprint then return jsonb_build_object('submission_reference',v_existing.public_reference,'status',v_existing.review_status); end if;
  raise exception 'Conflicting idempotency replay' using errcode='23505';
end $function$
;

CREATE OR REPLACE FUNCTION public.review_campaign_submission(p_submission_id uuid, p_next_status text, p_internal_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_current text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select review_status into v_current from public.campaign_submissions where id=p_submission_id and user_id=auth.uid() for update;
  if not found then raise exception 'Submission not found or unauthorized' using errcode='42501'; end if;
  if not ((v_current='new' and p_next_status in ('under_review','duplicate','rejected','cancelled')) or (v_current='under_review' and p_next_status in ('needs_clarification','approved_for_conversion','duplicate','rejected')) or (v_current='needs_clarification' and p_next_status in ('under_review','cancelled'))) then raise exception 'Invalid review transition: % to %',v_current,p_next_status using errcode='22023'; end if;
  update public.campaign_submissions set review_status=p_next_status,internal_review_notes=nullif(trim(p_internal_notes),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_submission_id;
  return jsonb_build_object('submission_id',p_submission_id,'review_status',p_next_status);
end $function$
;

CREATE OR REPLACE FUNCTION public.create_production_job_for_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype; v_job public.production_jobs%rowtype; v_now timestamptz := now();
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.user_id is distinct from v_actor then raise exception 'Order not found or access denied' using errcode='42501'; end if;
  select * into v_job from public.production_jobs where user_id=v_actor and order_number=v_order.order_number order by updated_at desc nulls last limit 1 for update;
  if found then return jsonb_build_object('outcome','already_linked','production_job_id',v_job.id,'order_number',v_order.order_number,'production_status',v_job.production_status); end if;
  insert into public.production_jobs(id,user_id,job_title,job_type,production_status,customer_name,order_number,quantity,job_payload,updated_at)
  values(gen_random_uuid(),v_actor,coalesce(nullif(v_order.order_title,''),'Order '||v_order.order_number),'customer_custom','ready_to_print',v_order.customer_name,v_order.order_number,coalesce(v_order.quantity,1),
    jsonb_build_object('source','order_handoff','order_id',v_order.id,'order_number',v_order.order_number,'campaign_submission_id',v_order.campaign_submission_id,'created_at',v_now),v_now)
  returning * into v_job;
  return jsonb_build_object('outcome','created','production_job_id',v_job.id,'order_number',v_order.order_number,'production_status',v_job.production_status);
end $function$
;

ALTER TABLE public."project_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."project_events" ALTER COLUMN "details" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."project_events" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."quote_accepted_commercial_snapshots" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."quote_accepted_commercial_snapshots" ALTER COLUMN "accepted_at" SET DEFAULT now();

ALTER TABLE public."quote_accepted_commercial_snapshots" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."finance_correction_receipts" ALTER COLUMN "correction_kind" SET DEFAULT 'metadata'::text;

ALTER TABLE public."finance_correction_receipts" ALTER COLUMN "changed_fields" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."finance_correction_receipts" ALTER COLUMN "effective_record" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."finance_correction_receipts" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."order_payment_command_receipts" ALTER COLUMN "created_at" SET DEFAULT statement_timestamp();

ALTER TABLE public."campaigns" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."campaigns" ALTER COLUMN "status" SET DEFAULT 'draft'::text;

ALTER TABLE public."campaigns" ALTER COLUMN "payment_mode" SET DEFAULT 'external_org_collects'::text;

ALTER TABLE public."campaigns" ALTER COLUMN "delivery_mode" SET DEFAULT 'organization_pickup'::text;

ALTER TABLE public."campaigns" ALTER COLUMN "branding_config" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."campaigns" ALTER COLUMN "public_config" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."campaigns" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."campaigns" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."document_counters" ALTER COLUMN "value" SET DEFAULT 0;

ALTER TABLE public."document_counters" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."campaign_products" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."campaign_products" ALTER COLUMN "display_order" SET DEFAULT 0;

ALTER TABLE public."campaign_products" ALTER COLUMN "enabled" SET DEFAULT true;

ALTER TABLE public."campaign_products" ALTER COLUMN "personalization_enabled" SET DEFAULT false;

ALTER TABLE public."campaign_products" ALTER COLUMN "personalization_limits" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."campaign_products" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."campaign_products" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."campaign_products" ALTER COLUMN "variant_config" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."campaign_products" ALTER COLUMN "fulfillment_options" SET DEFAULT '[]'::jsonb;

ALTER TABLE public."campaign_products" ALTER COLUMN "payment_options" SET DEFAULT '[]'::jsonb;

ALTER TABLE public."campaign_products" ALTER COLUMN "customer_disclosures" SET DEFAULT '[]'::jsonb;

ALTER TABLE public."production_linkage_audit" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."production_linkage_audit" ALTER COLUMN "evidence" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."production_linkage_audit" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."production_attempt_consumption_receipts" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."workflow_command_receipts" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."quotes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."quotes" ALTER COLUMN "quote_status" SET DEFAULT 'pending'::text;

ALTER TABLE public."quotes" ALTER COLUMN "quote_total" SET DEFAULT 0;

ALTER TABLE public."quotes" ALTER COLUMN "quote_data" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."quotes" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."quotes" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."quotes" ALTER COLUMN "confirmation_email_sent" SET DEFAULT false;

ALTER TABLE public."quotes" ALTER COLUMN "converted_to_order" SET DEFAULT false;

ALTER TABLE public."quotes" ALTER COLUMN "tax_exempt" SET DEFAULT false;

ALTER TABLE public."quotes" ALTER COLUMN "exemption_certificate_on_file" SET DEFAULT false;

ALTER TABLE public."quotes" ALTER COLUMN "po_file_on_file" SET DEFAULT false;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."inventory_transactions" ALTER COLUMN "user_id" SET DEFAULT auth.uid();

ALTER TABLE public."inventory_transactions" ALTER COLUMN "transaction_type" SET DEFAULT 'adjust'::text;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "qty_grams" SET DEFAULT 0;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "qty_units" SET DEFAULT 0;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "unit_cost" SET DEFAULT 0;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "total_cost" SET DEFAULT 0;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."inventory_transactions" ALTER COLUMN "quantity_delta" SET DEFAULT 0;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "unit" SET DEFAULT 'g'::text;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "date" SET DEFAULT now();

ALTER TABLE public."inventory_transactions" ALTER COLUMN "type" SET DEFAULT 'adjust'::text;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "item" SET DEFAULT ''::text;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "amount" SET DEFAULT ''::text;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "quantity" SET DEFAULT 0;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."inventory_transactions" ALTER COLUMN "occurred_at" SET DEFAULT now();

ALTER TABLE public."hub_reminders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."hub_reminders" ALTER COLUMN "user_id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."hub_reminders" ALTER COLUMN "recurrence" SET DEFAULT '''none'''::text;

ALTER TABLE public."hub_reminders" ALTER COLUMN "completed" SET DEFAULT false;

ALTER TABLE public."hub_reminders" ALTER COLUMN "completed_at" SET DEFAULT now();

ALTER TABLE public."hub_reminders" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."hub_reminders" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."hub_notes" ALTER COLUMN "user_id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."hub_notes" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."order_tracking_public" ALTER COLUMN "status" SET DEFAULT 'ready_to_print'::text;

ALTER TABLE public."order_tracking_public" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."production_material_reservations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."production_material_reservations" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."production_material_reservations" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."campaign_submission_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."campaign_submission_items" ALTER COLUMN "submitted_variant" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."campaign_submission_items" ALTER COLUMN "personalization_requested" SET DEFAULT false;

ALTER TABLE public."campaign_submission_items" ALTER COLUMN "personalization_selection" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."campaign_submission_items" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."catalog_parts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."catalog_parts" ALTER COLUMN "user_id" SET DEFAULT auth.uid();

ALTER TABLE public."catalog_parts" ALTER COLUMN "part_revision" SET DEFAULT 'Rev A'::text;

ALTER TABLE public."catalog_parts" ALTER COLUMN "reorder_eligible" SET DEFAULT true;

ALTER TABLE public."catalog_parts" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE public."catalog_parts" ALTER COLUMN "catalog_data" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."catalog_parts" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."catalog_parts" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."parts_catalog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."parts_catalog" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."parts_catalog" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."parts_catalog" ALTER COLUMN "revision" SET DEFAULT 'Rev A'::text;

ALTER TABLE public."parts_catalog" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE public."active_projects" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."active_projects" ALTER COLUMN "project_type" SET DEFAULT 'customer_request'::text;

ALTER TABLE public."active_projects" ALTER COLUMN "project_status" SET DEFAULT 'idea'::text;

ALTER TABLE public."active_projects" ALTER COLUMN "priority" SET DEFAULT 'normal'::text;

ALTER TABLE public."active_projects" ALTER COLUMN "quantity" SET DEFAULT 1;

ALTER TABLE public."active_projects" ALTER COLUMN "estimated_print_hours" SET DEFAULT 0;

ALTER TABLE public."active_projects" ALTER COLUMN "estimated_price" SET DEFAULT 0;

ALTER TABLE public."active_projects" ALTER COLUMN "machine_preference" SET DEFAULT 'either'::text;

ALTER TABLE public."active_projects" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."active_projects" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."orders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."orders" ALTER COLUMN "order_date" SET DEFAULT CURRENT_DATE;

ALTER TABLE public."orders" ALTER COLUMN "quantity" SET DEFAULT 1;

ALTER TABLE public."orders" ALTER COLUMN "order_total" SET DEFAULT 0;

ALTER TABLE public."orders" ALTER COLUMN "deposit_amount" SET DEFAULT 0;

ALTER TABLE public."orders" ALTER COLUMN "balance_amount" SET DEFAULT 0;

ALTER TABLE public."orders" ALTER COLUMN "status" SET DEFAULT 'ready_to_print'::text;

ALTER TABLE public."orders" ALTER COLUMN "payment_status" SET DEFAULT 'unpaid'::text;

ALTER TABLE public."orders" ALTER COLUMN "fulfillment" SET DEFAULT 'pickup'::text;

ALTER TABLE public."orders" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."orders" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."orders" ALTER COLUMN "completion_email_sent" SET DEFAULT false;

ALTER TABLE public."orders" ALTER COLUMN "invoice_sent" SET DEFAULT false;

ALTER TABLE public."orders" ALTER COLUMN "finance_pushed" SET DEFAULT false;

ALTER TABLE public."orders" ALTER COLUMN "created_from_quote" SET DEFAULT false;

ALTER TABLE public."orders" ALTER COLUMN "tax_exempt" SET DEFAULT false;

ALTER TABLE public."orders" ALTER COLUMN "exemption_certificate_on_file" SET DEFAULT false;

ALTER TABLE public."orders" ALTER COLUMN "po_file_on_file" SET DEFAULT false;

ALTER TABLE public."campaign_order_conversion_snapshots" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."campaign_order_conversion_snapshots" ALTER COLUMN "converted_at" SET DEFAULT now();

ALTER TABLE public."campaign_submissions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."campaign_submissions" ALTER COLUMN "public_reference" SET DEFAULT ('CS-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 12)));

ALTER TABLE public."campaign_submissions" ALTER COLUMN "source_schema_version" SET DEFAULT '1'::text;

ALTER TABLE public."campaign_submissions" ALTER COLUMN "payment_evidence_state" SET DEFAULT 'unverified'::text;

ALTER TABLE public."campaign_submissions" ALTER COLUMN "consent_snapshot" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."campaign_submissions" ALTER COLUMN "source_metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."campaign_submissions" ALTER COLUMN "currency" SET DEFAULT 'USD'::text;

ALTER TABLE public."campaign_submissions" ALTER COLUMN "review_status" SET DEFAULT 'new'::text;

ALTER TABLE public."campaign_submissions" ALTER COLUMN "replay_conflict_count" SET DEFAULT 0;

ALTER TABLE public."campaign_submissions" ALTER COLUMN "conversion_status" SET DEFAULT 'not_converted'::text;

ALTER TABLE public."campaign_submissions" ALTER COLUMN "submitted_at" SET DEFAULT now();

ALTER TABLE public."campaign_submissions" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."campaign_submissions" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."order_pricing_revisions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."order_pricing_revisions" ALTER COLUMN "created_at" SET DEFAULT statement_timestamp();

ALTER TABLE public."production_job_roll_usage" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."production_job_roll_usage" ALTER COLUMN "grams_used" SET DEFAULT 0;

ALTER TABLE public."production_job_roll_usage" ALTER COLUMN "finished_roll" SET DEFAULT false;

ALTER TABLE public."production_job_roll_usage" ALTER COLUMN "spool_freed" SET DEFAULT false;

ALTER TABLE public."production_job_roll_usage" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."production_jobs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."production_jobs" ALTER COLUMN "user_id" SET DEFAULT auth.uid();

ALTER TABLE public."production_jobs" ALTER COLUMN "job_category" SET DEFAULT 'custom_order'::text;

ALTER TABLE public."production_jobs" ALTER COLUMN "job_status" SET DEFAULT 'idea'::text;

ALTER TABLE public."production_jobs" ALTER COLUMN "priority" SET DEFAULT 'normal'::text;

ALTER TABLE public."production_jobs" ALTER COLUMN "target_machine" SET DEFAULT 'either'::text;

ALTER TABLE public."production_jobs" ALTER COLUMN "quantity_planned" SET DEFAULT 1;

ALTER TABLE public."production_jobs" ALTER COLUMN "quantity_completed" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "estimated_hours_per_unit" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "estimated_filaments" SET DEFAULT '[]'::jsonb;

ALTER TABLE public."production_jobs" ALTER COLUMN "creates_finished_good" SET DEFAULT false;

ALTER TABLE public."production_jobs" ALTER COLUMN "sale_price" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."production_jobs" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."production_jobs" ALTER COLUMN "quantity" SET DEFAULT 1;

ALTER TABLE public."production_jobs" ALTER COLUMN "machine_preference" SET DEFAULT 'either'::text;

ALTER TABLE public."production_jobs" ALTER COLUMN "colors_count" SET DEFAULT 1;

ALTER TABLE public."production_jobs" ALTER COLUMN "filament_plan" SET DEFAULT '[]'::jsonb;

ALTER TABLE public."production_jobs" ALTER COLUMN "estimated_grams_per_unit" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "add_to_finished_goods" SET DEFAULT false;

ALTER TABLE public."production_jobs" ALTER COLUMN "exclude_inventory_reduction" SET DEFAULT false;

ALTER TABLE public."production_jobs" ALTER COLUMN "finished_roll" SET DEFAULT false;

ALTER TABLE public."production_jobs" ALTER COLUMN "spool_freed" SET DEFAULT false;

ALTER TABLE public."production_jobs" ALTER COLUMN "roll_usages" SET DEFAULT '[]'::jsonb;

ALTER TABLE public."production_jobs" ALTER COLUMN "color_count" SET DEFAULT 1;

ALTER TABLE public."production_jobs" ALTER COLUMN "estimated_hours_each" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "estimated_grams_each" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "estimated_price_each" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "design_fee" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "post_processing_fee" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "estimated_material_cost" SET DEFAULT 0;

ALTER TABLE public."production_jobs" ALTER COLUMN "design_fee_mode" SET DEFAULT 'flat'::text;

ALTER TABLE public."production_jobs" ALTER COLUMN "post_processing_fee_mode" SET DEFAULT 'flat'::text;

ALTER TABLE public."production_jobs" ALTER COLUMN "supply_cost" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "user_id" SET DEFAULT auth.uid();

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "category" SET DEFAULT 'craft_show'::text;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "qty_on_hand" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "target_qty" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "reorder_threshold_qty" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "sale_price" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "estimated_hours_per_unit" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "material_recipe" SET DEFAULT '[]'::jsonb;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "status" SET DEFAULT 'active'::text;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "quantity_on_hand" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "target_quantity" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "reorder_threshold" SET DEFAULT 1;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "print_hours_per_unit" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "estimated_cost_per_unit" SET DEFAULT 0;

ALTER TABLE public."finished_goods_inventory" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE public."reusable_spool_pool" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."reusable_spool_pool" ALTER COLUMN "available_empty" SET DEFAULT 0;

ALTER TABLE public."reusable_spool_pool" ALTER COLUMN "mounted_in_use" SET DEFAULT 0;

ALTER TABLE public."reusable_spool_pool" ALTER COLUMN "retired" SET DEFAULT 0;

ALTER TABLE public."reusable_spool_pool" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."printer_pm" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."printer_pm" ALTER COLUMN "user_id" SET DEFAULT auth.uid();

ALTER TABLE public."printer_pm" ALTER COLUMN "pm_interval_days" SET DEFAULT 30;

ALTER TABLE public."printer_pm" ALTER COLUMN "hours_since_pm" SET DEFAULT 0;

ALTER TABLE public."printer_pm" ALTER COLUMN "pm_interval_hours" SET DEFAULT 250;

ALTER TABLE public."printer_pm" ALTER COLUMN "lifetime_hours" SET DEFAULT 0;

ALTER TABLE public."printer_pm" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE public."printer_pm" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."printer_pm" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."printer_pm" ALTER COLUMN "nozzle_hours" SET DEFAULT 0;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "user_id" SET DEFAULT auth.uid();

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "material_type" SET DEFAULT 'PLA'::text;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "starting_grams" SET DEFAULT 1000;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "remaining_grams" SET DEFAULT 1000;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "reorder_threshold_grams" SET DEFAULT 250;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "cost_per_spool" SET DEFAULT 0;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "status" SET DEFAULT 'active'::text;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "current_grams" SET DEFAULT 1000;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "spool_cost" SET DEFAULT 0;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "reserved_grams" SET DEFAULT 0;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "reorder_quantity" SET DEFAULT 1;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "roll_type" SET DEFAULT 'spool'::text;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "is_mounted" SET DEFAULT true;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "reusable_spool" SET DEFAULT true;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "roll_status" SET DEFAULT 'active'::text;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "color" SET DEFAULT ''::text;

ALTER TABLE public."raw_material_inventory" ALTER COLUMN "reorder_policy" SET DEFAULT 'auto'::text;

ALTER TABLE public."non_filament_materials" ALTER COLUMN "item_name" SET DEFAULT ''::text;

ALTER TABLE public."non_filament_materials" ALTER COLUMN "unit_type" SET DEFAULT 'each'::text;

ALTER TABLE public."non_filament_materials" ALTER COLUMN "quantity_on_hand" SET DEFAULT 0;

ALTER TABLE public."non_filament_materials" ALTER COLUMN "cost_per_unit" SET DEFAULT 0;

ALTER TABLE public."non_filament_materials" ALTER COLUMN "reorder_threshold" SET DEFAULT 0;

ALTER TABLE public."non_filament_materials" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."non_filament_materials" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."non_filament_materials" ALTER COLUMN "reorder_policy" SET DEFAULT 'auto'::text;

ALTER TABLE public."inventory_spool_pool" ALTER COLUMN "available_empty" SET DEFAULT 0;

ALTER TABLE public."inventory_spool_pool" ALTER COLUMN "retired" SET DEFAULT 0;

ALTER TABLE public."inventory_spool_pool" ALTER COLUMN "notes" SET DEFAULT ''::text;

ALTER TABLE public."inventory_spool_pool" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."inventory_settings" ALTER COLUMN "setting_value" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."inventory_settings" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."product_recipes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."product_recipes" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE public."product_recipes" ALTER COLUMN "default_quantity" SET DEFAULT 1;

ALTER TABLE public."product_recipes" ALTER COLUMN "manufacturing_snapshot" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."product_recipes" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."product_recipes" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."product_recipes" ALTER COLUMN "revision_history" SET DEFAULT '[]'::jsonb;

ALTER TABLE public."financial_entries" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."financial_entries" ALTER COLUMN "amount" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "shipping_charged" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "shipping_cost" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."financial_entries" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."financial_entries" ALTER COLUMN "material_cost" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "packaging_cost" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "labor_cost" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "other_direct_cost" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "tax_included" SET DEFAULT 'no'::text;

ALTER TABLE public."financial_entries" ALTER COLUMN "sales_tax_rate" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "sales_tax_collected" SET DEFAULT 0;

ALTER TABLE public."financial_entries" ALTER COLUMN "business_use_percent" SET DEFAULT 100;

ALTER TABLE public."financial_entries" ALTER COLUMN "round_trip" SET DEFAULT false;

ALTER TABLE public."financial_entries" ALTER COLUMN "tax_exempt_sale" SET DEFAULT false;

ALTER TABLE public."financial_entries" ALTER COLUMN "finance_command_owned" SET DEFAULT false;

ALTER TABLE public."financial_entries" ALTER COLUMN "accepted_commercial_snapshot" SET DEFAULT '{}'::jsonb;

ALTER TABLE public."asset_links" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."asset_links" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."asset_links" ALTER COLUMN "link_type" SET DEFAULT 'attachment'::text;

ALTER TABLE public."customers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."customers" ALTER COLUMN "tax_exempt" SET DEFAULT false;

ALTER TABLE public."customers" ALTER COLUMN "po_customer" SET DEFAULT false;

ALTER TABLE public."customers" ALTER COLUMN "lifetime_revenue" SET DEFAULT 0;

ALTER TABLE public."customers" ALTER COLUMN "order_count" SET DEFAULT 0;

ALTER TABLE public."customers" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."customers" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE public."asset_records" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE public."asset_records" ALTER COLUMN "revision" SET DEFAULT 1;

ALTER TABLE public."asset_records" ALTER COLUMN "uploaded_at" SET DEFAULT now();

ALTER TABLE public."asset_records" ALTER COLUMN "status" SET DEFAULT 'active'::text;

ALTER TABLE public."asset_records" ALTER COLUMN "designation" SET DEFAULT 'internal'::text;

ALTER TABLE public."asset_records" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE public."project_events" ADD CONSTRAINT "project_events_pkey" PRIMARY KEY (id);

ALTER TABLE public."quote_accepted_commercial_snapshots" ADD CONSTRAINT "quote_accepted_commercial_snapshots_customer_fields" CHECK (snapshot ? 'quote_number'::text AND snapshot ? 'totals'::text);

ALTER TABLE public."quote_accepted_commercial_snapshots" ADD CONSTRAINT "quote_accepted_commercial_snapshots_one_per_quote" UNIQUE (quote_number);

ALTER TABLE public."quote_accepted_commercial_snapshots" ADD CONSTRAINT "quote_accepted_commercial_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE public."finance_correction_receipts" ADD CONSTRAINT "finance_correction_receipts_pkey" PRIMARY KEY (command_identity);

ALTER TABLE public."order_payment_command_receipts" ADD CONSTRAINT "order_payment_command_receipts_command_check" CHECK (command = 'mark_paid'::text);

ALTER TABLE public."order_payment_command_receipts" ADD CONSTRAINT "order_payment_command_receipts_pkey" PRIMARY KEY (command_identity);

ALTER TABLE public."campaigns" ADD CONSTRAINT "campaigns_code_format" CHECK (campaign_code ~ '^[A-Z0-9][A-Z0-9-]{1,62}[A-Z0-9]$'::text);

ALTER TABLE public."campaigns" ADD CONSTRAINT "campaigns_delivery_mode_check" CHECK (delivery_mode = ANY (ARRAY['organization_pickup'::text, 'event_pickup'::text, 'customer_pickup'::text, 'shipping'::text, 'mixed'::text]));

ALTER TABLE public."campaigns" ADD CONSTRAINT "campaigns_payment_mode_check" CHECK (payment_mode = ANY (ARRAY['external_org_collects'::text, 'olipoly_collects'::text]));

ALTER TABLE public."campaigns" ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY (id);

ALTER TABLE public."campaigns" ADD CONSTRAINT "campaigns_slug_format" CHECK (campaign_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'::text);

ALTER TABLE public."campaigns" ADD CONSTRAINT "campaigns_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'active'::text, 'closed'::text, 'archived'::text]));

ALTER TABLE public."campaigns" ADD CONSTRAINT "campaigns_window_order" CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);

ALTER TABLE public."document_counters" ADD CONSTRAINT "document_counters_pkey" PRIMARY KEY (key);

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_check" CHECK (personalized_customer_price IS NULL OR personalized_customer_price >= standard_customer_price);

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_check1" CHECK (olipoly_personalized_share IS NULL OR olipoly_personalized_share >= olipoly_standard_share);

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_display_order_check" CHECK (display_order >= 0);

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_olipoly_standard_share_check" CHECK (olipoly_standard_share >= 0::numeric);

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_personalized_config" CHECK (personalization_enabled OR personalized_customer_price IS NULL);

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_pkey" PRIMARY KEY (id);

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_share_not_over_price" CHECK (olipoly_standard_share <= standard_customer_price AND (olipoly_personalized_share IS NULL OR personalized_customer_price IS NULL OR olipoly_personalized_share <= personalized_customer_price));

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_sku_format" CHECK (campaign_sku ~ '^[A-Z0-9][A-Z0-9-]{1,62}[A-Z0-9]$'::text);

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_standard_customer_price_check" CHECK (standard_customer_price >= 0::numeric);

ALTER TABLE public."production_linkage_audit" ADD CONSTRAINT "production_linkage_audit_command_identity_key" UNIQUE (command_identity);

ALTER TABLE public."production_linkage_audit" ADD CONSTRAINT "production_linkage_audit_event_type_check" CHECK (event_type = ANY (ARRAY['production_quote_linked'::text, 'production_order_linked'::text, 'legacy_linkage_repaired'::text, 'legacy_standalone_approved'::text]));

ALTER TABLE public."production_linkage_audit" ADD CONSTRAINT "production_linkage_audit_pkey" PRIMARY KEY (id);

ALTER TABLE public."production_attempt_consumption_receipts" ADD CONSTRAINT "production_attempt_consumptio_owner_id_production_job_id_at_key" UNIQUE (owner_id, production_job_id, attempt_id);

ALTER TABLE public."production_attempt_consumption_receipts" ADD CONSTRAINT "production_attempt_consumption_receipts_inventory_mode_check" CHECK (inventory_mode = ANY (ARRAY['included'::text, 'excluded'::text]));

ALTER TABLE public."production_attempt_consumption_receipts" ADD CONSTRAINT "production_attempt_consumption_receipts_pkey" PRIMARY KEY (command_identity);

ALTER TABLE public."workflow_command_receipts" ADD CONSTRAINT "workflow_command_receipts_command_check" CHECK (command <> ''::text);

ALTER TABLE public."workflow_command_receipts" ADD CONSTRAINT "workflow_command_receipts_pkey" PRIMARY KEY (command_identity);

ALTER TABLE public."quotes" ADD CONSTRAINT "quotes_pkey" PRIMARY KEY (id);

ALTER TABLE public."quotes" ADD CONSTRAINT "quotes_quote_number_key" UNIQUE (quote_number);

ALTER TABLE public."inventory_transactions" ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY (id);

ALTER TABLE public."inventory_transactions" ADD CONSTRAINT "inventory_transactions_type_check" CHECK (transaction_type = ANY (ARRAY['raw_purchase'::text, 'raw_usage'::text, 'raw_adjustment'::text, 'raw_scrap'::text, 'finished_add'::text, 'finished_sale'::text, 'finished_adjustment'::text, 'job_completion'::text, 'pm_reset'::text, 'production_attempt_consumption'::text, 'production_supply_consumption'::text]));

ALTER TABLE public."hub_reminders" ADD CONSTRAINT "hub_reminders_pkey" PRIMARY KEY (id);

ALTER TABLE public."hub_reminders" ADD CONSTRAINT "hub_reminders_recurrence_check" CHECK (recurrence = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text, 'monthly'::text]));

ALTER TABLE public."hub_notes" ADD CONSTRAINT "hub_notes_pkey" PRIMARY KEY (user_id);

ALTER TABLE public."order_tracking_public" ADD CONSTRAINT "order_tracking_public_order_number_key" UNIQUE (order_number);

ALTER TABLE public."order_tracking_public" ADD CONSTRAINT "order_tracking_public_pkey" PRIMARY KEY (order_number);

ALTER TABLE public."order_tracking_public" ADD CONSTRAINT "order_tracking_public_status_check" CHECK (status = ANY (ARRAY['ready_to_print'::text, 'printing'::text, 'qc'::text, 'ready_for_fulfillment'::text, 'closed'::text]));

ALTER TABLE public."production_material_reservations" ADD CONSTRAINT "production_material_reservations_pkey" PRIMARY KEY (id);

ALTER TABLE public."production_material_reservations" ADD CONSTRAINT "production_material_reservations_reserved_grams_check" CHECK (reserved_grams > 0::numeric AND (reserved_grams::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text])));

ALTER TABLE public."production_material_reservations" ADD CONSTRAINT "production_material_reservations_status_check" CHECK (status = ANY (ARRAY['active'::text, 'released'::text, 'consumed'::text]));

ALTER TABLE public."production_material_reservations" ADD CONSTRAINT "production_material_reservations_terminal_timestamp" CHECK (status = 'active'::text AND consumed_at IS NULL AND released_at IS NULL OR status = 'consumed'::text AND consumed_at IS NOT NULL AND released_at IS NULL OR status = 'released'::text AND released_at IS NOT NULL AND consumed_at IS NULL);

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_authoritative_base_unit_price_check" CHECK (authoritative_base_unit_price >= 0::numeric);

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_authoritative_line_subtotal_check" CHECK (authoritative_line_subtotal >= 0::numeric);

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_authoritative_personalization_u_check" CHECK (authoritative_personalization_unit_price >= 0::numeric);

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_campaign_submission_id_line_seque_key" UNIQUE (campaign_submission_id, line_sequence);

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_line_sequence_check" CHECK (line_sequence > 0);

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_pkey" PRIMARY KEY (id);

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_quantity_check" CHECK (quantity >= 1 AND quantity <= 1000);

ALTER TABLE public."catalog_parts" ADD CONSTRAINT "catalog_parts_part_key_key" UNIQUE (part_key);

ALTER TABLE public."catalog_parts" ADD CONSTRAINT "catalog_parts_pkey" PRIMARY KEY (id);

ALTER TABLE public."parts_catalog" ADD CONSTRAINT "parts_catalog_pkey" PRIMARY KEY (id);

ALTER TABLE public."active_projects" ADD CONSTRAINT "active_projects_pkey" PRIMARY KEY (id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_balance_amount_check" CHECK (balance_amount >= 0::numeric);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_campaign_customer_link_status_check" CHECK (campaign_customer_link_status IS NULL OR (campaign_customer_link_status = ANY (ARRAY['linked'::text, 'unresolved_review_required'::text])));

ALTER TABLE public."orders" ADD CONSTRAINT "orders_deposit_amount_check" CHECK (deposit_amount >= 0::numeric);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_destination_county_valid" CHECK (destination_county IS NULL OR is_ohio_county(destination_county)) NOT VALID;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_fulfillment_check" CHECK (fulfillment = ANY (ARRAY['pickup'::text, 'delivery'::text, 'shipping'::text]));

ALTER TABLE public."orders" ADD CONSTRAINT "orders_order_number_key" UNIQUE (order_number);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_order_total_check" CHECK (order_total >= 0::numeric);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_payment_status_check" CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'deposit_due'::text, 'deposit_paid'::text, 'paid'::text, 'refunded'::text]));

ALTER TABLE public."orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_quantity_check" CHECK (quantity >= 1);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_sales_tax_amount_valid" CHECK (sales_tax_amount IS NULL OR sales_tax_amount >= 0::numeric) NOT VALID;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_sales_tax_rate_valid" CHECK (sales_tax_rate IS NULL OR sales_tax_rate >= 0::numeric AND sales_tax_rate <= 20::numeric AND (sales_tax_rate::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))) NOT VALID;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_source_type_check" CHECK (source_type IS NULL OR (source_type = ANY (ARRAY['quote'::text, 'campaign'::text, 'authorized_other'::text])));

ALTER TABLE public."orders" ADD CONSTRAINT "orders_status_check" CHECK (status = ANY (ARRAY['ready_to_print'::text, 'printing'::text, 'qc'::text, 'ready_for_fulfillment'::text, 'closed'::text]));

ALTER TABLE public."orders" ADD CONSTRAINT "orders_taxable_subtotal_valid" CHECK (taxable_subtotal IS NULL OR taxable_subtotal >= 0::numeric) NOT VALID;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_user_id_order_number_key" UNIQUE (user_id, order_number);

ALTER TABLE public."campaign_order_conversion_snapshots" ADD CONSTRAINT "campaign_order_conversion_snapshots_campaign_submission_id_key" UNIQUE (campaign_submission_id);

ALTER TABLE public."campaign_order_conversion_snapshots" ADD CONSTRAINT "campaign_order_conversion_snapshots_order_id_key" UNIQUE (order_id);

ALTER TABLE public."campaign_order_conversion_snapshots" ADD CONSTRAINT "campaign_order_conversion_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE public."campaign_order_conversion_snapshots" ADD CONSTRAINT "campaign_order_snapshot_required" CHECK (snapshot ?& ARRAY['source'::text, 'campaign'::text, 'submission'::text, 'customer'::text, 'fulfillment'::text, 'payment_evidence'::text, 'totals'::text, 'items'::text]);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submission_conversion_consistent" CHECK (conversion_status = 'not_converted'::text AND conversion_reference IS NULL AND converted_order_id IS NULL AND converted_order_number IS NULL AND converted_by IS NULL AND converted_at IS NULL AND review_status <> 'converted'::text OR conversion_status = 'converted'::text AND conversion_reference IS NOT NULL AND converted_order_id IS NOT NULL AND converted_order_number IS NOT NULL AND converted_by IS NOT NULL AND converted_at IS NOT NULL AND review_status = 'converted'::text);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_accepted_total_check" CHECK (accepted_total >= 0::numeric);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_conversion_status_check" CHECK (conversion_status = ANY (ARRAY['not_converted'::text, 'converted'::text]));

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_currency_check" CHECK (currency ~ '^[A-Z]{3}$'::text);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_item_count_check" CHECK (item_count > 0);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_payload_fingerprint_check" CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_payment_evidence_state_check" CHECK (payment_evidence_state = ANY (ARRAY['unverified'::text, 'externally_reported'::text, 'operator_verified'::text, 'not_required'::text]));

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_personalization_total_check" CHECK (personalization_total >= 0::numeric);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_pkey" PRIMARY KEY (id);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_public_reference_key" UNIQUE (public_reference);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_replay_conflict_count_check" CHECK (replay_conflict_count >= 0);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_review_status_check" CHECK (review_status = ANY (ARRAY['new'::text, 'under_review'::text, 'needs_clarification'::text, 'approved_for_conversion'::text, 'rejected'::text, 'duplicate'::text, 'cancelled'::text, 'converted'::text]));

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_shipping_amount_check" CHECK (shipping_amount IS NULL OR shipping_amount >= 0::numeric);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_source_event_key_check" CHECK (length(source_event_key) >= 8 AND length(source_event_key) <= 200);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_submission_source_check" CHECK (submission_source ~ '^[a-z0-9][a-z0-9_-]{1,47}$'::text);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_submission_source_source_event_key_key" UNIQUE (submission_source, source_event_key);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_subtotal_check" CHECK (subtotal >= 0::numeric);

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_tax_amount_check" CHECK (tax_amount IS NULL OR tax_amount >= 0::numeric);

ALTER TABLE public."order_pricing_revisions" ADD CONSTRAINT "order_pricing_revisions_amount_received_check" CHECK (amount_received >= 0::numeric);

ALTER TABLE public."order_pricing_revisions" ADD CONSTRAINT "order_pricing_revisions_command_id_key" UNIQUE (command_id);

ALTER TABLE public."order_pricing_revisions" ADD CONSTRAINT "order_pricing_revisions_order_id_revision_key" UNIQUE (order_id, revision);

ALTER TABLE public."order_pricing_revisions" ADD CONSTRAINT "order_pricing_revisions_pkey" PRIMARY KEY (id);

ALTER TABLE public."order_pricing_revisions" ADD CONSTRAINT "order_pricing_revisions_reason_check" CHECK (length(btrim(reason)) >= 1 AND length(btrim(reason)) <= 2000);

ALTER TABLE public."order_pricing_revisions" ADD CONSTRAINT "order_pricing_revisions_revision_check" CHECK (revision > 0);

ALTER TABLE public."production_job_roll_usage" ADD CONSTRAINT "production_job_roll_usage_pkey" PRIMARY KEY (id);

ALTER TABLE public."production_jobs" ADD CONSTRAINT "production_jobs_category_check" CHECK (job_category = ANY (ARRAY['custom_order'::text, 'business_order'::text, 'craft_show_stock'::text, 'finished_goods_replenishment'::text, 'prototype_test'::text, 'personal_free'::text, 'marketing_display'::text, 'replacement_warranty'::text, 'internal_tooling'::text, 'failed_scrap_reprint'::text, 'other'::text]));

ALTER TABLE public."production_jobs" ADD CONSTRAINT "production_jobs_pkey" PRIMARY KEY (id);

ALTER TABLE public."production_jobs" ADD CONSTRAINT "production_jobs_priority_check" CHECK (priority = ANY (ARRAY['urgent'::text, 'high'::text, 'normal'::text, 'low'::text]));

ALTER TABLE public."production_jobs" ADD CONSTRAINT "production_jobs_source_type_check" CHECK (production_source_type IS NULL OR (production_source_type = ANY (ARRAY['legacy_repaired'::text, 'legacy_standalone'::text])));

ALTER TABLE public."production_jobs" ADD CONSTRAINT "production_jobs_status_check" CHECK (job_status = ANY (ARRAY['idea'::text, 'needs_details'::text, 'ready'::text, 'scheduled'::text, 'printing'::text, 'post_processing'::text, 'completed'::text, 'completed_to_inventory'::text, 'completed_order'::text, 'on_hold'::text, 'failed'::text, 'cancelled'::text, 'archived'::text]));

ALTER TABLE public."finished_goods_inventory" ADD CONSTRAINT "finished_goods_inventory_category_check" CHECK (category = ANY (ARRAY['craft_show'::text, 'seasonal'::text, 'custom_catalog'::text, 'sample_display'::text, 'online'::text, 'business_repeat'::text, 'other'::text]));

ALTER TABLE public."finished_goods_inventory" ADD CONSTRAINT "finished_goods_inventory_pkey" PRIMARY KEY (id);

ALTER TABLE public."finished_goods_inventory" ADD CONSTRAINT "finished_goods_inventory_status_check" CHECK (status = ANY (ARRAY['active'::text, 'low'::text, 'sold_out'::text, 'retired'::text]));

ALTER TABLE public."finished_goods_inventory" ADD CONSTRAINT "finished_goods_inventory_user_id_sku_key" UNIQUE (user_id, sku);

ALTER TABLE public."reusable_spool_pool" ADD CONSTRAINT "reusable_spool_pool_pkey" PRIMARY KEY (id);

ALTER TABLE public."printer_pm" ADD CONSTRAINT "printer_pm_pkey" PRIMARY KEY (id);

ALTER TABLE public."printer_pm" ADD CONSTRAINT "printer_pm_user_id_machine_name_key" UNIQUE (user_id, machine_name);

ALTER TABLE public."raw_material_inventory" ADD CONSTRAINT "raw_material_inventory_pkey" PRIMARY KEY (id);

ALTER TABLE public."raw_material_inventory" ADD CONSTRAINT "raw_material_inventory_status_check" CHECK (status = ANY (ARRAY['active'::text, 'low'::text, 'reorder'::text, 'out'::text, 'retired'::text]));

ALTER TABLE public."non_filament_materials" ADD CONSTRAINT "non_filament_materials_pkey" PRIMARY KEY (id);

ALTER TABLE public."inventory_spool_pool" ADD CONSTRAINT "inventory_spool_pool_pkey" PRIMARY KEY (user_id);

ALTER TABLE public."inventory_settings" ADD CONSTRAINT "inventory_settings_pkey" PRIMARY KEY (user_id, setting_key);

ALTER TABLE public."product_recipes" ADD CONSTRAINT "product_recipes_default_quantity_check" CHECK (default_quantity > 0);

ALTER TABLE public."product_recipes" ADD CONSTRAINT "product_recipes_pkey" PRIMARY KEY (id);

ALTER TABLE public."product_recipes" ADD CONSTRAINT "product_recipes_revision_number_check" CHECK (revision_number > 0);

ALTER TABLE public."product_recipes" ADD CONSTRAINT "product_recipes_user_id_recipe_key_revision_number_key" UNIQUE (user_id, recipe_key, revision_number);

ALTER TABLE public."financial_entries" ADD CONSTRAINT "financial_entries_pkey" PRIMARY KEY (id);

ALTER TABLE public."financial_entries" ADD CONSTRAINT "financial_entries_type_check" CHECK (type = ANY (ARRAY['income'::text, 'expense'::text]));

ALTER TABLE public."asset_links" ADD CONSTRAINT "asset_links_asset_revision_id_record_type_record_key_key" UNIQUE (asset_revision_id, record_type, record_key);

ALTER TABLE public."asset_links" ADD CONSTRAINT "asset_links_link_type_check" CHECK ((link_type = ANY (ARRAY['attachment'::text, 'handoff'::text])) OR link_type ~ '^manifest:(source_design|export_mesh|slicer_project|reference_image|setup_document|quality_reference|packaging_reference):(current|historical)$'::text);

ALTER TABLE public."asset_links" ADD CONSTRAINT "asset_links_pkey" PRIMARY KEY (id);

ALTER TABLE public."asset_links" ADD CONSTRAINT "asset_links_record_key_check" CHECK (length(TRIM(BOTH FROM record_key)) > 0);

ALTER TABLE public."asset_links" ADD CONSTRAINT "asset_links_record_type_check" CHECK (record_type = ANY (ARRAY['recipe'::text, 'quote'::text, 'order'::text, 'production_job'::text, 'customer'::text]));

ALTER TABLE public."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_category_check" CHECK (category = ANY (ARRAY['fusion_source'::text, 'step'::text, 'stl'::text, 'slicer_project'::text, 'reference_image'::text, 'finished_photo'::text, 'assembly_instructions'::text, 'packaging_template'::text, 'customer_artwork'::text, 'production_document'::text, 'other'::text]));

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_designation_check" CHECK (designation = ANY (ARRAY['internal'::text, 'customer_supplied'::text]));

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_file_size_check" CHECK (file_size > 0 AND file_size <= 104857600);

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_filename_check" CHECK (length(filename) >= 1 AND length(filename) <= 255);

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_owner_id_revision_group_id_revision_key" UNIQUE (owner_id, revision_group_id, revision);

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_owner_id_sha256_revision_group_id_key" UNIQUE (owner_id, sha256, revision_group_id);

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_pkey" PRIMARY KEY (id);

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_revision_check" CHECK (revision > 0);

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_sha256_check" CHECK (sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_storage_path_key" UNIQUE (storage_path);

ALTER TABLE public."order_payment_command_receipts" ADD CONSTRAINT "order_payment_command_receipts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE public."campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_product_recipe_id_fkey" FOREIGN KEY (product_recipe_id) REFERENCES product_recipes(id) ON DELETE SET NULL;

ALTER TABLE public."campaign_products" ADD CONSTRAINT "campaign_products_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."production_linkage_audit" ADD CONSTRAINT "production_linkage_audit_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

ALTER TABLE public."production_linkage_audit" ADD CONSTRAINT "production_linkage_audit_production_job_id_fkey" FOREIGN KEY (production_job_id) REFERENCES production_jobs(id) ON DELETE RESTRICT;

ALTER TABLE public."production_linkage_audit" ADD CONSTRAINT "production_linkage_audit_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE RESTRICT;

ALTER TABLE public."production_linkage_audit" ADD CONSTRAINT "production_linkage_audit_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."quotes" ADD CONSTRAINT "quotes_production_job_id_fkey" FOREIGN KEY (production_job_id) REFERENCES production_jobs(id) ON DELETE RESTRICT;

ALTER TABLE public."quotes" ADD CONSTRAINT "quotes_source_project_id_fkey" FOREIGN KEY (source_project_id) REFERENCES active_projects(id) ON DELETE SET NULL;

ALTER TABLE public."inventory_transactions" ADD CONSTRAINT "inventory_transactions_finished_good_id_fkey" FOREIGN KEY (finished_good_id) REFERENCES finished_goods_inventory(id) ON DELETE SET NULL;

ALTER TABLE public."inventory_transactions" ADD CONSTRAINT "inventory_transactions_production_job_id_fkey" FOREIGN KEY (production_job_id) REFERENCES production_jobs(id) ON DELETE SET NULL;

ALTER TABLE public."inventory_transactions" ADD CONSTRAINT "inventory_transactions_raw_material_id_fkey" FOREIGN KEY (raw_material_id) REFERENCES raw_material_inventory(id) ON DELETE SET NULL;

ALTER TABLE public."order_tracking_public" ADD CONSTRAINT "order_tracking_public_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."production_material_reservations" ADD CONSTRAINT "production_material_reservations_production_job_id_fkey" FOREIGN KEY (production_job_id) REFERENCES production_jobs(id) ON DELETE RESTRICT;

ALTER TABLE public."production_material_reservations" ADD CONSTRAINT "production_material_reservations_raw_material_roll_id_fkey" FOREIGN KEY (raw_material_roll_id) REFERENCES raw_material_inventory(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_campaign_product_id_fkey" FOREIGN KEY (campaign_product_id) REFERENCES campaign_products(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_submission_items" ADD CONSTRAINT "campaign_submission_items_campaign_submission_id_fkey" FOREIGN KEY (campaign_submission_id) REFERENCES campaign_submissions(id) ON DELETE RESTRICT;

ALTER TABLE public."active_projects" ADD CONSTRAINT "active_projects_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_campaign_converted_by_fkey" FOREIGN KEY (campaign_converted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_campaign_submission_id_fkey" FOREIGN KEY (campaign_submission_id) REFERENCES campaign_submissions(id) ON DELETE RESTRICT;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."campaign_order_conversion_snapshots" ADD CONSTRAINT "campaign_order_conversion_snapshots_campaign_submission_id_fkey" FOREIGN KEY (campaign_submission_id) REFERENCES campaign_submissions(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_order_conversion_snapshots" ADD CONSTRAINT "campaign_order_conversion_snapshots_converted_by_fkey" FOREIGN KEY (converted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_order_conversion_snapshots" ADD CONSTRAINT "campaign_order_conversion_snapshots_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_order_conversion_snapshots" ADD CONSTRAINT "campaign_order_conversion_snapshots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_converted_by_fkey" FOREIGN KEY (converted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_converted_order_id_fkey" FOREIGN KEY (converted_order_id) REFERENCES orders(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."campaign_submissions" ADD CONSTRAINT "campaign_submissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public."order_pricing_revisions" ADD CONSTRAINT "order_pricing_revisions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE public."order_pricing_revisions" ADD CONSTRAINT "order_pricing_revisions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public."production_job_roll_usage" ADD CONSTRAINT "production_job_roll_usage_production_job_id_fkey" FOREIGN KEY (production_job_id) REFERENCES production_jobs(id) ON DELETE CASCADE;

ALTER TABLE public."production_job_roll_usage" ADD CONSTRAINT "production_job_roll_usage_raw_material_id_fkey" FOREIGN KEY (raw_material_id) REFERENCES raw_material_inventory(id) ON DELETE SET NULL;

ALTER TABLE public."production_job_roll_usage" ADD CONSTRAINT "production_job_roll_usage_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."production_jobs" ADD CONSTRAINT "production_jobs_raw_material_roll_id_fkey" FOREIGN KEY (raw_material_roll_id) REFERENCES raw_material_inventory(id) ON DELETE SET NULL;

ALTER TABLE public."reusable_spool_pool" ADD CONSTRAINT "reusable_spool_pool_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."product_recipes" ADD CONSTRAINT "product_recipes_supersedes_recipe_id_fkey" FOREIGN KEY (supersedes_recipe_id) REFERENCES product_recipes(id);

ALTER TABLE public."product_recipes" ADD CONSTRAINT "product_recipes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."financial_entries" ADD CONSTRAINT "financial_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."asset_links" ADD CONSTRAINT "asset_links_asset_revision_id_fkey" FOREIGN KEY (asset_revision_id) REFERENCES asset_records(id) ON DELETE CASCADE;

ALTER TABLE public."asset_links" ADD CONSTRAINT "asset_links_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."asset_records" ADD CONSTRAINT "asset_records_supersedes_asset_id_fkey" FOREIGN KEY (supersedes_asset_id) REFERENCES asset_records(id);

CREATE VIEW public."production_linkage_candidates" WITH (security_invoker=true) AS  SELECT p.id AS production_job_id,
    p.job_title,
    p.user_id AS owner_id,
    p.production_status,
    p.quote_number,
    p.job_payload ->> 'quote_number'::text AS payload_quote_number,
    p.order_number,
    p.job_payload ->> 'order_number'::text AS payload_order_number,
    p.job_payload ->> 'order_id'::text AS payload_order_id,
    c.candidate_count,
    c.order_id AS candidate_order_id,
    c.order_number AS candidate_order_number,
    c.same_owner,
    c.created_from_quote,
    c.source_type,
    NOT p.quote_number IS DISTINCT FROM (p.job_payload ->> 'quote_number'::text) AND NOT p.order_number IS DISTINCT FROM c.order_number AND NOT (p.job_payload ->> 'order_number'::text) IS DISTINCT FROM c.order_number AND NOT (p.job_payload ->> 'order_id'::text) IS DISTINCT FROM c.order_id::text AS linkage_consistent,
    c.candidate_count = 1 AND c.same_owner AND c.created_from_quote AND c.source_type = 'quote'::text AND (p.order_number IS NULL OR p.order_number = c.order_number) AS safe_repair_eligible,
        CASE
            WHEN p.quote_number IS NULL THEN 'missing_quote'::text
            WHEN p.quote_number IS DISTINCT FROM (p.job_payload ->> 'quote_number'::text) THEN 'payload_quote_mismatch'::text
            WHEN c.candidate_count = 0 THEN 'no_order_candidate'::text
            WHEN c.candidate_count > 1 THEN 'ambiguous_orders'::text
            WHEN NOT c.same_owner THEN 'owner_mismatch'::text
            WHEN NOT c.created_from_quote OR c.source_type IS DISTINCT FROM 'quote'::text THEN 'not_quote_created'::text
            WHEN p.order_number IS NOT NULL AND p.order_number IS DISTINCT FROM c.order_number THEN 'conflicting_order'::text
            ELSE NULL::text
        END AS exclusion_reason
   FROM production_jobs p
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS candidate_count,
            (array_agg(o.id))[1] AS order_id,
            min(o.order_number) AS order_number,
            bool_and(o.user_id = p.user_id) AS same_owner,
            bool_and(o.created_from_quote) AS created_from_quote,
            min(o.source_type) AS source_type
           FROM orders o
          WHERE o.source_quote_number = p.quote_number) c ON true;;

CREATE VIEW public."production_legacy_classification_report" WITH (security_invoker=true) AS  WITH evidence AS (
         SELECT p.id,
            p.user_id,
            p.job_title,
            p.job_category,
            p.job_status,
            p.priority,
            p.customer_name,
            p.customer_email,
            p.source_ref,
            p.quote_number,
            p.order_number,
            p.sku,
            p.due_date,
            p.target_machine,
            p.actual_machine,
            p.quantity_planned,
            p.quantity_completed,
            p.estimated_hours_per_unit,
            p.estimated_total_hours,
            p.actual_print_hours,
            p.estimated_filaments,
            p.actual_filaments,
            p.creates_finished_good,
            p.finished_good_id,
            p.finished_good_name,
            p.sale_price,
            p.notes,
            p.completion_notes,
            p.completed_at,
            p.archived_at,
            p.created_at,
            p.updated_at,
            p.source,
            p.quantity,
            p.machine_preference,
            p.primary_material_type,
            p.primary_color,
            p.colors_count,
            p.filament_plan,
            p.estimated_grams_per_unit,
            p.actual_filament_usage,
            p.event_name,
            p.close_outcome,
            p.closed_note,
            p.closed_at,
            p.add_to_finished_goods,
            p.finished_good_category,
            p.finished_good_sale_price,
            p.estimated_total_grams,
            p.filament_recipe,
            p.failure_reason,
            p.exclude_inventory_reduction,
            p.print_started_at,
            p.estimated_finish_at,
            p.scrap_grams,
            p.actual_filament_breakdown,
            p.actual_quantity,
            p.actual_grams_used,
            p.close_note,
            p.raw_material_roll_id,
            p.finished_roll,
            p.spool_freed,
            p.roll_usages,
            p.job_type,
            p.production_status,
            p.primary_material,
            p.other_colors,
            p.color_count,
            p.estimated_hours_each,
            p.estimated_grams_each,
            p.estimated_price_each,
            p.image_url,
            p.finished_sku,
            p.filament_breakdown,
            p.job_payload,
            p.design_fee,
            p.post_processing_fee,
            p.estimated_material_cost,
            p.manual_rank,
            p.design_fee_mode,
            p.post_processing_fee_mode,
            p.supply_usage,
            p.supply_cost,
            p.quote_handoff_status,
            p.quote_handoff_at,
            p.quote_accepted_at,
            p.production_source_type,
            NULLIF(btrim(p.job_payload ->> 'quote_number'::text), ''::text) AS payload_quote_number,
            NULLIF(btrim(p.job_payload ->> 'order_number'::text), ''::text) AS payload_order_number,
            NULLIF(btrim(p.job_payload ->> 'order_id'::text), ''::text) AS payload_order_id,
            ( SELECT count(*) AS count
                   FROM quotes q
                  WHERE q.user_id = p.user_id AND q.quote_number = COALESCE(p.quote_number, NULLIF(btrim(p.job_payload ->> 'quote_number'::text), ''::text))) AS matching_quote_count,
            ( SELECT count(*) AS count
                   FROM orders o
                  WHERE o.source_quote_number = COALESCE(p.quote_number, NULLIF(btrim(p.job_payload ->> 'quote_number'::text), ''::text)) OR o.order_number = COALESCE(p.order_number, NULLIF(btrim(p.job_payload ->> 'order_number'::text), ''::text)) OR o.id::text = NULLIF(btrim(p.job_payload ->> 'order_id'::text), ''::text)) AS matching_order_count
           FROM production_jobs p
        ), candidates AS (
         SELECT e.id,
            e.user_id,
            e.job_title,
            e.job_category,
            e.job_status,
            e.priority,
            e.customer_name,
            e.customer_email,
            e.source_ref,
            e.quote_number,
            e.order_number,
            e.sku,
            e.due_date,
            e.target_machine,
            e.actual_machine,
            e.quantity_planned,
            e.quantity_completed,
            e.estimated_hours_per_unit,
            e.estimated_total_hours,
            e.actual_print_hours,
            e.estimated_filaments,
            e.actual_filaments,
            e.creates_finished_good,
            e.finished_good_id,
            e.finished_good_name,
            e.sale_price,
            e.notes,
            e.completion_notes,
            e.completed_at,
            e.archived_at,
            e.created_at,
            e.updated_at,
            e.source,
            e.quantity,
            e.machine_preference,
            e.primary_material_type,
            e.primary_color,
            e.colors_count,
            e.filament_plan,
            e.estimated_grams_per_unit,
            e.actual_filament_usage,
            e.event_name,
            e.close_outcome,
            e.closed_note,
            e.closed_at,
            e.add_to_finished_goods,
            e.finished_good_category,
            e.finished_good_sale_price,
            e.estimated_total_grams,
            e.filament_recipe,
            e.failure_reason,
            e.exclude_inventory_reduction,
            e.print_started_at,
            e.estimated_finish_at,
            e.scrap_grams,
            e.actual_filament_breakdown,
            e.actual_quantity,
            e.actual_grams_used,
            e.close_note,
            e.raw_material_roll_id,
            e.finished_roll,
            e.spool_freed,
            e.roll_usages,
            e.job_type,
            e.production_status,
            e.primary_material,
            e.other_colors,
            e.color_count,
            e.estimated_hours_each,
            e.estimated_grams_each,
            e.estimated_price_each,
            e.image_url,
            e.finished_sku,
            e.filament_breakdown,
            e.job_payload,
            e.design_fee,
            e.post_processing_fee,
            e.estimated_material_cost,
            e.manual_rank,
            e.design_fee_mode,
            e.post_processing_fee_mode,
            e.supply_usage,
            e.supply_cost,
            e.quote_handoff_status,
            e.quote_handoff_at,
            e.quote_accepted_at,
            e.production_source_type,
            e.payload_quote_number,
            e.payload_order_number,
            e.payload_order_id,
            e.matching_quote_count,
            e.matching_order_count,
            o.id AS candidate_order_id,
            o.order_number AS candidate_order_number,
            o.source_quote_number AS candidate_source_quote_number,
            o.user_id = e.user_id AS same_owner_result
           FROM evidence e
             LEFT JOIN LATERAL ( SELECT x.id,
                    x.user_id,
                    x.order_number,
                    x.order_date,
                    x.customer_name,
                    x.customer_email,
                    x.order_title,
                    x.quantity,
                    x.order_total,
                    x.deposit_amount,
                    x.balance_amount,
                    x.due_date,
                    x.status,
                    x.payment_status,
                    x.fulfillment,
                    x.tracking_number,
                    x.payment_link,
                    x.internal_notes,
                    x.public_status_text,
                    x.public_next_step,
                    x.shipping_or_pickup_note,
                    x.source_quote_number,
                    x.created_at,
                    x.updated_at,
                    x.stripe_invoice_id,
                    x.paid_date,
                    x.payment_link_stripe,
                    x.payment_link_paypal,
                    x.payment_link_venmo,
                    x.completion_email_sent,
                    x.completion_email_sent_at,
                    x.po_number,
                    x.invoice_number,
                    x.invoice_date,
                    x.invoice_due_date,
                    x.invoice_terms,
                    x.invoice_sent,
                    x.invoice_sent_at,
                    x.ap_email,
                    x.billing_address,
                    x.shipping_address,
                    x.finance_pushed,
                    x.finance_pushed_at,
                    x.po_part_number,
                    x.olipoly_part_number,
                    x.part_revision,
                    x.shipping_contact_name,
                    x.shipping_company,
                    x.created_from_quote,
                    x.accepted_date,
                    x.material,
                    x.color,
                    x.printer_profile,
                    x.layer_height,
                    x.nozzle_size,
                    x.estimated_piece_price,
                    x.estimated_print_time,
                    x.production_notes,
                    x.post_processing_notes,
                    x.catalog_part_id,
                    x.tax_exempt,
                    x.tax_exempt_reason,
                    x.exemption_certificate_on_file,
                    x.po_file_on_file,
                    x.source_type,
                    x.campaign_id,
                    x.campaign_submission_id,
                    x.campaign_public_reference,
                    x.campaign_code,
                    x.campaign_conversion_at,
                    x.campaign_converted_by,
                    x.campaign_customer_link_status,
                    x.campaign_customer_id,
                    x.campaign_source_snapshot,
                    x.destination_county,
                    x.sales_tax_rate,
                    x.taxable_subtotal,
                    x.sales_tax_amount,
                    x.customer_phone
                   FROM orders x
                  WHERE x.source_quote_number = COALESCE(e.quote_number, e.payload_quote_number) OR x.order_number = COALESCE(e.order_number, e.payload_order_number) OR x.id::text = e.payload_order_id
                  ORDER BY x.created_at, x.id
                 LIMIT 1) o ON e.matching_order_count = 1
        ), classified AS (
         SELECT c.id,
            c.user_id,
            c.job_title,
            c.job_category,
            c.job_status,
            c.priority,
            c.customer_name,
            c.customer_email,
            c.source_ref,
            c.quote_number,
            c.order_number,
            c.sku,
            c.due_date,
            c.target_machine,
            c.actual_machine,
            c.quantity_planned,
            c.quantity_completed,
            c.estimated_hours_per_unit,
            c.estimated_total_hours,
            c.actual_print_hours,
            c.estimated_filaments,
            c.actual_filaments,
            c.creates_finished_good,
            c.finished_good_id,
            c.finished_good_name,
            c.sale_price,
            c.notes,
            c.completion_notes,
            c.completed_at,
            c.archived_at,
            c.created_at,
            c.updated_at,
            c.source,
            c.quantity,
            c.machine_preference,
            c.primary_material_type,
            c.primary_color,
            c.colors_count,
            c.filament_plan,
            c.estimated_grams_per_unit,
            c.actual_filament_usage,
            c.event_name,
            c.close_outcome,
            c.closed_note,
            c.closed_at,
            c.add_to_finished_goods,
            c.finished_good_category,
            c.finished_good_sale_price,
            c.estimated_total_grams,
            c.filament_recipe,
            c.failure_reason,
            c.exclude_inventory_reduction,
            c.print_started_at,
            c.estimated_finish_at,
            c.scrap_grams,
            c.actual_filament_breakdown,
            c.actual_quantity,
            c.actual_grams_used,
            c.close_note,
            c.raw_material_roll_id,
            c.finished_roll,
            c.spool_freed,
            c.roll_usages,
            c.job_type,
            c.production_status,
            c.primary_material,
            c.other_colors,
            c.color_count,
            c.estimated_hours_each,
            c.estimated_grams_each,
            c.estimated_price_each,
            c.image_url,
            c.finished_sku,
            c.filament_breakdown,
            c.job_payload,
            c.design_fee,
            c.post_processing_fee,
            c.estimated_material_cost,
            c.manual_rank,
            c.design_fee_mode,
            c.post_processing_fee_mode,
            c.supply_usage,
            c.supply_cost,
            c.quote_handoff_status,
            c.quote_handoff_at,
            c.quote_accepted_at,
            c.production_source_type,
            c.payload_quote_number,
            c.payload_order_number,
            c.payload_order_id,
            c.matching_quote_count,
            c.matching_order_count,
            c.candidate_order_id,
            c.candidate_order_number,
            c.candidate_source_quote_number,
            c.same_owner_result,
            c.quote_number IS NOT NULL OR c.order_number IS NOT NULL OR c.payload_quote_number IS NOT NULL OR c.payload_order_number IS NOT NULL OR c.payload_order_id IS NOT NULL OR (EXISTS ( SELECT 1
                   FROM production_linkage_audit a
                  WHERE a.production_job_id = c.id AND (a.event_type = ANY (ARRAY['production_quote_linked'::text, 'production_order_linked'::text])))) AS modern_provenance,
                CASE
                    WHEN c.production_source_type = 'legacy_standalone'::text THEN 'LEGACY_STANDALONE'::text
                    WHEN c.production_source_type = 'legacy_repaired'::text THEN 'MODERN_LINKED'::text
                    WHEN c.matching_order_count > 1 THEN 'AMBIGUOUS'::text
                    WHEN c.order_number IS NOT NULL AND c.matching_order_count = 1 AND c.same_owner_result THEN 'MODERN_LINKED'::text
                    WHEN c.created_at < '2026-08-03 00:00:00+00'::timestamp with time zone AND c.matching_order_count = 1 AND c.same_owner_result AND COALESCE(c.quote_number, c.payload_quote_number) IS NOT NULL THEN 'LEGACY_REPAIRABLE'::text
                    WHEN c.quote_number IS NOT NULL OR c.order_number IS NOT NULL OR c.payload_quote_number IS NOT NULL OR c.payload_order_number IS NOT NULL OR c.payload_order_id IS NOT NULL OR (EXISTS ( SELECT 1
                       FROM production_linkage_audit a
                      WHERE a.production_job_id = c.id AND (a.event_type = ANY (ARRAY['production_quote_linked'::text, 'production_order_linked'::text])))) THEN 'MODERN_LINKED'::text
                    WHEN c.created_at < '2026-08-03 00:00:00+00'::timestamp with time zone AND c.matching_order_count = 0 THEN 'LEGACY_STANDALONE'::text
                    ELSE 'AMBIGUOUS'::text
                END AS classification
           FROM candidates c
        )
 SELECT id AS production_job_id,
    job_title AS title,
    user_id AS owner,
    created_at,
    production_status,
    quote_number,
    order_number,
    payload_quote_number,
    payload_order_number,
    payload_order_id,
    matching_quote_count,
    matching_order_count,
    candidate_order_id,
    candidate_order_number,
    candidate_source_quote_number,
    same_owner_result,
    jsonb_build_object('identity_fields', modern_provenance, 'source_type', production_source_type, 'linkage_audit', (EXISTS ( SELECT 1
           FROM production_linkage_audit a
          WHERE a.production_job_id = classified.id))) AS modern_provenance_markers,
    classification,
    classification = 'LEGACY_REPAIRABLE'::text AND matching_order_count = 1 AND same_owner_result AND candidate_source_quote_number IS NOT NULL AS safe_repair_eligibility,
        CASE
            WHEN classification = 'AMBIGUOUS'::text THEN 'Modern cutoff/provenance is inconclusive or linkage has multiple candidates'::text
            WHEN classification = 'MODERN_LINKED'::text AND matching_order_count <> 1 THEN 'Modern provenance requires exactly one linked Order'::text
            WHEN classification = 'LEGACY_STANDALONE'::text AND production_source_type IS NULL THEN 'Operator approval required before standalone workflow is enabled'::text
            WHEN classification = 'LEGACY_REPAIRABLE'::text AND NOT same_owner_result THEN 'Cross-owner candidate rejected'::text
            ELSE NULL::text
        END AS exclusion_rejection_reason
   FROM classified;;

CREATE VIEW public."active_project_queue_summary" WITH (security_invoker=true) AS  SELECT user_id,
    count(*) FILTER (WHERE project_status <> ALL (ARRAY['delivered'::text, 'declined'::text])) AS active_count,
    count(*) FILTER (WHERE project_status = 'ready_to_quote'::text) AS ready_to_quote_count,
    count(*) FILTER (WHERE project_type = 'craft_stock'::text AND (project_status <> ALL (ARRAY['delivered'::text, 'declined'::text]))) AS craft_stock_count,
    COALESCE(sum(estimated_print_hours) FILTER (WHERE project_status <> ALL (ARRAY['delivered'::text, 'declined'::text, 'on_hold'::text])), 0::numeric) AS open_print_hours
   FROM active_projects
  GROUP BY user_id;;

CREATE VIEW public."raw_material_low_stock" WITH (security_invoker=true) AS  SELECT id,
    user_id,
    material_type,
    brand,
    color_name,
    color_family,
    spool_label,
    location,
    current_grams,
    reorder_threshold_grams,
        CASE
            WHEN current_grams <= 0::numeric THEN 'out'::text
            WHEN current_grams <= reorder_threshold_grams THEN 'reorder'::text
            WHEN current_grams <= (reorder_threshold_grams * 1.5) THEN 'low'::text
            ELSE 'good'::text
        END AS stock_status,
    vendor,
    reorder_url,
    updated_at
   FROM raw_material_inventory
  WHERE active = true;;

CREATE VIEW public."finished_goods_low_stock" WITH (security_invoker=true) AS  SELECT id,
    user_id,
    product_name,
    category,
    sku,
    location,
    quantity_on_hand,
    target_quantity,
    reorder_threshold,
    sale_price,
        CASE
            WHEN quantity_on_hand <= 0 THEN 'sold_out'::text
            WHEN quantity_on_hand <= reorder_threshold THEN 'reorder'::text
            WHEN target_quantity > 0 AND quantity_on_hand < target_quantity THEN 'low'::text
            ELSE 'stocked'::text
        END AS stock_status,
    updated_at
   FROM finished_goods_inventory
  WHERE active = true;;

CREATE INDEX idx_order_tracking_public_order_number ON public.order_tracking_public USING btree (order_number);

CREATE INDEX idx_parts_catalog_customer_part_number ON public.parts_catalog USING btree (customer_part_number);

CREATE INDEX finished_goods_inventory_user_idx ON public.finished_goods_inventory USING btree (user_id, category, status);

CREATE INDEX production_jobs_user_machine_idx ON public.production_jobs USING btree (user_id, target_machine, actual_machine);

CREATE INDEX idx_project_events_project_id ON public.project_events USING btree (project_id);

CREATE INDEX orders_invoice_number_idx ON public.orders USING btree (invoice_number);

CREATE INDEX production_jobs_user_status_idx ON public.production_jobs USING btree (user_id, job_status, due_date);

CREATE INDEX idx_finished_goods_user_active ON public.finished_goods_inventory USING btree (user_id, active);

CREATE INDEX idx_inventory_transactions_user_created ON public.inventory_transactions USING btree (user_id, created_at DESC);

CREATE INDEX idx_raw_material_user_color ON public.raw_material_inventory USING btree (user_id, material_type, color_name);

CREATE INDEX hub_reminders_user_id_idx ON public.hub_reminders USING btree (user_id);

CREATE INDEX finance_correction_receipts_group_idx ON public.finance_correction_receipts USING btree (correction_group_id) WHERE (correction_group_id IS NOT NULL);

CREATE INDEX campaigns_user_status_idx ON public.campaigns USING btree (user_id, status, updated_at DESC);

CREATE INDEX idx_inventory_transactions_item_label ON public.inventory_transactions USING btree (item_label);

CREATE INDEX orders_finance_pushed_idx ON public.orders USING btree (finance_pushed);

CREATE UNIQUE INDEX production_material_reservations_active_job_roll_once ON public.production_material_reservations USING btree (user_id, production_job_id, raw_material_roll_id) WHERE (status = 'active'::text);

CREATE INDEX idx_inventory_transactions_type ON public.inventory_transactions USING btree (transaction_type);

CREATE UNIQUE INDEX project_events_quote_change_requested_once_idx ON public.project_events USING btree (user_id, quote_number, event_type) WHERE (event_type = 'quote.change_requested'::text);

CREATE INDEX campaign_submission_items_submission_idx ON public.campaign_submission_items USING btree (campaign_submission_id, line_sequence);

CREATE UNIQUE INDEX financial_entries_original_reversed_once ON public.financial_entries USING btree (user_id, reversal_of_entry_id) WHERE ((finance_command = 'reverse_entry'::text) AND (finance_command_owned IS TRUE) AND (reversal_of_entry_id IS NOT NULL));

CREATE INDEX production_jobs_supply_usage_gin_idx ON public.production_jobs USING gin (supply_usage);

CREATE INDEX production_jobs_payload_idx ON public.production_jobs USING gin (job_payload);

CREATE UNIQUE INDEX campaigns_slug_unique_idx ON public.campaigns USING btree (campaign_slug);

CREATE UNIQUE INDEX campaign_products_campaign_sku_unique_idx ON public.campaign_products USING btree (campaign_id, campaign_sku);

CREATE INDEX idx_project_events_event_type ON public.project_events USING btree (event_type);

CREATE INDEX idx_inventory_transactions_production_job ON public.inventory_transactions USING btree (production_job_id);

CREATE UNIQUE INDEX financial_entries_order_income_once ON public.financial_entries USING btree (user_id, order_id) WHERE ((finance_command = 'post_order_income'::text) AND (finance_command_owned IS TRUE) AND (correction_of_entry_id IS NULL) AND (reversal_of_entry_id IS NULL));

CREATE INDEX campaign_products_user_idx ON public.campaign_products USING btree (user_id, updated_at DESC);

CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number);

CREATE INDEX idx_production_jobs_quote_number ON public.production_jobs USING btree (quote_number);

CREATE INDEX inventory_transactions_job_idx ON public.inventory_transactions USING btree (production_job_id);

CREATE INDEX idx_inventory_transactions_created_at ON public.inventory_transactions USING btree (created_at DESC);

CREATE INDEX finance_correction_receipts_owner_original_created_idx ON public.finance_correction_receipts USING btree (owner_id, original_entry_id, created_at DESC);

CREATE INDEX campaign_submissions_review_queue_idx ON public.campaign_submissions USING btree (user_id, review_status, submitted_at DESC);

CREATE INDEX idx_inventory_tx_user_created ON public.inventory_transactions USING btree (user_id, created_at DESC);

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);

CREATE INDEX idx_printer_pm_user ON public.printer_pm USING btree (user_id);

CREATE UNIQUE INDEX inventory_transactions_production_attempt_roll_once ON public.inventory_transactions USING btree (user_id, production_job_id, raw_material_id, attempt_id) WHERE ((production_job_id IS NOT NULL) AND (raw_material_id IS NOT NULL) AND (attempt_id IS NOT NULL) AND (transaction_type = 'production_attempt_consumption'::text));

CREATE INDEX idx_inventory_transactions_item ON public.inventory_transactions USING btree (item_label);

CREATE UNIQUE INDEX production_material_reservations_consume_attempt_roll_once ON public.production_material_reservations USING btree (user_id, production_job_id, attempt_id, raw_material_roll_id) WHERE ((status = 'consumed'::text) AND (attempt_id IS NOT NULL));

CREATE INDEX idx_parts_catalog_user_id ON public.parts_catalog USING btree (user_id);

CREATE INDEX asset_links_record_idx ON public.asset_links USING btree (owner_id, record_type, record_key);

CREATE INDEX active_projects_closed_at_idx ON public.active_projects USING btree (closed_at);

CREATE INDEX campaign_submissions_payment_fulfillment_idx ON public.campaign_submissions USING btree (user_id, payment_evidence_state, fulfillment_selection);

CREATE INDEX product_recipes_user_active_idx ON public.product_recipes USING btree (user_id, active, updated_at DESC);

CREATE UNIQUE INDEX campaigns_user_code_unique_idx ON public.campaigns USING btree (user_id, campaign_code);

CREATE INDEX idx_inventory_transactions_user ON public.inventory_transactions USING btree (user_id);

CREATE UNIQUE INDEX project_events_event_id_once_idx ON public.project_events USING btree (event_id) WHERE (event_id IS NOT NULL);

CREATE INDEX idx_project_events_order_number ON public.project_events USING btree (order_number);

CREATE INDEX idx_inventory_tx_finished ON public.inventory_transactions USING btree (finished_good_id);

CREATE UNIQUE INDEX quotes_one_per_production_job_idx ON public.quotes USING btree (production_job_id) WHERE (production_job_id IS NOT NULL);

CREATE UNIQUE INDEX production_material_reservations_release_command_roll_once ON public.production_material_reservations USING btree (user_id, release_command_id, raw_material_roll_id) WHERE (release_command_id IS NOT NULL);

CREATE INDEX idx_parts_catalog_olipoly_part_number ON public.parts_catalog USING btree (olipoly_part_number);

CREATE INDEX non_filament_materials_user_updated_idx ON public.non_filament_materials USING btree (user_id, updated_at DESC);

CREATE INDEX campaign_products_campaign_order_idx ON public.campaign_products USING btree (campaign_id, enabled, display_order, campaign_sku);

CREATE INDEX raw_material_inventory_user_idx ON public.raw_material_inventory USING btree (user_id, material_type, color_name);

CREATE INDEX idx_production_jobs_user_machine ON public.production_jobs USING btree (user_id, machine_preference);

CREATE INDEX active_projects_status_idx ON public.active_projects USING btree (user_id, project_status);

CREATE INDEX idx_orders_user_updated_at ON public.orders USING btree (user_id, updated_at DESC);

CREATE INDEX idx_project_events_quote_number ON public.project_events USING btree (quote_number);

CREATE INDEX production_jobs_payload_gin_idx ON public.production_jobs USING gin (job_payload);

CREATE INDEX active_projects_quote_number_idx ON public.active_projects USING btree (quote_number);

CREATE INDEX active_projects_type_idx ON public.active_projects USING btree (user_id, project_type);

CREATE INDEX finance_correction_receipts_effective ON public.finance_correction_receipts USING btree (owner_id, original_entry_id, created_at DESC);

CREATE INDEX idx_inventory_tx_job ON public.inventory_transactions USING btree (production_job_id);

CREATE INDEX idx_orders_user_status ON public.orders USING btree (user_id, status);

CREATE UNIQUE INDEX orders_one_per_source_quote_number_idx ON public.orders USING btree (source_quote_number) WHERE (NULLIF(btrim(source_quote_number), ''::text) IS NOT NULL);

CREATE INDEX idx_customers_name ON public.customers USING btree (customer_name);

CREATE INDEX quotes_source_project_id_idx ON public.quotes USING btree (source_project_id);

CREATE UNIQUE INDEX project_events_workflow_command_once_idx ON public.project_events USING btree (correlation_id, event_type) WHERE ((correlation_id IS NOT NULL) AND (event_type = ANY (ARRAY['order.printing_started'::text, 'order.print_completed'::text, 'order.qc_passed'::text, 'order.needs_reprint'::text, 'order.ready_to_print'::text, 'order.closed'::text])));

CREATE INDEX idx_parts_catalog_last_order_number ON public.parts_catalog USING btree (last_order_number);

CREATE UNIQUE INDEX orders_order_number_unique_idx ON public.orders USING btree (order_number);

CREATE INDEX idx_production_jobs_user_due ON public.production_jobs USING btree (user_id, due_date);

CREATE UNIQUE INDEX finance_correction_receipts_command_identity_uidx ON public.finance_correction_receipts USING btree (command_identity) WHERE (command_identity IS NOT NULL);

CREATE INDEX hub_reminders_user_due_date_idx ON public.hub_reminders USING btree (user_id, due_date);

CREATE INDEX catalog_parts_part_lookup_idx ON public.catalog_parts USING btree (olipoly_part_number, customer_part_number, part_revision);

CREATE INDEX printer_pm_user_machine_idx ON public.printer_pm USING btree (user_id, machine);

CREATE UNIQUE INDEX project_events_acceptance_once_idx ON public.project_events USING btree (user_id, quote_number, event_type) WHERE (event_type = ANY (ARRAY['quote.accepted'::text, 'order.created'::text]));

CREATE UNIQUE INDEX financial_entries_finance_command_identity_once ON public.financial_entries USING btree (finance_command_id) WHERE (finance_command_id IS NOT NULL);

CREATE INDEX idx_production_jobs_user_status ON public.production_jobs USING btree (user_id, job_status);

CREATE INDEX asset_links_manifest_idx ON public.asset_links USING btree (owner_id, record_key, link_type) WHERE ((record_type = 'recipe'::text) AND (link_type ~~ 'manifest:%:current'::text));

CREATE INDEX idx_inventory_tx_raw ON public.inventory_transactions USING btree (raw_material_id);

CREATE INDEX idx_customers_email ON public.customers USING btree (email);

CREATE UNIQUE INDEX production_material_reservations_reserve_command_roll_once ON public.production_material_reservations USING btree (user_id, reservation_command_id, raw_material_roll_id);

CREATE INDEX active_projects_user_updated_idx ON public.active_projects USING btree (user_id, updated_at DESC);

CREATE INDEX idx_finished_goods_user_category ON public.finished_goods_inventory USING btree (user_id, category);

CREATE INDEX idx_project_events_created_at ON public.project_events USING btree (created_at DESC);

CREATE INDEX catalog_parts_customer_idx ON public.catalog_parts USING btree (customer_name, company_name);

CREATE INDEX campaigns_public_lookup_idx ON public.campaigns USING btree (campaign_slug, status, starts_at, ends_at);

CREATE INDEX inventory_transactions_user_idx ON public.inventory_transactions USING btree (user_id, created_at DESC);

CREATE INDEX orders_po_number_idx ON public.orders USING btree (po_number);

CREATE INDEX asset_records_owner_current_idx ON public.asset_records USING btree (owner_id, revision_group_id, revision DESC) WHERE (status = 'active'::text);

CREATE INDEX inventory_transactions_user_date_idx ON public.inventory_transactions USING btree (user_id, date DESC);

CREATE INDEX idx_production_jobs_order_number ON public.production_jobs USING btree (order_number);

CREATE INDEX inventory_settings_user_key_idx ON public.inventory_settings USING btree (user_id, setting_key);

CREATE UNIQUE INDEX orders_one_per_campaign_submission_idx ON public.orders USING btree (campaign_submission_id) WHERE (campaign_submission_id IS NOT NULL);

CREATE UNIQUE INDEX uniq_parts_catalog_user_olipoly_revision ON public.parts_catalog USING btree (user_id, olipoly_part_number, revision) WHERE (olipoly_part_number IS NOT NULL);

CREATE INDEX campaign_submissions_campaign_queue_idx ON public.campaign_submissions USING btree (campaign_id, submitted_at DESC);

CREATE INDEX idx_inventory_transactions_user_date ON public.inventory_transactions USING btree (user_id, date DESC);

CREATE INDEX production_jobs_user_updated_idx ON public.production_jobs USING btree (user_id, updated_at DESC);

CREATE INDEX idx_orders_user_order_number ON public.orders USING btree (user_id, order_number);

CREATE INDEX financial_entries_correction_group ON public.financial_entries USING btree (user_id, correction_group_id) WHERE (correction_group_id IS NOT NULL);

CREATE INDEX financial_entries_destination_county_idx ON public.financial_entries USING btree (destination_county);

CREATE INDEX idx_raw_material_user_active ON public.raw_material_inventory USING btree (user_id, active);

CREATE INDEX product_recipes_part_idx ON public.product_recipes USING btree (user_id, olipoly_part_number);

CREATE UNIQUE INDEX inventory_transactions_production_command_roll_once ON public.inventory_transactions USING btree (user_id, correlation_id, raw_material_id) WHERE ((correlation_id IS NOT NULL) AND (raw_material_id IS NOT NULL) AND (transaction_type = 'production_attempt_consumption'::text));

ALTER TABLE public."project_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."quote_accepted_commercial_snapshots" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."finance_correction_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."order_payment_command_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."campaigns" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."document_counters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."campaign_products" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."production_linkage_audit" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."production_attempt_consumption_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."workflow_command_receipts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."quotes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."inventory_transactions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."hub_reminders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."hub_notes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."order_tracking_public" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."production_material_reservations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."campaign_submission_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."catalog_parts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."parts_catalog" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."active_projects" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."campaign_order_conversion_snapshots" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."campaign_submissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."order_pricing_revisions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."production_job_roll_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."production_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."finished_goods_inventory" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."reusable_spool_pool" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."printer_pm" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."raw_material_inventory" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."non_filament_materials" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."inventory_spool_pool" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."inventory_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."product_recipes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."financial_entries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."asset_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."asset_records" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hub_reminders_select_own" ON public."hub_reminders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "hub_reminders_insert_own" ON public."hub_reminders" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "hub_reminders_update_own" ON public."hub_reminders" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "hub_reminders_delete_own" ON public."hub_reminders" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "finished_goods_inventory_select" ON public."finished_goods_inventory" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "finished_goods_inventory_insert" ON public."finished_goods_inventory" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "finished_goods_inventory_update" ON public."finished_goods_inventory" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "finished_goods_inventory_delete" ON public."finished_goods_inventory" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "inventory_transactions_select" ON public."inventory_transactions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "inventory_transactions_insert" ON public."inventory_transactions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "inventory_transactions_update" ON public."inventory_transactions" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "inventory_transactions_delete" ON public."inventory_transactions" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "hub_notes_select_own" ON public."hub_notes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "hub_notes_insert_own" ON public."hub_notes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "hub_notes_update_own" ON public."hub_notes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "hub_notes_delete_own" ON public."hub_notes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "Users can read their own catalog parts" ON public."catalog_parts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "Users can insert their own catalog parts" ON public."catalog_parts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can update their own catalog parts" ON public."catalog_parts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can delete their own catalog parts" ON public."catalog_parts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "production_attempt_consumption_receipts_service_all" ON public."production_attempt_consumption_receipts" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Users can view their own quotes" ON public."quotes" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own quotes" ON public."quotes" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update their own quotes" ON public."quotes" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own quotes" ON public."quotes" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "active_projects_select_own" ON public."active_projects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "active_projects_insert_own" ON public."active_projects" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "active_projects_update_own" ON public."active_projects" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "active_projects_delete_own" ON public."active_projects" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can select own printer pm" ON public."printer_pm" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own printer pm" ON public."printer_pm" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own printer pm" ON public."printer_pm" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own printer pm" ON public."printer_pm" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "finance_correction_receipts_owner_select" ON public."finance_correction_receipts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owner_id = auth.uid()));

CREATE POLICY "printer_pm_select" ON public."printer_pm" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "printer_pm_insert" ON public."printer_pm" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "printer_pm_update" ON public."printer_pm" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "printer_pm_delete" ON public."printer_pm" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "raw_material_inventory_select" ON public."raw_material_inventory" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "raw_material_inventory_insert" ON public."raw_material_inventory" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "raw_material_inventory_update" ON public."raw_material_inventory" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "raw_material_inventory_delete" ON public."raw_material_inventory" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "orders_owner_update_active_metadata" ON public."orders" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((user_id = auth.uid()) AND (status <> ALL (ARRAY['closed'::text, 'fulfilled'::text, 'cancelled'::text])))) WITH CHECK (((user_id = auth.uid()) AND (status <> ALL (ARRAY['closed'::text, 'fulfilled'::text, 'cancelled'::text]))));

CREATE POLICY "financial_entries_select_own" ON public."financial_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "financial_entries_insert_own" ON public."financial_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "orders_select_own" ON public."orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "orders_insert_own" ON public."orders" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "orders_update_own" ON public."orders" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "orders_delete_own" ON public."orders" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "Users can select own raw material inventory" ON public."raw_material_inventory" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own raw material inventory" ON public."raw_material_inventory" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own raw material inventory" ON public."raw_material_inventory" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own raw material inventory" ON public."raw_material_inventory" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can select own finished goods inventory" ON public."finished_goods_inventory" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own finished goods inventory" ON public."finished_goods_inventory" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own finished goods inventory" ON public."finished_goods_inventory" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own finished goods inventory" ON public."finished_goods_inventory" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can select own inventory transactions" ON public."inventory_transactions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own inventory transactions" ON public."inventory_transactions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own inventory transactions" ON public."inventory_transactions" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own inventory transactions" ON public."inventory_transactions" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Owners read Production linkage audit" ON public."production_linkage_audit" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "raw materials are user owned" ON public."raw_material_inventory" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "finished goods are user owned" ON public."finished_goods_inventory" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "inventory transactions are user owned" ON public."inventory_transactions" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "production roll usage user owned" ON public."production_job_roll_usage" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "spool pool user owned" ON public."reusable_spool_pool" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "non_filament_materials_owner_all" ON public."non_filament_materials" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "financial_entries_owner_select_p0" ON public."financial_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "financial_entries_owner_insert_manual_only_p0" ON public."financial_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((auth.uid() = user_id) AND (NOT COALESCE(finance_command_owned, false)) AND (finance_command_id IS NULL) AND (finance_command IS NULL) AND (order_id IS NULL) AND (order_number IS NULL) AND (posted_by IS NULL) AND (posted_at IS NULL) AND (correction_of_entry_id IS NULL) AND (reversal_of_entry_id IS NULL) AND (replacement_for_entry_id IS NULL) AND (correction_group_id IS NULL) AND (correction_kind IS NULL)));

CREATE POLICY "inventory_spool_pool_owner_all" ON public."inventory_spool_pool" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "inventory_settings_owner_all" ON public."inventory_settings" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "inventory_transactions_select_own" ON public."inventory_transactions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "inventory_transactions_insert_own" ON public."inventory_transactions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "inventory_transactions_update_own" ON public."inventory_transactions" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "inventory_transactions_delete_own" ON public."inventory_transactions" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own product recipes" ON public."product_recipes" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "asset_records_owner_select" ON public."asset_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owner_id = auth.uid()));

CREATE POLICY "asset_records_owner_insert" ON public."asset_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((owner_id = auth.uid()) AND (split_part(storage_path, '/'::text, 1) = (auth.uid())::text)));

CREATE POLICY "asset_records_owner_update" ON public."asset_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY "asset_records_owner_delete" ON public."asset_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owner_id = auth.uid()));

CREATE POLICY "asset_links_owner_all" ON public."asset_links" AS PERMISSIVE FOR ALL TO "authenticated" USING ((owner_id = auth.uid())) WITH CHECK (((owner_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM asset_records a
  WHERE ((a.id = asset_links.asset_revision_id) AND (a.owner_id = auth.uid()))))));

CREATE POLICY "parts_catalog_owner_select" ON public."parts_catalog" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "parts_catalog_owner_insert" ON public."parts_catalog" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "parts_catalog_owner_update" ON public."parts_catalog" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "project_events_owner_select" ON public."project_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "project_events_owner_insert" ON public."project_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "financial_entries_owner_update_manual_only" ON public."financial_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((auth.uid() = user_id) AND (NOT COALESCE(finance_command_owned, false)) AND (finance_command_id IS NULL) AND (finance_command IS NULL) AND (order_id IS NULL) AND (order_number IS NULL) AND (posted_by IS NULL) AND (posted_at IS NULL) AND (correction_of_entry_id IS NULL) AND (reversal_of_entry_id IS NULL) AND (replacement_for_entry_id IS NULL) AND (correction_group_id IS NULL) AND (correction_kind IS NULL))) WITH CHECK (((auth.uid() = user_id) AND (NOT COALESCE(finance_command_owned, false)) AND (finance_command_id IS NULL) AND (finance_command IS NULL) AND (order_id IS NULL) AND (order_number IS NULL) AND (posted_by IS NULL) AND (posted_at IS NULL) AND (correction_of_entry_id IS NULL) AND (reversal_of_entry_id IS NULL) AND (replacement_for_entry_id IS NULL) AND (correction_group_id IS NULL) AND (correction_kind IS NULL)));

CREATE POLICY "financial_entries_owner_delete_manual_only" ON public."financial_entries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((auth.uid() = user_id) AND (NOT COALESCE(finance_command_owned, false)) AND (finance_command_id IS NULL) AND (finance_command IS NULL) AND (order_id IS NULL) AND (order_number IS NULL) AND (posted_by IS NULL) AND (posted_at IS NULL) AND (correction_of_entry_id IS NULL) AND (reversal_of_entry_id IS NULL) AND (replacement_for_entry_id IS NULL) AND (correction_group_id IS NULL) AND (correction_kind IS NULL)));

CREATE POLICY "workflow_command_receipts_service_role_recovery" ON public."workflow_command_receipts" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "production_jobs_owner_select" ON public."production_jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "production_jobs_owner_insert" ON public."production_jobs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((auth.uid() = user_id) AND (production_status = ANY (ARRAY['estimate'::text, 'waiting_customer'::text])) AND (order_number IS NULL) AND (actual_grams_used IS NULL) AND (scrap_grams IS NULL) AND (actual_print_hours IS NULL) AND (actual_machine IS NULL) AND (actual_quantity IS NULL) AND (actual_filament_breakdown IS NULL) AND (actual_filaments IS NULL) AND (actual_filament_usage IS NULL) AND (print_started_at IS NULL) AND (completed_at IS NULL)));

CREATE POLICY "production_jobs_owner_update" ON public."production_jobs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "production_jobs_owner_delete" ON public."production_jobs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((auth.uid() = user_id) AND (production_status = ANY (ARRAY['estimate'::text, 'waiting_customer'::text])) AND (order_number IS NULL) AND (actual_grams_used IS NULL) AND (scrap_grams IS NULL) AND (actual_print_hours IS NULL) AND (actual_machine IS NULL) AND (actual_quantity IS NULL) AND (actual_filament_breakdown IS NULL) AND (actual_filaments IS NULL) AND (actual_filament_usage IS NULL) AND (print_started_at IS NULL) AND (completed_at IS NULL)));

CREATE POLICY "production_jobs_service_role_recovery" ON public."production_jobs" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "order_tracking_public_owner_select" ON public."order_tracking_public" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "order_tracking_public_service_role_recovery" ON public."order_tracking_public" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "production_material_reservations_owner_select" ON public."production_material_reservations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "production_material_reservations_service_all" ON public."production_material_reservations" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Users manage own campaigns" ON public."campaigns" AS PERMISSIVE FOR ALL TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "order_pricing_revisions_owner_read" ON public."order_pricing_revisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users manage own campaign products" ON public."campaign_products" AS PERMISSIVE FOR ALL TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_products.campaign_id) AND (c.user_id = auth.uid()))))));

CREATE POLICY "Owners read campaign submissions" ON public."campaign_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE POLICY "Owners read campaign submission items" ON public."campaign_submission_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM campaign_submissions s
  WHERE ((s.id = campaign_submission_items.campaign_submission_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Owners read campaign Order snapshots" ON public."campaign_order_conversion_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));

CREATE TRIGGER accepted_order_tax_metadata BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION capture_accepted_order_tax_metadata();

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at_orders();

CREATE TRIGGER trg_order_tracking_public_updated_at BEFORE UPDATE ON order_tracking_public FOR EACH ROW EXECUTE FUNCTION set_updated_at_order_tracking_public();

CREATE TRIGGER trg_production_jobs_updated_at BEFORE UPDATE ON production_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_printer_pm_updated_at BEFORE UPDATE ON printer_pm FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_raw_material_inventory_updated_at BEFORE UPDATE ON raw_material_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_finished_goods_inventory_updated_at BEFORE UPDATE ON finished_goods_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER orders_normalize_accepted_status BEFORE INSERT OR UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION enforce_accepted_order_status();

CREATE TRIGGER order_tracking_normalize_accepted_status BEFORE INSERT OR UPDATE OF status ON order_tracking_public FOR EACH ROW EXECUTE FUNCTION enforce_accepted_order_status();

CREATE TRIGGER quote_accepted_snapshots_no_update BEFORE DELETE OR UPDATE ON quote_accepted_commercial_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_quote_accepted_snapshot_mutation();

CREATE TRIGGER campaigns_set_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_campaign_updated_at();

CREATE TRIGGER campaign_products_set_updated_at BEFORE UPDATE ON campaign_products FOR EACH ROW EXECUTE FUNCTION set_campaign_updated_at();

CREATE TRIGGER quote_accepted_snapshots_version_invoice_totals BEFORE INSERT ON quote_accepted_commercial_snapshots FOR EACH ROW EXECUTE FUNCTION version_accepted_invoice_totals();

CREATE TRIGGER financial_entries_invoice_authority BEFORE INSERT ON financial_entries FOR EACH ROW EXECUTE FUNCTION apply_invoice_authority_to_finance_post();

CREATE TRIGGER orders_transfer_accepted_quote_assets AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION transfer_accepted_quote_asset_links();

CREATE TRIGGER campaign_submissions_immutable BEFORE UPDATE ON campaign_submissions FOR EACH ROW EXECUTE FUNCTION reject_campaign_submission_snapshot_mutation();

CREATE TRIGGER campaign_submission_items_immutable BEFORE DELETE OR UPDATE ON campaign_submission_items FOR EACH ROW EXECUTE FUNCTION reject_campaign_submission_snapshot_mutation();

CREATE TRIGGER campaign_order_snapshots_immutable BEFORE DELETE OR UPDATE ON campaign_order_conversion_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_campaign_order_snapshot_mutation();

CREATE TRIGGER zz_financial_entries_order_tax_metadata BEFORE INSERT ON financial_entries FOR EACH ROW EXECUTE FUNCTION apply_order_tax_metadata_to_finance_post();

CREATE TRIGGER orders_normalize_customer_phone BEFORE INSERT OR UPDATE OF customer_phone ON orders FOR EACH ROW EXECUTE FUNCTION normalize_order_customer_phone();

CREATE TRIGGER production_jobs_preserve_attempt_pointer BEFORE INSERT OR UPDATE OF production_status, job_payload ON production_jobs FOR EACH ROW EXECUTE FUNCTION preserve_production_attempt_pointer();

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_orders_updated_at();

CREATE TRIGGER quotes_prevent_production_provenance_drift BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION prevent_production_quote_provenance_drift();

CREATE TRIGGER orders_link_production_after_quote_insert AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION link_production_after_quote_order_insert();

CREATE TRIGGER aa_financial_entries_order_eligibility BEFORE INSERT ON financial_entries FOR EACH ROW EXECUTE FUNCTION require_finance_eligible_order();

CREATE TRIGGER financial_entries_guard_command_owned_mutation BEFORE DELETE OR UPDATE ON financial_entries FOR EACH ROW EXECUTE FUNCTION guard_command_owned_financial_entry_mutation();

CREATE TRIGGER order_pricing_revisions_immutable BEFORE DELETE OR UPDATE ON order_pricing_revisions FOR EACH ROW EXECUTE FUNCTION prevent_quote_accepted_snapshot_mutation();

REVOKE ALL ON FUNCTION public."allocate_order_number"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."allocate_order_number"() TO "service_role";

REVOKE ALL ON FUNCTION public."prevent_campaign_order_snapshot_mutation"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."prevent_campaign_order_snapshot_mutation"() TO "anon";

GRANT EXECUTE ON FUNCTION public."prevent_campaign_order_snapshot_mutation"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."prevent_campaign_order_snapshot_mutation"() TO "service_role";

REVOKE ALL ON FUNCTION public."convert_campaign_submission_to_order"(p_submission_id uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."convert_campaign_submission_to_order"(p_submission_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."convert_campaign_submission_to_order"(p_submission_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION public."preserve_production_attempt_pointer"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."preserve_production_attempt_pointer"() TO "service_role";

REVOKE ALL ON FUNCTION public."apply_invoice_authority_to_finance_post"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."apply_invoice_authority_to_finance_post"() TO "service_role";

REVOKE ALL ON FUNCTION public."mark_order_paid"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_correlation_id text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."mark_order_paid"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_correlation_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."mark_order_paid"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_correlation_id text) TO "service_role";

REVOKE ALL ON FUNCTION public."require_finance_eligible_order"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."require_finance_eligible_order"() TO "service_role";

REVOKE ALL ON FUNCTION public."production_workflow_command"(p_production_job_id uuid, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."production_workflow_command"(p_production_job_id uuid, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."production_workflow_command"(p_production_job_id uuid, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) TO "service_role";

REVOKE ALL ON FUNCTION public."approve_legacy_standalone_production"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_command_identity text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."approve_legacy_standalone_production"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_command_identity text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."approve_legacy_standalone_production"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_command_identity text) TO "service_role";

REVOKE ALL ON FUNCTION public."get_effective_financial_entries"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."get_effective_financial_entries"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_effective_financial_entries"() TO "service_role";

REVOKE ALL ON FUNCTION public."cancel_production_job"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_command_identity text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."cancel_production_job"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_command_identity text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."cancel_production_job"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_command_identity text) TO "service_role";

REVOKE ALL ON FUNCTION public."correct_financial_entry"(p_original_entry_id uuid, p_corrected_record jsonb, p_changed_fields text[], p_reason text, p_expected_effective_posted_at timestamp with time zone, p_tax_override_enabled boolean, p_tax_override_reason text, p_correlation_id text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."correct_financial_entry"(p_original_entry_id uuid, p_corrected_record jsonb, p_changed_fields text[], p_reason text, p_expected_effective_posted_at timestamp with time zone, p_tax_override_enabled boolean, p_tax_override_reason text, p_correlation_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."correct_financial_entry"(p_original_entry_id uuid, p_corrected_record jsonb, p_changed_fields text[], p_reason text, p_expected_effective_posted_at timestamp with time zone, p_tax_override_enabled boolean, p_tax_override_reason text, p_correlation_id text) TO "service_role";

REVOKE ALL ON FUNCTION public."guard_command_owned_financial_entry_mutation"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."guard_command_owned_financial_entry_mutation"() TO "service_role";

REVOKE ALL ON FUNCTION public."create_manual_financial_entry"(p_entry jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."create_manual_financial_entry"(p_entry jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."create_manual_financial_entry"(p_entry jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public."finance_adjustment_value"(p_adjustments jsonb, p_key text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."finance_adjustment_value"(p_adjustments jsonb, p_key text) TO "service_role";

REVOKE ALL ON FUNCTION public."is_ohio_county"(p_county text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."is_ohio_county"(p_county text) TO "service_role";

REVOKE ALL ON FUNCTION public."get_order_invoice_snapshot_base"(p_order_id uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."get_order_invoice_snapshot_base"(p_order_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION public."get_quote_public"(p_public_token text, p_quote_number text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."get_quote_public"(p_public_token text, p_quote_number text) TO "anon";

GRANT EXECUTE ON FUNCTION public."get_quote_public"(p_public_token text, p_quote_number text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_quote_public"(p_public_token text, p_quote_number text) TO "service_role";

REVOKE ALL ON FUNCTION public."get_order_invoice_snapshot"(p_order_id uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."get_order_invoice_snapshot"(p_order_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_order_invoice_snapshot"(p_order_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION public."fulfillment_workflow_command"(p_order_number text, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."fulfillment_workflow_command"(p_order_number text, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."fulfillment_workflow_command"(p_order_number text, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) TO "service_role";

REVOKE ALL ON FUNCTION public."capture_accepted_order_tax_metadata"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."capture_accepted_order_tax_metadata"() TO "service_role";

REVOKE ALL ON FUNCTION public."respond_to_quote_public"(p_public_token text, p_quote_number text, p_response text, p_message text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."respond_to_quote_public"(p_public_token text, p_quote_number text, p_response text, p_message text) TO "anon";

GRANT EXECUTE ON FUNCTION public."respond_to_quote_public"(p_public_token text, p_quote_number text, p_response text, p_message text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."respond_to_quote_public"(p_public_token text, p_quote_number text, p_response text, p_message text) TO "service_role";

REVOKE ALL ON FUNCTION public."apply_order_tax_metadata_to_finance_post"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."apply_order_tax_metadata_to_finance_post"() TO "service_role";

REVOKE ALL ON FUNCTION public."normalize_order_customer_phone"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."normalize_order_customer_phone"() TO "service_role";

REVOKE ALL ON FUNCTION public."update_manual_financial_entry"(p_entry_id uuid, p_entry jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."update_manual_financial_entry"(p_entry_id uuid, p_entry jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."update_manual_financial_entry"(p_entry_id uuid, p_entry jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public."set_orders_updated_at"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."set_orders_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION public."set_updated_at"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "anon";

GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION public."consume_production_attempt"(p_production_job_id uuid, p_attempt_id text, p_correlation_id text, p_expected_updated_at timestamp with time zone, p_roll_usages jsonb, p_workflow_command text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."consume_production_attempt"(p_production_job_id uuid, p_attempt_id text, p_correlation_id text, p_expected_updated_at timestamp with time zone, p_roll_usages jsonb, p_workflow_command text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."consume_production_attempt"(p_production_job_id uuid, p_attempt_id text, p_correlation_id text, p_expected_updated_at timestamp with time zone, p_roll_usages jsonb, p_workflow_command text) TO "service_role";

REVOKE ALL ON FUNCTION public."set_updated_at_orders"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."set_updated_at_orders"() TO "anon";

GRANT EXECUTE ON FUNCTION public."set_updated_at_orders"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."set_updated_at_orders"() TO "service_role";

REVOKE ALL ON FUNCTION public."set_updated_at_order_tracking_public"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."set_updated_at_order_tracking_public"() TO "anon";

GRANT EXECUTE ON FUNCTION public."set_updated_at_order_tracking_public"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."set_updated_at_order_tracking_public"() TO "service_role";

REVOKE ALL ON FUNCTION public."update_order_metadata"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."update_order_metadata"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."update_order_metadata"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public."prevent_production_quote_provenance_drift"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."prevent_production_quote_provenance_drift"() TO "service_role";

REVOKE ALL ON FUNCTION public."save_production_quote"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_command_identity text, p_quote jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."save_production_quote"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_command_identity text, p_quote jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."save_production_quote"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_command_identity text, p_quote jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public."link_production_after_quote_order_insert"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."link_production_after_quote_order_insert"() TO "service_role";

REVOKE ALL ON FUNCTION public."seed_default_printers"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."seed_default_printers"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."seed_default_printers"() TO "service_role";

REVOKE ALL ON FUNCTION public."repair_production_quote_order_linkage"(p_production_job_id uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."repair_production_quote_order_linkage"(p_production_job_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."repair_production_quote_order_linkage"(p_production_job_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION public."reset_printer_pm"(p_machine_name text, p_last_pm_date date, p_notes text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."reset_printer_pm"(p_machine_name text, p_last_pm_date date, p_notes text) TO "anon";

GRANT EXECUTE ON FUNCTION public."reset_printer_pm"(p_machine_name text, p_last_pm_date date, p_notes text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."reset_printer_pm"(p_machine_name text, p_last_pm_date date, p_notes text) TO "service_role";

REVOKE ALL ON FUNCTION public."production_workflow_command"(p_order_number text, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."production_workflow_command"(p_order_number text, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."production_workflow_command"(p_order_number text, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) TO "service_role";

REVOKE ALL ON FUNCTION public."workflow_public_status_text"(p_status text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."workflow_public_status_text"(p_status text) TO "service_role";

REVOKE ALL ON FUNCTION public."mark_printer_pm_complete"(p_printer_name text, p_pm_date date, p_next_pm_date date, p_note text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."mark_printer_pm_complete"(p_printer_name text, p_pm_date date, p_next_pm_date date, p_note text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."mark_printer_pm_complete"(p_printer_name text, p_pm_date date, p_next_pm_date date, p_note text) TO "service_role";

REVOKE ALL ON FUNCTION public."workflow_public_next_step"(p_status text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."workflow_public_next_step"(p_status text) TO "service_role";

REVOKE ALL ON FUNCTION public."reserve_production_material"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_reservation_command_id text, p_roll_reservations jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."reserve_production_material"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_reservation_command_id text, p_roll_reservations jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."reserve_production_material"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_reservation_command_id text, p_roll_reservations jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public."release_production_material_reservation"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_release_command_id text, p_reason text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."release_production_material_reservation"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_release_command_id text, p_reason text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."release_production_material_reservation"(p_production_job_id uuid, p_expected_updated_at timestamp with time zone, p_release_command_id text, p_reason text) TO "service_role";

REVOKE ALL ON FUNCTION public."link_accepted_quote_to_production"(p_quote_number text, p_public_token text, p_order_number text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."link_accepted_quote_to_production"(p_quote_number text, p_public_token text, p_order_number text) TO "anon";

GRANT EXECUTE ON FUNCTION public."link_accepted_quote_to_production"(p_quote_number text, p_public_token text, p_order_number text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."link_accepted_quote_to_production"(p_quote_number text, p_public_token text, p_order_number text) TO "service_role";

REVOKE ALL ON FUNCTION public."set_campaign_updated_at"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."set_campaign_updated_at"() TO "anon";

GRANT EXECUTE ON FUNCTION public."set_campaign_updated_at"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."set_campaign_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION public."next_document_counter"(counter_key text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."next_document_counter"(counter_key text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."next_document_counter"(counter_key text) TO "service_role";

REVOKE ALL ON FUNCTION public."next_quote_invoice_number"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."next_quote_invoice_number"() TO "service_role";

REVOKE ALL ON FUNCTION public."prevent_quote_accepted_snapshot_mutation"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."prevent_quote_accepted_snapshot_mutation"() TO "service_role";

REVOKE ALL ON FUNCTION public."enforce_accepted_order_status"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."enforce_accepted_order_status"() TO "anon";

GRANT EXECUTE ON FUNCTION public."enforce_accepted_order_status"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."enforce_accepted_order_status"() TO "service_role";

REVOKE ALL ON FUNCTION public."normalize_accepted_order_status"(p_status text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."normalize_accepted_order_status"(p_status text) TO "anon";

GRANT EXECUTE ON FUNCTION public."normalize_accepted_order_status"(p_status text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."normalize_accepted_order_status"(p_status text) TO "service_role";

REVOKE ALL ON FUNCTION public."set_linked_workflow_status"(p_order_number text, p_status text, p_expected_updated_at timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."set_linked_workflow_status"(p_order_number text, p_status text, p_expected_updated_at timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION public."complete_production_job"(p_job_id uuid, p_actual_machine text, p_quantity_completed numeric, p_actual_print_hours numeric, p_actual_filaments jsonb, p_completion_notes text, p_add_finished_good boolean, p_finished_good_id uuid, p_finished_good_name text, p_sku text, p_sale_price numeric) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public."complete_production_job"(p_job_id uuid, p_status text, p_actual_machine text, p_actual_quantity numeric, p_actual_print_hours numeric, p_actual_grams_used numeric, p_actual_filament_breakdown text, p_close_note text, p_add_finished_good boolean, p_skip_inventory_reduction boolean, p_roll_usages jsonb) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public."complete_production_job"(p_job_id uuid, p_status text, p_actual_machine text, p_actual_quantity numeric, p_actual_print_hours numeric, p_actual_grams_used numeric, p_actual_filament_breakdown text, p_close_note text, p_add_finished_good boolean, p_skip_inventory_reduction boolean, p_raw_material_roll_id uuid, p_finished_roll boolean, p_spool_freed boolean) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public."current_order_commercial_totals"(p_order_id uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."current_order_commercial_totals"(p_order_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION public."current_order_amount_received"(p_order_id uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."current_order_amount_received"(p_order_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION public."complete_production_job"(p_job_id uuid, p_status text, p_actual_machine text, p_actual_quantity numeric, p_actual_print_hours numeric, p_actual_grams_used numeric, p_actual_filament_breakdown text, p_close_note text, p_add_finished_good boolean, p_skip_inventory_reduction boolean) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public."complete_production_job"(p_job_id uuid, p_status text, p_close_outcome text, p_closed_note text, p_actual_machine text, p_actual_print_hours numeric, p_filament_usage jsonb, p_add_to_finished_goods boolean, p_finished_good_name text, p_finished_good_category text, p_finished_good_sale_price numeric, p_finished_good_quantity integer) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public."revise_order_pricing"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_command_id text, p_reason text, p_totals jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."revise_order_pricing"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_command_id text, p_reason text, p_totals jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."revise_order_pricing"(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_command_id text, p_reason text, p_totals jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public."public_order_tracking_lookup"(tracking_identifier text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."public_order_tracking_lookup"(tracking_identifier text) TO "anon";

GRANT EXECUTE ON FUNCTION public."public_order_tracking_lookup"(tracking_identifier text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."public_order_tracking_lookup"(tracking_identifier text) TO "service_role";

REVOKE ALL ON FUNCTION public."post_order_finance_income"(p_order_id uuid, p_order_number text, p_expected_updated_at timestamp with time zone, p_correlation_id text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."post_order_finance_income"(p_order_id uuid, p_order_number text, p_expected_updated_at timestamp with time zone, p_correlation_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."post_order_finance_income"(p_order_id uuid, p_order_number text, p_expected_updated_at timestamp with time zone, p_correlation_id text) TO "service_role";

REVOKE ALL ON FUNCTION public."append_finance_correction"(p_original_entry_id uuid, p_command text, p_amount numeric, p_reason text, p_correlation_id text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."append_finance_correction"(p_original_entry_id uuid, p_command text, p_amount numeric, p_reason text, p_correlation_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."append_finance_correction"(p_original_entry_id uuid, p_command text, p_amount numeric, p_reason text, p_correlation_id text) TO "service_role";

REVOKE ALL ON FUNCTION public."version_accepted_invoice_totals"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."version_accepted_invoice_totals"() TO "service_role";

REVOKE ALL ON FUNCTION public."get_public_campaign"(p_campaign_slug text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."get_public_campaign"(p_campaign_slug text) TO "anon";

GRANT EXECUTE ON FUNCTION public."get_public_campaign"(p_campaign_slug text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_public_campaign"(p_campaign_slug text) TO "service_role";

REVOKE ALL ON FUNCTION public."link_recipe_manifest_revision"(p_recipe_id uuid, p_asset_revision_id uuid, p_manifest_role text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."link_recipe_manifest_revision"(p_recipe_id uuid, p_asset_revision_id uuid, p_manifest_role text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."link_recipe_manifest_revision"(p_recipe_id uuid, p_asset_revision_id uuid, p_manifest_role text) TO "service_role";

REVOKE ALL ON FUNCTION public."transfer_accepted_quote_asset_links"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."transfer_accepted_quote_asset_links"() TO "service_role";

REVOKE ALL ON FUNCTION public."reject_campaign_submission_snapshot_mutation"() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."reject_campaign_submission_snapshot_mutation"() TO "anon";

GRANT EXECUTE ON FUNCTION public."reject_campaign_submission_snapshot_mutation"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."reject_campaign_submission_snapshot_mutation"() TO "service_role";

REVOKE ALL ON FUNCTION public."preacceptance_production_command"(p_job_id uuid, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."preacceptance_production_command"(p_job_id uuid, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."preacceptance_production_command"(p_job_id uuid, p_command text, p_expected_updated_at timestamp with time zone, p_payload jsonb, p_correlation_id text, p_causation_id text) TO "service_role";

REVOKE ALL ON FUNCTION public."submit_campaign_submission"(p_request jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."submit_campaign_submission"(p_request jsonb) TO "anon";

GRANT EXECUTE ON FUNCTION public."submit_campaign_submission"(p_request jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."submit_campaign_submission"(p_request jsonb) TO "service_role";

REVOKE ALL ON FUNCTION public."review_campaign_submission"(p_submission_id uuid, p_next_status text, p_internal_notes text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."review_campaign_submission"(p_submission_id uuid, p_next_status text, p_internal_notes text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."review_campaign_submission"(p_submission_id uuid, p_next_status text, p_internal_notes text) TO "service_role";

REVOKE ALL ON FUNCTION public."create_production_job_for_order"(p_order_id uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public."create_production_job_for_order"(p_order_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."create_production_job_for_order"(p_order_id uuid) TO "service_role";

REVOKE ALL ON TABLE public."project_events" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."quote_accepted_commercial_snapshots" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."finance_correction_receipts" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."order_payment_command_receipts" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."campaigns" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."document_counters" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."campaign_products" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."production_linkage_audit" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."production_attempt_consumption_receipts" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."workflow_command_receipts" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."quotes" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."inventory_transactions" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."hub_reminders" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."hub_notes" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."order_tracking_public" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."production_material_reservations" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."campaign_submission_items" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."catalog_parts" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."parts_catalog" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."active_projects" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."orders" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."campaign_order_conversion_snapshots" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."campaign_submissions" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."order_pricing_revisions" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."production_job_roll_usage" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."production_jobs" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."finished_goods_inventory" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."reusable_spool_pool" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."printer_pm" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."raw_material_inventory" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."non_filament_materials" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."inventory_spool_pool" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."inventory_settings" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."product_recipes" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."financial_entries" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."asset_links" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."customers" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public."asset_records" FROM PUBLIC, anon, authenticated;

GRANT INSERT ON TABLE public."project_events" TO "authenticated";

GRANT SELECT ON TABLE public."project_events" TO "authenticated";

GRANT UPDATE ON TABLE public."project_events" TO "authenticated";

GRANT DELETE ON TABLE public."project_events" TO "authenticated";

GRANT INSERT ON TABLE public."project_events" TO "service_role";

GRANT SELECT ON TABLE public."project_events" TO "service_role";

GRANT UPDATE ON TABLE public."project_events" TO "service_role";

GRANT DELETE ON TABLE public."project_events" TO "service_role";

GRANT INSERT ON TABLE public."quote_accepted_commercial_snapshots" TO "service_role";

GRANT SELECT ON TABLE public."quote_accepted_commercial_snapshots" TO "service_role";

GRANT UPDATE ON TABLE public."quote_accepted_commercial_snapshots" TO "service_role";

GRANT DELETE ON TABLE public."quote_accepted_commercial_snapshots" TO "service_role";

GRANT INSERT ON TABLE public."finance_correction_receipts" TO "service_role";

GRANT SELECT ON TABLE public."finance_correction_receipts" TO "service_role";

GRANT UPDATE ON TABLE public."finance_correction_receipts" TO "service_role";

GRANT DELETE ON TABLE public."finance_correction_receipts" TO "service_role";

GRANT SELECT ON TABLE public."finance_correction_receipts" TO "authenticated";

GRANT INSERT ON TABLE public."order_payment_command_receipts" TO "service_role";

GRANT SELECT ON TABLE public."order_payment_command_receipts" TO "service_role";

GRANT UPDATE ON TABLE public."order_payment_command_receipts" TO "service_role";

GRANT DELETE ON TABLE public."order_payment_command_receipts" TO "service_role";

GRANT INSERT ON TABLE public."campaigns" TO "authenticated";

GRANT SELECT ON TABLE public."campaigns" TO "authenticated";

GRANT UPDATE ON TABLE public."campaigns" TO "authenticated";

GRANT DELETE ON TABLE public."campaigns" TO "authenticated";

GRANT INSERT ON TABLE public."campaigns" TO "service_role";

GRANT SELECT ON TABLE public."campaigns" TO "service_role";

GRANT UPDATE ON TABLE public."campaigns" TO "service_role";

GRANT DELETE ON TABLE public."campaigns" TO "service_role";

GRANT INSERT ON TABLE public."document_counters" TO "service_role";

GRANT SELECT ON TABLE public."document_counters" TO "service_role";

GRANT UPDATE ON TABLE public."document_counters" TO "service_role";

GRANT DELETE ON TABLE public."document_counters" TO "service_role";

GRANT INSERT ON TABLE public."campaign_products" TO "authenticated";

GRANT SELECT ON TABLE public."campaign_products" TO "authenticated";

GRANT UPDATE ON TABLE public."campaign_products" TO "authenticated";

GRANT DELETE ON TABLE public."campaign_products" TO "authenticated";

GRANT INSERT ON TABLE public."campaign_products" TO "service_role";

GRANT SELECT ON TABLE public."campaign_products" TO "service_role";

GRANT UPDATE ON TABLE public."campaign_products" TO "service_role";

GRANT DELETE ON TABLE public."campaign_products" TO "service_role";

GRANT INSERT ON TABLE public."production_linkage_audit" TO "service_role";

GRANT SELECT ON TABLE public."production_linkage_audit" TO "service_role";

GRANT UPDATE ON TABLE public."production_linkage_audit" TO "service_role";

GRANT DELETE ON TABLE public."production_linkage_audit" TO "service_role";

GRANT SELECT ON TABLE public."production_linkage_audit" TO "authenticated";

GRANT INSERT ON TABLE public."production_linkage_candidates" TO "authenticated";

GRANT SELECT ON TABLE public."production_linkage_candidates" TO "authenticated";

GRANT UPDATE ON TABLE public."production_linkage_candidates" TO "authenticated";

GRANT DELETE ON TABLE public."production_linkage_candidates" TO "authenticated";

GRANT INSERT ON TABLE public."production_linkage_candidates" TO "service_role";

GRANT SELECT ON TABLE public."production_linkage_candidates" TO "service_role";

GRANT UPDATE ON TABLE public."production_linkage_candidates" TO "service_role";

GRANT DELETE ON TABLE public."production_linkage_candidates" TO "service_role";

GRANT INSERT ON TABLE public."production_attempt_consumption_receipts" TO "service_role";

GRANT SELECT ON TABLE public."production_attempt_consumption_receipts" TO "service_role";

GRANT UPDATE ON TABLE public."production_attempt_consumption_receipts" TO "service_role";

GRANT DELETE ON TABLE public."production_attempt_consumption_receipts" TO "service_role";

GRANT INSERT ON TABLE public."workflow_command_receipts" TO "service_role";

GRANT SELECT ON TABLE public."workflow_command_receipts" TO "service_role";

GRANT UPDATE ON TABLE public."workflow_command_receipts" TO "service_role";

GRANT DELETE ON TABLE public."workflow_command_receipts" TO "service_role";

GRANT INSERT ON TABLE public."quotes" TO "anon";

GRANT SELECT ON TABLE public."quotes" TO "anon";

GRANT UPDATE ON TABLE public."quotes" TO "anon";

GRANT DELETE ON TABLE public."quotes" TO "anon";

GRANT INSERT ON TABLE public."quotes" TO "authenticated";

GRANT SELECT ON TABLE public."quotes" TO "authenticated";

GRANT UPDATE ON TABLE public."quotes" TO "authenticated";

GRANT DELETE ON TABLE public."quotes" TO "authenticated";

GRANT INSERT ON TABLE public."quotes" TO "service_role";

GRANT SELECT ON TABLE public."quotes" TO "service_role";

GRANT UPDATE ON TABLE public."quotes" TO "service_role";

GRANT DELETE ON TABLE public."quotes" TO "service_role";

GRANT INSERT ON TABLE public."production_legacy_classification_report" TO "authenticated";

GRANT SELECT ON TABLE public."production_legacy_classification_report" TO "authenticated";

GRANT UPDATE ON TABLE public."production_legacy_classification_report" TO "authenticated";

GRANT DELETE ON TABLE public."production_legacy_classification_report" TO "authenticated";

GRANT INSERT ON TABLE public."production_legacy_classification_report" TO "service_role";

GRANT SELECT ON TABLE public."production_legacy_classification_report" TO "service_role";

GRANT UPDATE ON TABLE public."production_legacy_classification_report" TO "service_role";

GRANT DELETE ON TABLE public."production_legacy_classification_report" TO "service_role";

GRANT INSERT ON TABLE public."inventory_transactions" TO "anon";

GRANT SELECT ON TABLE public."inventory_transactions" TO "anon";

GRANT UPDATE ON TABLE public."inventory_transactions" TO "anon";

GRANT DELETE ON TABLE public."inventory_transactions" TO "anon";

GRANT INSERT ON TABLE public."inventory_transactions" TO "authenticated";

GRANT SELECT ON TABLE public."inventory_transactions" TO "authenticated";

GRANT UPDATE ON TABLE public."inventory_transactions" TO "authenticated";

GRANT DELETE ON TABLE public."inventory_transactions" TO "authenticated";

GRANT INSERT ON TABLE public."inventory_transactions" TO "service_role";

GRANT SELECT ON TABLE public."inventory_transactions" TO "service_role";

GRANT UPDATE ON TABLE public."inventory_transactions" TO "service_role";

GRANT DELETE ON TABLE public."inventory_transactions" TO "service_role";

GRANT INSERT ON TABLE public."hub_reminders" TO "anon";

GRANT SELECT ON TABLE public."hub_reminders" TO "anon";

GRANT UPDATE ON TABLE public."hub_reminders" TO "anon";

GRANT DELETE ON TABLE public."hub_reminders" TO "anon";

GRANT INSERT ON TABLE public."hub_reminders" TO "authenticated";

GRANT SELECT ON TABLE public."hub_reminders" TO "authenticated";

GRANT UPDATE ON TABLE public."hub_reminders" TO "authenticated";

GRANT DELETE ON TABLE public."hub_reminders" TO "authenticated";

GRANT INSERT ON TABLE public."hub_reminders" TO "service_role";

GRANT SELECT ON TABLE public."hub_reminders" TO "service_role";

GRANT UPDATE ON TABLE public."hub_reminders" TO "service_role";

GRANT DELETE ON TABLE public."hub_reminders" TO "service_role";

GRANT INSERT ON TABLE public."hub_notes" TO "anon";

GRANT SELECT ON TABLE public."hub_notes" TO "anon";

GRANT UPDATE ON TABLE public."hub_notes" TO "anon";

GRANT DELETE ON TABLE public."hub_notes" TO "anon";

GRANT INSERT ON TABLE public."hub_notes" TO "authenticated";

GRANT SELECT ON TABLE public."hub_notes" TO "authenticated";

GRANT UPDATE ON TABLE public."hub_notes" TO "authenticated";

GRANT DELETE ON TABLE public."hub_notes" TO "authenticated";

GRANT INSERT ON TABLE public."hub_notes" TO "service_role";

GRANT SELECT ON TABLE public."hub_notes" TO "service_role";

GRANT UPDATE ON TABLE public."hub_notes" TO "service_role";

GRANT DELETE ON TABLE public."hub_notes" TO "service_role";

GRANT SELECT ON TABLE public."order_tracking_public" TO "authenticated";

GRANT INSERT ON TABLE public."order_tracking_public" TO "service_role";

GRANT SELECT ON TABLE public."order_tracking_public" TO "service_role";

GRANT UPDATE ON TABLE public."order_tracking_public" TO "service_role";

GRANT DELETE ON TABLE public."order_tracking_public" TO "service_role";

GRANT INSERT ON TABLE public."production_material_reservations" TO "service_role";

GRANT SELECT ON TABLE public."production_material_reservations" TO "service_role";

GRANT UPDATE ON TABLE public."production_material_reservations" TO "service_role";

GRANT DELETE ON TABLE public."production_material_reservations" TO "service_role";

GRANT SELECT ON TABLE public."production_material_reservations" TO "authenticated";

GRANT INSERT ON TABLE public."campaign_submission_items" TO "service_role";

GRANT SELECT ON TABLE public."campaign_submission_items" TO "service_role";

GRANT UPDATE ON TABLE public."campaign_submission_items" TO "service_role";

GRANT DELETE ON TABLE public."campaign_submission_items" TO "service_role";

GRANT SELECT ON TABLE public."campaign_submission_items" TO "authenticated";

GRANT INSERT ON TABLE public."catalog_parts" TO "anon";

GRANT SELECT ON TABLE public."catalog_parts" TO "anon";

GRANT UPDATE ON TABLE public."catalog_parts" TO "anon";

GRANT DELETE ON TABLE public."catalog_parts" TO "anon";

GRANT INSERT ON TABLE public."catalog_parts" TO "authenticated";

GRANT SELECT ON TABLE public."catalog_parts" TO "authenticated";

GRANT UPDATE ON TABLE public."catalog_parts" TO "authenticated";

GRANT DELETE ON TABLE public."catalog_parts" TO "authenticated";

GRANT INSERT ON TABLE public."catalog_parts" TO "service_role";

GRANT SELECT ON TABLE public."catalog_parts" TO "service_role";

GRANT UPDATE ON TABLE public."catalog_parts" TO "service_role";

GRANT DELETE ON TABLE public."catalog_parts" TO "service_role";

GRANT INSERT ON TABLE public."parts_catalog" TO "authenticated";

GRANT SELECT ON TABLE public."parts_catalog" TO "authenticated";

GRANT UPDATE ON TABLE public."parts_catalog" TO "authenticated";

GRANT DELETE ON TABLE public."parts_catalog" TO "authenticated";

GRANT INSERT ON TABLE public."parts_catalog" TO "service_role";

GRANT SELECT ON TABLE public."parts_catalog" TO "service_role";

GRANT UPDATE ON TABLE public."parts_catalog" TO "service_role";

GRANT DELETE ON TABLE public."parts_catalog" TO "service_role";

GRANT INSERT ON TABLE public."active_project_queue_summary" TO "authenticated";

GRANT SELECT ON TABLE public."active_project_queue_summary" TO "authenticated";

GRANT UPDATE ON TABLE public."active_project_queue_summary" TO "authenticated";

GRANT DELETE ON TABLE public."active_project_queue_summary" TO "authenticated";

GRANT INSERT ON TABLE public."active_project_queue_summary" TO "service_role";

GRANT SELECT ON TABLE public."active_project_queue_summary" TO "service_role";

GRANT UPDATE ON TABLE public."active_project_queue_summary" TO "service_role";

GRANT DELETE ON TABLE public."active_project_queue_summary" TO "service_role";

GRANT INSERT ON TABLE public."active_projects" TO "anon";

GRANT SELECT ON TABLE public."active_projects" TO "anon";

GRANT UPDATE ON TABLE public."active_projects" TO "anon";

GRANT DELETE ON TABLE public."active_projects" TO "anon";

GRANT INSERT ON TABLE public."active_projects" TO "authenticated";

GRANT SELECT ON TABLE public."active_projects" TO "authenticated";

GRANT UPDATE ON TABLE public."active_projects" TO "authenticated";

GRANT DELETE ON TABLE public."active_projects" TO "authenticated";

GRANT INSERT ON TABLE public."active_projects" TO "service_role";

GRANT SELECT ON TABLE public."active_projects" TO "service_role";

GRANT UPDATE ON TABLE public."active_projects" TO "service_role";

GRANT DELETE ON TABLE public."active_projects" TO "service_role";

GRANT INSERT ON TABLE public."orders" TO "anon";

GRANT SELECT ON TABLE public."orders" TO "anon";

GRANT DELETE ON TABLE public."orders" TO "anon";

GRANT SELECT ON TABLE public."orders" TO "authenticated";

GRANT INSERT ON TABLE public."orders" TO "service_role";

GRANT SELECT ON TABLE public."orders" TO "service_role";

GRANT UPDATE ON TABLE public."orders" TO "service_role";

GRANT DELETE ON TABLE public."orders" TO "service_role";

GRANT INSERT ON TABLE public."campaign_order_conversion_snapshots" TO "service_role";

GRANT SELECT ON TABLE public."campaign_order_conversion_snapshots" TO "service_role";

GRANT UPDATE ON TABLE public."campaign_order_conversion_snapshots" TO "service_role";

GRANT DELETE ON TABLE public."campaign_order_conversion_snapshots" TO "service_role";

GRANT SELECT ON TABLE public."campaign_order_conversion_snapshots" TO "authenticated";

GRANT INSERT ON TABLE public."campaign_submissions" TO "service_role";

GRANT SELECT ON TABLE public."campaign_submissions" TO "service_role";

GRANT UPDATE ON TABLE public."campaign_submissions" TO "service_role";

GRANT DELETE ON TABLE public."campaign_submissions" TO "service_role";

GRANT SELECT ON TABLE public."campaign_submissions" TO "authenticated";

GRANT INSERT ON TABLE public."order_pricing_revisions" TO "service_role";

GRANT SELECT ON TABLE public."order_pricing_revisions" TO "service_role";

GRANT UPDATE ON TABLE public."order_pricing_revisions" TO "service_role";

GRANT DELETE ON TABLE public."order_pricing_revisions" TO "service_role";

GRANT SELECT ON TABLE public."order_pricing_revisions" TO "authenticated";

GRANT INSERT ON TABLE public."production_job_roll_usage" TO "anon";

GRANT SELECT ON TABLE public."production_job_roll_usage" TO "anon";

GRANT UPDATE ON TABLE public."production_job_roll_usage" TO "anon";

GRANT DELETE ON TABLE public."production_job_roll_usage" TO "anon";

GRANT INSERT ON TABLE public."production_job_roll_usage" TO "authenticated";

GRANT SELECT ON TABLE public."production_job_roll_usage" TO "authenticated";

GRANT UPDATE ON TABLE public."production_job_roll_usage" TO "authenticated";

GRANT DELETE ON TABLE public."production_job_roll_usage" TO "authenticated";

GRANT INSERT ON TABLE public."production_job_roll_usage" TO "service_role";

GRANT SELECT ON TABLE public."production_job_roll_usage" TO "service_role";

GRANT UPDATE ON TABLE public."production_job_roll_usage" TO "service_role";

GRANT DELETE ON TABLE public."production_job_roll_usage" TO "service_role";

GRANT INSERT ON TABLE public."production_jobs" TO "anon";

GRANT SELECT ON TABLE public."production_jobs" TO "anon";

GRANT UPDATE ON TABLE public."production_jobs" TO "anon";

GRANT DELETE ON TABLE public."production_jobs" TO "anon";

GRANT INSERT ON TABLE public."production_jobs" TO "authenticated";

GRANT SELECT ON TABLE public."production_jobs" TO "authenticated";

GRANT UPDATE ON TABLE public."production_jobs" TO "authenticated";

GRANT DELETE ON TABLE public."production_jobs" TO "authenticated";

GRANT INSERT ON TABLE public."production_jobs" TO "service_role";

GRANT SELECT ON TABLE public."production_jobs" TO "service_role";

GRANT UPDATE ON TABLE public."production_jobs" TO "service_role";

GRANT DELETE ON TABLE public."production_jobs" TO "service_role";

GRANT INSERT ON TABLE public."finished_goods_inventory" TO "anon";

GRANT SELECT ON TABLE public."finished_goods_inventory" TO "anon";

GRANT UPDATE ON TABLE public."finished_goods_inventory" TO "anon";

GRANT DELETE ON TABLE public."finished_goods_inventory" TO "anon";

GRANT INSERT ON TABLE public."finished_goods_inventory" TO "authenticated";

GRANT SELECT ON TABLE public."finished_goods_inventory" TO "authenticated";

GRANT UPDATE ON TABLE public."finished_goods_inventory" TO "authenticated";

GRANT DELETE ON TABLE public."finished_goods_inventory" TO "authenticated";

GRANT INSERT ON TABLE public."finished_goods_inventory" TO "service_role";

GRANT SELECT ON TABLE public."finished_goods_inventory" TO "service_role";

GRANT UPDATE ON TABLE public."finished_goods_inventory" TO "service_role";

GRANT DELETE ON TABLE public."finished_goods_inventory" TO "service_role";

GRANT INSERT ON TABLE public."reusable_spool_pool" TO "anon";

GRANT SELECT ON TABLE public."reusable_spool_pool" TO "anon";

GRANT UPDATE ON TABLE public."reusable_spool_pool" TO "anon";

GRANT DELETE ON TABLE public."reusable_spool_pool" TO "anon";

GRANT INSERT ON TABLE public."reusable_spool_pool" TO "authenticated";

GRANT SELECT ON TABLE public."reusable_spool_pool" TO "authenticated";

GRANT UPDATE ON TABLE public."reusable_spool_pool" TO "authenticated";

GRANT DELETE ON TABLE public."reusable_spool_pool" TO "authenticated";

GRANT INSERT ON TABLE public."reusable_spool_pool" TO "service_role";

GRANT SELECT ON TABLE public."reusable_spool_pool" TO "service_role";

GRANT UPDATE ON TABLE public."reusable_spool_pool" TO "service_role";

GRANT DELETE ON TABLE public."reusable_spool_pool" TO "service_role";

GRANT INSERT ON TABLE public."printer_pm" TO "anon";

GRANT SELECT ON TABLE public."printer_pm" TO "anon";

GRANT UPDATE ON TABLE public."printer_pm" TO "anon";

GRANT DELETE ON TABLE public."printer_pm" TO "anon";

GRANT INSERT ON TABLE public."printer_pm" TO "authenticated";

GRANT SELECT ON TABLE public."printer_pm" TO "authenticated";

GRANT UPDATE ON TABLE public."printer_pm" TO "authenticated";

GRANT DELETE ON TABLE public."printer_pm" TO "authenticated";

GRANT INSERT ON TABLE public."printer_pm" TO "service_role";

GRANT SELECT ON TABLE public."printer_pm" TO "service_role";

GRANT UPDATE ON TABLE public."printer_pm" TO "service_role";

GRANT DELETE ON TABLE public."printer_pm" TO "service_role";

GRANT INSERT ON TABLE public."raw_material_inventory" TO "anon";

GRANT SELECT ON TABLE public."raw_material_inventory" TO "anon";

GRANT UPDATE ON TABLE public."raw_material_inventory" TO "anon";

GRANT DELETE ON TABLE public."raw_material_inventory" TO "anon";

GRANT INSERT ON TABLE public."raw_material_inventory" TO "authenticated";

GRANT SELECT ON TABLE public."raw_material_inventory" TO "authenticated";

GRANT UPDATE ON TABLE public."raw_material_inventory" TO "authenticated";

GRANT DELETE ON TABLE public."raw_material_inventory" TO "authenticated";

GRANT INSERT ON TABLE public."raw_material_inventory" TO "service_role";

GRANT SELECT ON TABLE public."raw_material_inventory" TO "service_role";

GRANT UPDATE ON TABLE public."raw_material_inventory" TO "service_role";

GRANT DELETE ON TABLE public."raw_material_inventory" TO "service_role";

GRANT INSERT ON TABLE public."non_filament_materials" TO "anon";

GRANT SELECT ON TABLE public."non_filament_materials" TO "anon";

GRANT UPDATE ON TABLE public."non_filament_materials" TO "anon";

GRANT DELETE ON TABLE public."non_filament_materials" TO "anon";

GRANT INSERT ON TABLE public."non_filament_materials" TO "authenticated";

GRANT SELECT ON TABLE public."non_filament_materials" TO "authenticated";

GRANT UPDATE ON TABLE public."non_filament_materials" TO "authenticated";

GRANT DELETE ON TABLE public."non_filament_materials" TO "authenticated";

GRANT INSERT ON TABLE public."non_filament_materials" TO "service_role";

GRANT SELECT ON TABLE public."non_filament_materials" TO "service_role";

GRANT UPDATE ON TABLE public."non_filament_materials" TO "service_role";

GRANT DELETE ON TABLE public."non_filament_materials" TO "service_role";

GRANT INSERT ON TABLE public."raw_material_low_stock" TO "authenticated";

GRANT SELECT ON TABLE public."raw_material_low_stock" TO "authenticated";

GRANT UPDATE ON TABLE public."raw_material_low_stock" TO "authenticated";

GRANT DELETE ON TABLE public."raw_material_low_stock" TO "authenticated";

GRANT INSERT ON TABLE public."raw_material_low_stock" TO "service_role";

GRANT SELECT ON TABLE public."raw_material_low_stock" TO "service_role";

GRANT UPDATE ON TABLE public."raw_material_low_stock" TO "service_role";

GRANT DELETE ON TABLE public."raw_material_low_stock" TO "service_role";

GRANT INSERT ON TABLE public."finished_goods_low_stock" TO "authenticated";

GRANT SELECT ON TABLE public."finished_goods_low_stock" TO "authenticated";

GRANT UPDATE ON TABLE public."finished_goods_low_stock" TO "authenticated";

GRANT DELETE ON TABLE public."finished_goods_low_stock" TO "authenticated";

GRANT INSERT ON TABLE public."finished_goods_low_stock" TO "service_role";

GRANT SELECT ON TABLE public."finished_goods_low_stock" TO "service_role";

GRANT UPDATE ON TABLE public."finished_goods_low_stock" TO "service_role";

GRANT DELETE ON TABLE public."finished_goods_low_stock" TO "service_role";

GRANT INSERT ON TABLE public."inventory_spool_pool" TO "anon";

GRANT SELECT ON TABLE public."inventory_spool_pool" TO "anon";

GRANT UPDATE ON TABLE public."inventory_spool_pool" TO "anon";

GRANT DELETE ON TABLE public."inventory_spool_pool" TO "anon";

GRANT INSERT ON TABLE public."inventory_spool_pool" TO "authenticated";

GRANT SELECT ON TABLE public."inventory_spool_pool" TO "authenticated";

GRANT UPDATE ON TABLE public."inventory_spool_pool" TO "authenticated";

GRANT DELETE ON TABLE public."inventory_spool_pool" TO "authenticated";

GRANT INSERT ON TABLE public."inventory_spool_pool" TO "service_role";

GRANT SELECT ON TABLE public."inventory_spool_pool" TO "service_role";

GRANT UPDATE ON TABLE public."inventory_spool_pool" TO "service_role";

GRANT DELETE ON TABLE public."inventory_spool_pool" TO "service_role";

GRANT INSERT ON TABLE public."inventory_settings" TO "anon";

GRANT SELECT ON TABLE public."inventory_settings" TO "anon";

GRANT UPDATE ON TABLE public."inventory_settings" TO "anon";

GRANT DELETE ON TABLE public."inventory_settings" TO "anon";

GRANT INSERT ON TABLE public."inventory_settings" TO "authenticated";

GRANT SELECT ON TABLE public."inventory_settings" TO "authenticated";

GRANT UPDATE ON TABLE public."inventory_settings" TO "authenticated";

GRANT DELETE ON TABLE public."inventory_settings" TO "authenticated";

GRANT INSERT ON TABLE public."inventory_settings" TO "service_role";

GRANT SELECT ON TABLE public."inventory_settings" TO "service_role";

GRANT UPDATE ON TABLE public."inventory_settings" TO "service_role";

GRANT DELETE ON TABLE public."inventory_settings" TO "service_role";

GRANT INSERT ON TABLE public."product_recipes" TO "anon";

GRANT SELECT ON TABLE public."product_recipes" TO "anon";

GRANT UPDATE ON TABLE public."product_recipes" TO "anon";

GRANT DELETE ON TABLE public."product_recipes" TO "anon";

GRANT INSERT ON TABLE public."product_recipes" TO "authenticated";

GRANT SELECT ON TABLE public."product_recipes" TO "authenticated";

GRANT UPDATE ON TABLE public."product_recipes" TO "authenticated";

GRANT DELETE ON TABLE public."product_recipes" TO "authenticated";

GRANT INSERT ON TABLE public."product_recipes" TO "service_role";

GRANT SELECT ON TABLE public."product_recipes" TO "service_role";

GRANT UPDATE ON TABLE public."product_recipes" TO "service_role";

GRANT DELETE ON TABLE public."product_recipes" TO "service_role";

GRANT SELECT ON TABLE public."financial_entries" TO "anon";

GRANT SELECT ON TABLE public."financial_entries" TO "authenticated";

GRANT DELETE ON TABLE public."financial_entries" TO "authenticated";

GRANT INSERT ON TABLE public."financial_entries" TO "service_role";

GRANT SELECT ON TABLE public."financial_entries" TO "service_role";

GRANT UPDATE ON TABLE public."financial_entries" TO "service_role";

GRANT DELETE ON TABLE public."financial_entries" TO "service_role";

GRANT INSERT ON TABLE public."asset_links" TO "anon";

GRANT SELECT ON TABLE public."asset_links" TO "anon";

GRANT UPDATE ON TABLE public."asset_links" TO "anon";

GRANT DELETE ON TABLE public."asset_links" TO "anon";

GRANT INSERT ON TABLE public."asset_links" TO "authenticated";

GRANT SELECT ON TABLE public."asset_links" TO "authenticated";

GRANT UPDATE ON TABLE public."asset_links" TO "authenticated";

GRANT DELETE ON TABLE public."asset_links" TO "authenticated";

GRANT INSERT ON TABLE public."asset_links" TO "service_role";

GRANT SELECT ON TABLE public."asset_links" TO "service_role";

GRANT UPDATE ON TABLE public."asset_links" TO "service_role";

GRANT DELETE ON TABLE public."asset_links" TO "service_role";

GRANT INSERT ON TABLE public."customers" TO "service_role";

GRANT SELECT ON TABLE public."customers" TO "service_role";

GRANT UPDATE ON TABLE public."customers" TO "service_role";

GRANT DELETE ON TABLE public."customers" TO "service_role";

GRANT INSERT ON TABLE public."asset_records" TO "anon";

GRANT SELECT ON TABLE public."asset_records" TO "anon";

GRANT UPDATE ON TABLE public."asset_records" TO "anon";

GRANT DELETE ON TABLE public."asset_records" TO "anon";

GRANT INSERT ON TABLE public."asset_records" TO "authenticated";

GRANT SELECT ON TABLE public."asset_records" TO "authenticated";

GRANT UPDATE ON TABLE public."asset_records" TO "authenticated";

GRANT DELETE ON TABLE public."asset_records" TO "authenticated";

GRANT INSERT ON TABLE public."asset_records" TO "service_role";

GRANT SELECT ON TABLE public."asset_records" TO "service_role";

GRANT UPDATE ON TABLE public."asset_records" TO "service_role";

GRANT DELETE ON TABLE public."asset_records" TO "service_role";

GRANT UPDATE ("amount") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("business_use_percent") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("category") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("destination_county") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("entry_date") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("labor_cost") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("material_cost") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("mileage_rate") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("miles_driven") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("notes") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("original_amount") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("other_direct_cost") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("packaging_cost") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("payment_method") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("receipt_link") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("round_trip") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("sales_county") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("sales_tax_collected") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("sales_tax_rate") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("shipping_charged") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("shipping_cost") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("tax_category") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("tax_exempt_sale") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("tax_included") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("title") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("trip_from") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("trip_purpose") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("trip_to") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("type") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("updated_at") ON TABLE public."financial_entries" TO "authenticated";

GRANT UPDATE ("vendor_name") ON TABLE public."financial_entries" TO "authenticated";

GRANT USAGE, SELECT ON SEQUENCE public."olipoly_order_number_seq" TO authenticated, service_role;

COMMIT;
