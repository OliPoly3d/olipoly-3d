-- READ ONLY. Run against ERP Test before and after the approved migration.
-- Compare during a quiet window, before entering additional test activity.
WITH records AS (
 SELECT 'orders' AS table_name,to_jsonb(t) AS row_data FROM public.orders t
 UNION ALL SELECT 'quotes',to_jsonb(t) FROM public.quotes t
 UNION ALL SELECT 'customers',to_jsonb(t) FROM public.customers t
 UNION ALL SELECT 'production_jobs',to_jsonb(t) FROM public.production_jobs t
 UNION ALL SELECT 'financial_entries',to_jsonb(t) FROM public.financial_entries t
 UNION ALL SELECT 'accepted_snapshots',to_jsonb(t) FROM public.quote_accepted_commercial_snapshots t
 UNION ALL SELECT 'raw_material_inventory',to_jsonb(t)-ARRAY['tare_grams','last_gross_grams','last_weighed_at'] FROM public.raw_material_inventory t
 UNION ALL SELECT 'non_filament_materials',to_jsonb(t) FROM public.non_filament_materials t
 UNION ALL SELECT 'inventory_spool_pool',to_jsonb(t) FROM public.inventory_spool_pool t
 UNION ALL SELECT 'inventory_transactions',to_jsonb(t) FROM public.inventory_transactions t
 UNION ALL SELECT 'production_material_reservations',to_jsonb(t) FROM public.production_material_reservations t
 UNION ALL SELECT 'ops_preview_workspaces',to_jsonb(t) FROM public.ops_preview_workspaces t
 UNION ALL SELECT 'document_counters',to_jsonb(t) FROM public.document_counters t
), names AS (SELECT unnest(ARRAY['orders','quotes','customers','production_jobs','financial_entries','accepted_snapshots','raw_material_inventory','non_filament_materials','inventory_spool_pool','inventory_transactions','production_material_reservations','ops_preview_workspaces','document_counters']) table_name)
SELECT n.table_name,count(r.row_data)::integer AS row_count,md5(coalesce(string_agg(r.row_data::text,E'\n' ORDER BY r.row_data::text),'')) AS fingerprint
FROM names n LEFT JOIN records r USING(table_name) GROUP BY n.table_name ORDER BY n.table_name;
