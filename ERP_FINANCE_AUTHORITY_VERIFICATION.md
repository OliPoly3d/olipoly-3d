# ERP Finance Authority Verification Milestone

Documentation-only milestone for ERP Blueprint v1 Finance ownership and cross-domain write verification.

## Scope guard

This milestone **does not** implement fixes or change application code, migrations, schema, RLS, grants, data, tests, or UI. It records repository evidence and supplies read-only deployed verification SQL that an operator can run separately.

Fundraiser Finance behavior is **deferred** behind an explicit extension gate. Do not implement fundraiser Finance until the core Finance authority contract is resolved.

## Evidence categories

- **Confirmed repository evidence** — directly visible in this repository.
- **Operator-supplied deployed evidence** — evidence produced by running the read-only SQL against the deployed Supabase project.
- **Repository inference** — a cautious conclusion from code paths, comments, and naming, not a deployed fact.
- **Requires deployed verification** — cannot be proven from repository contents alone.
- **Historical or abandoned behavior** — archive, legacy compatibility, or fallback behavior that should not be treated as the current contract without additional confirmation.

## Contract classification table

| Contract | Classification | Evidence category | Repository evidence |
|---|---:|---|---|
| Finance owns `financial_entries`. | **Partially compliant** | Confirmed repository evidence | `finance-pro.js` is the primary Finance UI and reads/writes `financial_entries`; however, Orders Admin also inserts `financial_entries` directly. |
| Income lifecycle. | **Partially compliant** | Confirmed repository evidence | Finance Pro validates manual income, county/rate, tax exemption, shipping charged, direct costs, insert/update/delete; Orders Admin auto-posts income splits for sale, shipping, and tax. |
| Expense lifecycle. | **Partially compliant** | Confirmed repository evidence | Finance Pro supports manual expense entries, business-use adjustment, mileage, startup tagging, update, and delete. No repository-visible deployed constraints/audit/reversal contract proves authoritative lifecycle closure. |
| Order and invoice revenue projection. | **Conflicting** | Confirmed repository evidence | Orders Admin computes invoice data from order fields and can post revenue directly. |
| Deposit, balance, payment, refund, and tax evidence. | **Partially compliant** | Confirmed repository evidence | Orders fields and UI include deposit, balance, payment statuses including refunded, tax exemption, and Finance Pro tax fields. Refund/reversal accounting evidence is not implemented as a durable Finance lifecycle in repository code. |
| Production cost projection versus authoritative Finance entries. | **Partially compliant** | Confirmed repository evidence / Repository inference | Production estimates revenue/cost/profit from job/order values. Finance Pro separately stores material, packaging, labor, other direct cost fields. No repository evidence links Production cost projections to authoritative Finance entries. |
| Inventory material-cost projection boundaries. | **Partially compliant** | Confirmed repository evidence / Repository inference | Production owns usage/reservation and quote drafts may carry estimated shipping/material values; Finance stores material costs as accounting entries. No financial-entry writes were found in Production code. |
| Shipping charged versus shipping cost. | **Partially compliant** | Confirmed repository evidence | Finance Pro separates `shipping_charged` and `shipping_cost`; Orders Admin posts shipping revenue but sets posted shipping cost to zero. |
| Manual Finance entry authority. | **Partially compliant** | Confirmed repository evidence | Finance Pro can manually insert, update, and delete Finance entries for the current user. Deletion/audit/reversal authority is not repository-proven. |
| Automatic Finance posting paths. | **Conflicting** | Confirmed repository evidence | Orders Admin directly POSTs to `/rest/v1/financial_entries` and then PATCHes Orders `finance_pushed` fields. |
| Duplicate revenue or expense posting. | **Partially compliant** | Confirmed repository evidence | Orders Admin checks title/notes for the order number before posting and prompts on duplicates, but also allows repush/duplicate creation. |
| Order `finance_pushed` and `finance_pushed_at` behavior. | **Partially compliant** | Confirmed repository evidence | Orders Admin sets both after posting; if order flag PATCH fails after Finance insert, code reports a split-brain error but has no rollback. |
| Invoice sent/paid lifecycle. | **Partially compliant** | Confirmed repository evidence | Orders Admin marks invoice fields and invoice sent timestamps; paid/refunded are order payment statuses. Finance-owned invoice/payment lifecycle is not repository-proven. |
| Quote and Order commercial snapshot boundaries. | **Conflicting** | Confirmed repository evidence | Quote uses `calculateQuoteTotals()` and saves quote totals; Orders Admin invoice rendering recalculates subtotal/tax/total from order fields. |
| Browser direct-write paths. | **Conflicting** | Confirmed repository evidence | Browser JavaScript directly calls Supabase REST for `financial_entries`, `orders`, `quotes`, and workflow RPCs. |
| Supabase tables, functions, RPCs, triggers, policies, grants, and constraints. | **Unable to verify from repository evidence** | Requires deployed verification | Current migrations do not define the complete `financial_entries`, `orders`, and `quotes` authoritative schema/policy set referenced by the app. |
| Legacy/localStorage Finance compatibility. | **Partially compliant** | Confirmed repository evidence / Historical or abandoned behavior | Finance stores UI/dashboard settings in localStorage and reads shared auth tokens. Older archived quote tooling uses local transfer/fallback storage. |
| Deletion, correction, reversal, and audit evidence. | **Missing** | Confirmed repository evidence | Finance Pro deletes rows directly and updates rows in place. No repository-visible reversal/correction ledger, audit trigger, or delete prohibition was found. |
| Fundraiser Finance behavior. | **Missing** | Repository inference | Fundraiser documentation exists, but Finance behavior is explicitly deferred as an extension gate for a future milestone. |

## Confirmed repository evidence

- Finance Pro imports Supabase, configures the deployed project URL/key, and treats `financial_entries` as its entry store.
- Finance Pro fetches `financial_entries` filtered by current `user_id`.
- Finance Pro can insert, update, and delete `financial_entries` from browser code.
- Finance Pro distinguishes income and expense behavior, validates income county/tax rate unless exempt, and records sales tax, shipping charged, shipping cost, material cost, packaging cost, labor cost, and other direct cost.
- Orders Admin can create split Finance entries directly: Sale, Shipping/Freight, and Sales Tax Collected.
- Orders Admin checks for likely existing Finance entries by searching titles/notes for the order number, but lets an operator continue after prompts.
- Orders Admin sets `finance_pushed` and `finance_pushed_at` after successful Finance insert, and warns if the order flag cannot be saved.
- Orders Admin marks invoice sent by PATCHing `orders` invoice fields and `invoice_sent_at` directly.
- Quote uses `calculateQuoteTotals()` for tax/deposit/balance calculations, while Orders Admin has independent invoice calculations.
- Quote reads recent `financial_entries` income tax-rate data to populate tax jurisdiction presets; this is a read/projection path, not a Finance write path.

## Operator-supplied deployed evidence

The following deployed findings were supplied by the operator for this corrective milestone. Codex did not connect to Supabase, run SQL, deploy, backfill, or modify historical data.

- `financial_entries` has 74 rows: 22 income and 52 expense.
- Income totals 1179.33; expense totals 4181.64.
- All three paid/closed Orders have matching Finance evidence.
- No Finance references point to missing Orders.
- No negative or impossible financial values were found.
- One entry has shipping charged without shipping cost; this is historical evidence and is intentionally unchanged.
- Five craft-show income rows are duplicate candidates but are not proven duplicates; they remain unresolved, not duplicates.
- No refund, reversal, or correction evidence exists.
- RLS is enabled.
- Authenticated clients can directly mutate `financial_entries`.
- `anon` has table-level mutation privileges, although deployed RLS is owner-scoped.
- Historical cleanup and duplicate reinterpretation are prohibited.

## Repository inference

- The repository intends Finance to own revenue, tax, receipts/payments, expenses, reporting, and realized profit, but current browser write paths blur command authority.
- Production and Inventory appear to produce cost/usage projections rather than writing accounting entries directly.
- Shipping revenue and shipping cost are modeled separately, but the automatic Orders posting path only posts shipping charged/revenue and sets shipping cost to zero.
- Deposit and balance are operational order/quote fields, not clearly implemented as Finance payment allocations.

## Requires deployed verification

- Actual deployed columns, indexes, constraints, triggers, RLS enablement/force state, policies, grants, and function/RPC definitions for `financial_entries`, `orders`, `quotes`, `production_jobs`, inventory/material tables, and fundraiser tables if any.
- Whether browser roles effectively have INSERT/UPDATE/DELETE on `financial_entries` and related order/invoice columns.
- Whether any deployed trigger/RPC/function posts to `financial_entries` outside browser JavaScript.
- Whether deployed audit, correction, reversal, or soft-delete constraints exist but are absent from repository migrations.
- Whether historical/localStorage fallback records have been imported or abandoned.

## Historical or abandoned behavior

- Archived quote tooling and browser localStorage transfer/fallback keys are evidence of compatibility paths, not current deployed accounting authority.
- Fundraiser test/plan documents are future scope, not current Finance authority.

## Recommended read-only deployed verification SQL

### Result-capture table

Operators may create this table in a private administrative schema if they want to retain query output. Do **not** execute this from the application and do **not** include customer row contents.

```sql
create schema if not exists verification;

create table if not exists verification.finance_authority_verification_results (
  id bigserial primary key,
  captured_at timestamptz not null default now(),
  captured_by text not null default current_user,
  finance_authority_verification jsonb not null
);
```

### Consolidated read-only query

This query returns one row with one JSONB column named `finance_authority_verification`. It uses metadata guards for optional tables, avoids `pg_get_functiondef` for non-functions/aggregates, inspects PUBLIC function ACL through `aclexplode`, and returns counts/diagnostics rather than customer-sensitive contents.

```sql
with relevant_relations as (
  select n.nspname as schema_name, c.relname as relation_name, c.oid as relation_oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not in ('pg_catalog','information_schema')
    and c.relkind in ('r','p','v','m')
    and (
      c.relname in ('financial_entries','orders','quotes','production_jobs','order_tracking_public','raw_material_inventory','non_filament_materials','fundraisers','fundraiser_orders')
      or c.relname ilike '%finance%'
      or c.relname ilike '%invoice%'
      or c.relname ilike '%payment%'
      or c.relname ilike '%refund%'
      or c.relname ilike '%inventory%'
      or c.relname ilike '%material%'
    )
), relevant_columns as (
  select table_schema, table_name, jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position) as columns_json
  from information_schema.columns
  where (table_schema, table_name) in (select schema_name, relation_name from relevant_relations)
  group by table_schema, table_name
), constraints_json as (
  select n.nspname as schema_name, c.relname as relation_name,
         jsonb_agg(jsonb_build_object('name', con.conname, 'type', con.contype, 'definition', pg_get_constraintdef(con.oid, true)) order by con.conname) as constraints_json
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where con.conrelid in (select relation_oid from relevant_relations)
  group by n.nspname, c.relname
), indexes_json as (
  select schemaname as schema_name, tablename as relation_name,
         jsonb_agg(jsonb_build_object('name', indexname, 'definition', indexdef) order by indexname) as indexes_json
  from pg_indexes
  where (schemaname, tablename) in (select schema_name, relation_name from relevant_relations)
  group by schemaname, tablename
), policies_json as (
  select schemaname as schema_name, tablename as relation_name,
         jsonb_agg(jsonb_build_object('name', policyname, 'permissive', permissive, 'roles', roles, 'cmd', cmd, 'qual', qual, 'with_check', with_check) order by policyname) as policies_json
  from pg_policies
  where (schemaname, tablename) in (select schema_name, relation_name from relevant_relations)
  group by schemaname, tablename
), relation_privileges_json as (
  select r.schema_name, r.relation_name,
         jsonb_agg(jsonb_build_object(
           'role', role_name,
           'select', has_table_privilege(role_name, format('%I.%I', r.schema_name, r.relation_name), 'select'),
           'insert', has_table_privilege(role_name, format('%I.%I', r.schema_name, r.relation_name), 'insert'),
           'update', has_table_privilege(role_name, format('%I.%I', r.schema_name, r.relation_name), 'update'),
           'delete', has_table_privilege(role_name, format('%I.%I', r.schema_name, r.relation_name), 'delete')
         ) order by role_name) as privileges_json
  from relevant_relations r
  cross join (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
  group by r.schema_name, r.relation_name
), function_candidates as (
  select n.nspname as schema_name, p.proname as function_name, p.oid as function_oid, p.prokind, p.prosecdef,
         pg_get_function_identity_arguments(p.oid) as identity_args,
         case when p.prokind = 'f' then pg_get_functiondef(p.oid) else null end as function_definition,
         p.proacl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema')
    and p.prokind = 'f'
    and (
      p.proname ilike '%finance%' or p.proname ilike '%invoice%' or p.proname ilike '%payment%' or p.proname ilike '%refund%'
      or p.proname ilike '%quote%' or p.proname ilike '%order%' or p.proname ilike '%inventory%' or p.proname ilike '%material%'
      or exists (select 1 where case when p.prokind = 'f' then pg_get_functiondef(p.oid) else '' end ilike '%financial_entries%')
    )
), function_privileges_json as (
  select fc.schema_name, fc.function_name, fc.identity_args,
         jsonb_build_object(
           'anon_execute', has_function_privilege('anon', fc.function_oid, 'execute'),
           'authenticated_execute', has_function_privilege('authenticated', fc.function_oid, 'execute'),
           'service_role_execute', has_function_privilege('service_role', fc.function_oid, 'execute'),
           'public_acl', coalesce((
             select jsonb_agg(jsonb_build_object('grantor', grantor::regrole::text, 'grantee', grantee::regrole::text, 'privilege_type', privilege_type, 'is_grantable', is_grantable))
             from aclexplode(coalesce(fc.proacl, acldefault('f', fc.function_oid::oid))) a
             where a.grantee = 0
           ), '[]'::jsonb)
         ) as privileges_json
  from function_candidates fc
), triggers_json as (
  select n.nspname as table_schema, c.relname as table_name,
         jsonb_agg(jsonb_build_object('name', t.tgname, 'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid, true)) order by t.tgname) as triggers_json
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and (t.tgrelid in (select relation_oid from relevant_relations) or pg_get_triggerdef(t.oid, true) ilike '%financial_entries%')
  group by n.nspname, c.relname
), relation_summary as (
  select r.schema_name, r.relation_name,
         jsonb_build_object(
           'kind', r.relkind,
           'rls_enabled', r.relrowsecurity,
           'rls_forced', r.relforcerowsecurity,
           'columns', coalesce(col.columns_json, '[]'::jsonb),
           'constraints', coalesce(cn.constraints_json, '[]'::jsonb),
           'indexes', coalesce(ix.indexes_json, '[]'::jsonb),
           'policies', coalesce(po.policies_json, '[]'::jsonb),
           'privileges', coalesce(rp.privileges_json, '[]'::jsonb),
           'triggers', coalesce(tg.triggers_json, '[]'::jsonb)
         ) as relation_json
  from relevant_relations r
  left join relevant_columns col on col.table_schema = r.schema_name and col.table_name = r.relation_name
  left join constraints_json cn on cn.schema_name = r.schema_name and cn.relation_name = r.relation_name
  left join indexes_json ix on ix.schema_name = r.schema_name and ix.relation_name = r.relation_name
  left join policies_json po on po.schema_name = r.schema_name and po.relation_name = r.relation_name
  left join relation_privileges_json rp on rp.schema_name = r.schema_name and rp.relation_name = r.relation_name
  left join triggers_json tg on tg.table_schema = r.schema_name and tg.table_name = r.relation_name
), finance_entry_stats as (
  select case when to_regclass('public.financial_entries') is null then '{}'::jsonb else (
    select jsonb_build_object(
      'entry_count', count(*),
      'entry_type_distribution', coalesce(jsonb_object_agg(type, type_count), '{}'::jsonb),
      'category_distribution', coalesce((select jsonb_object_agg(category, category_count) from (select coalesce(category,'(null)') category, count(*) category_count from public.financial_entries group by 1) c), '{}'::jsonb),
      'entry_totals_by_type', coalesce((select jsonb_object_agg(type, total_amount) from (select coalesce(type,'(null)') type, sum(coalesce(amount,0) + coalesce(shipping_charged,0) + coalesce(sales_tax_collected,0) + coalesce(shipping_cost,0) + coalesce(material_cost,0) + coalesce(packaging_cost,0) + coalesce(labor_cost,0) + coalesce(other_direct_cost,0)) total_amount from public.financial_entries group by 1) t), '{}'::jsonb),
      'negative_or_impossible_value_count', count(*) filter (where coalesce(amount,0) < 0 or coalesce(original_amount,0) < 0 or coalesce(shipping_charged,0) < 0 or coalesce(sales_tax_collected,0) < 0 or coalesce(sales_tax_rate,0) < 0 or coalesce(shipping_cost,0) < 0 or coalesce(material_cost,0) < 0 or coalesce(packaging_cost,0) < 0 or coalesce(labor_cost,0) < 0 or coalesce(other_direct_cost,0) < 0 or coalesce(business_use_percent,100) < 0 or coalesce(business_use_percent,100) > 100),
      'tax_evidence_gap_count', count(*) filter (where type = 'income' and coalesce(tax_exempt_sale,false) = false and (coalesce(sales_tax_rate,0) <= 0 or coalesce(destination_county,'') = '')),
      'shipping_charged_cost_inconsistency_count', count(*) filter (where coalesce(shipping_charged,0) > 0 and coalesce(shipping_cost,0) = 0),
      'correction_reversal_delete_evidence_count', count(*) filter (where coalesce(category,'') ilike '%refund%' or coalesce(category,'') ilike '%reversal%' or coalesce(title,'') ilike '%refund%' or coalesce(title,'') ilike '%reversal%' or coalesce(notes,'') ilike '%refund%' or coalesce(notes,'') ilike '%reversal%' or coalesce(notes,'') ilike '%correction%')
    )
    from (select coalesce(type,'(null)') type, count(*) type_count from public.financial_entries group by 1) d
    right join public.financial_entries fe on true
  ) end as stats_json
), duplicate_posting_candidates as (
  select case when to_regclass('public.financial_entries') is null then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('order_number', order_number, 'candidate_entry_count', candidate_entry_count, 'categories', categories) order by candidate_entry_count desc, order_number)
    from (
      select m.order_number, count(*) candidate_entry_count, jsonb_agg(distinct coalesce(fe.category,'(null)')) categories
      from public.financial_entries fe
      join lateral regexp_matches(coalesce(fe.title,'') || E'\n' || coalesce(fe.notes,''), '(O-[A-Za-z0-9_-]+|ORD-[A-Za-z0-9_-]+|Q-[A-Za-z0-9_-]+)', 'g') as m(order_number) on true
      group by m.order_number
      having count(*) > 3
      limit 100
    ) s
  ), '[]'::jsonb) end as duplicate_json
), order_finance_diagnostics as (
  select case when to_regclass('public.orders') is null then '{}'::jsonb else jsonb_build_object(
    'orders_marked_finance_pushed_without_matching_finance_evidence', case when to_regclass('public.financial_entries') is null then null else (
      select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'finance_pushed_at', o.finance_pushed_at) order by o.finance_pushed_at desc), '[]'::jsonb)
      from public.orders o
      where coalesce(o.finance_pushed,false) = true
        and not exists (select 1 from public.financial_entries fe where coalesce(fe.title,'') ilike '%' || o.order_number || '%' or coalesce(fe.notes,'') ilike '%' || o.order_number || '%')
      limit 100
    ) end,
    'matching_finance_entries_without_order_linkage', case when to_regclass('public.financial_entries') is null then null else (
      select coalesce(jsonb_agg(jsonb_build_object('order_number', m.order_number, 'candidate_entry_count', count(*)) order by m.order_number), '[]'::jsonb)
      from public.financial_entries fe
      join lateral regexp_matches(coalesce(fe.title,'') || E'\n' || coalesce(fe.notes,''), '(O-[A-Za-z0-9_-]+|ORD-[A-Za-z0-9_-]+)', 'g') as m(order_number) on true
      left join public.orders o on o.order_number = m.order_number
      where o.id is null
      group by m.order_number
      limit 100
    ) end,
    'paid_or_closed_orders_without_finance_evidence', case when to_regclass('public.financial_entries') is null then null else (
      select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'payment_status', o.payment_status, 'status', o.status, 'order_total', o.order_total) order by o.updated_at desc), '[]'::jsonb)
      from public.orders o
      where (o.payment_status in ('paid','deposit_paid') or o.status in ('completed','closed')) and coalesce(o.order_total,0) > 0
        and not exists (select 1 from public.financial_entries fe where coalesce(fe.title,'') ilike '%' || o.order_number || '%' or coalesce(fe.notes,'') ilike '%' || o.order_number || '%')
      limit 100
    ) end,
    'finance_evidence_linked_to_missing_orders', case when to_regclass('public.financial_entries') is null then null else (
      select coalesce(jsonb_agg(jsonb_build_object('order_number', m.order_number, 'candidate_entry_count', count(*)) order by m.order_number), '[]'::jsonb)
      from public.financial_entries fe
      join lateral regexp_matches(coalesce(fe.title,'') || E'\n' || coalesce(fe.notes,''), '(O-[A-Za-z0-9_-]+|ORD-[A-Za-z0-9_-]+)', 'g') as m(order_number) on true
      left join public.orders o on o.order_number = m.order_number
      where o.id is null
      group by m.order_number
      limit 100
    ) end,
    'negative_or_impossible_order_value_count', (select count(*) from public.orders where coalesce(order_total,0) < 0 or coalesce(deposit_amount,0) < 0 or coalesce(balance_amount,0) < 0 or coalesce(balance_amount,0) > greatest(coalesce(order_total,0),0) + 0.01),
    'shipping_charged_cost_inconsistency_count', (select count(*) from public.orders where coalesce(shipping_amount,0) > 0 and coalesce(shipping_cost,0) = 0),
    'tax_evidence_gap_count', (select count(*) from public.orders where coalesce(tax_exempt,false) = false and coalesce(order_total,0) > 0 and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name in ('tax','sales_tax','tax_rate','sales_tax_rate')))
  ) end as diagnostics_json
), function_summary as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', fc.schema_name,
    'name', fc.function_name,
    'arguments', fc.identity_args,
    'security_definer', fc.prosecdef,
    'writes_financial_entries', fc.function_definition ilike '%financial_entries%' and fc.function_definition ~* '\m(insert|update|delete)\M',
    'browser_accessible_finance_mutation_candidate', (fc.function_definition ilike '%financial_entries%' and fc.function_definition ~* '\m(insert|update|delete)\M') and (fp.privileges_json->>'anon_execute' = 'true' or fp.privileges_json->>'authenticated_execute' = 'true'),
    'production_or_inventory_finance_writer', (fc.function_name ilike '%production%' or fc.function_name ilike '%inventory%' or fc.function_definition ilike '%production_jobs%' or fc.function_definition ilike '%inventory%' or fc.function_definition ilike '%material%') and fc.function_definition ilike '%financial_entries%' and fc.function_definition ~* '\m(insert|update|delete)\M',
    'quote_or_order_acceptance_finance_writer', (fc.function_name ilike '%quote%' or fc.function_name ilike '%order%' or fc.function_definition ilike '%respond_to_quote%' or fc.function_definition ilike '%orders%') and fc.function_definition ilike '%financial_entries%' and fc.function_definition ~* '\m(insert|update|delete)\M',
    'definition', fc.function_definition,
    'privileges', fp.privileges_json
  ) order by fc.schema_name, fc.function_name), '[]'::jsonb) as functions_json
  from function_candidates fc
  left join function_privileges_json fp on fp.schema_name = fc.schema_name and fp.function_name = fc.function_name and fp.identity_args = fc.identity_args
), browser_accessible_finance_mutations as (
  select jsonb_build_object(
    'direct_table_mutation_privileges', coalesce((
      select jsonb_agg(jsonb_build_object('schema', schema_name, 'relation', relation_name, 'privileges', privileges_json))
      from relation_privileges_json
      where relation_name = 'financial_entries'
        and privileges_json::text ~ '"(anon|authenticated)"'
    ), '[]'::jsonb),
    'function_mutation_candidates', coalesce((
      select jsonb_agg(value)
      from function_summary fs, jsonb_array_elements(fs.functions_json) value
      where (value->>'browser_accessible_finance_mutation_candidate')::boolean = true
    ), '[]'::jsonb)
  ) as browser_mutations_json
)
select jsonb_build_object(
  'captured_at', now(),
  'database_user', current_user,
  'relevant_schemas_and_deployed_columns', coalesce((select jsonb_object_agg(schema_name || '.' || relation_name, relation_json order by schema_name, relation_name) from relation_summary), '{}'::jsonb),
  'finance_related_functions_rpcs_triggers_and_definitions', jsonb_build_object(
    'functions', (select functions_json from function_summary),
    'triggers', coalesce((select jsonb_object_agg(table_schema || '.' || table_name, triggers_json order by table_schema, table_name) from triggers_json), '{}'::jsonb)
  ),
  'entry_type_category_distributions_and_totals', (select stats_json from finance_entry_stats),
  'duplicate_posting_candidates', (select duplicate_json from duplicate_posting_candidates),
  'order_finance_diagnostics', (select diagnostics_json from order_finance_diagnostics),
  'browser_accessible_finance_mutations', (select browser_mutations_json from browser_accessible_finance_mutations),
  'correction_reversal_and_deletion_authority', jsonb_build_object(
    'delete_privileges', coalesce((select privileges_json from relation_privileges_json where relation_name = 'financial_entries' limit 1), '[]'::jsonb),
    'triggers_or_functions_with_reversal_terms', coalesce((select jsonb_agg(value) from function_summary fs, jsonb_array_elements(fs.functions_json) value where value::text ilike '%reversal%' or value::text ilike '%refund%' or value::text ilike '%correction%' or value::text ilike '%delete%'), '[]'::jsonb),
    'entry_level_reversal_term_count', (select stats_json->'correction_reversal_delete_evidence_count' from finance_entry_stats)
  )
) as finance_authority_verification;
```

### Smaller fallback diagnostic queries

Use these only if schema drift prevents the consolidated query from running.

```sql
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name in ('financial_entries','orders','quotes','production_jobs')
order by table_schema, table_name, ordinal_position;
```

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where tablename in ('financial_entries','orders','quotes','production_jobs')
order by schemaname, tablename, policyname;
```

```sql
select n.nspname, p.proname, p.prokind, p.prosecdef,
       case when p.prokind = 'f' then pg_get_functiondef(p.oid) else null end as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prokind = 'f'
  and n.nspname not in ('pg_catalog','information_schema')
  and case when p.prokind = 'f' then pg_get_functiondef(p.oid) else '' end ilike '%financial_entries%'
order by n.nspname, p.proname;
```

```sql
select type, category, count(*) as entry_count,
       sum(coalesce(amount,0)) as amount_total,
       sum(coalesce(shipping_charged,0)) as shipping_charged_total,
       sum(coalesce(sales_tax_collected,0)) as sales_tax_collected_total,
       sum(coalesce(shipping_cost,0) + coalesce(material_cost,0) + coalesce(packaging_cost,0) + coalesce(labor_cost,0) + coalesce(other_direct_cost,0)) as cost_total
from public.financial_entries
group by type, category
order by type, category;
```

## Decision gate

Do not begin corrective implementation until an operator captures the consolidated deployed JSON and reviews these gates:

1. **Authority gate:** exactly one approved Finance command path may create authoritative revenue, payment, refund, tax, and expense entries.
2. **Security gate:** browser roles must not have broader direct write authority than the approved command contract requires.
3. **Duplication gate:** order/invoice revenue cannot be posted twice by direct browser actions, retries, or mixed manual/automatic paths.
4. **Audit gate:** deletion, correction, reversal, and refund behavior must be explicitly decided before changing posting code.
5. **Boundary gate:** Production and Inventory cost projections must remain projections unless Finance explicitly imports them as accounting evidence.
6. **Fundraiser extension gate:** fundraiser Finance remains out of scope until Finance authority, tax/refund policy, and posting idempotency are resolved.

## Exactly one recommended future corrective milestone

**Future milestone: Finance command and idempotency contract.**

Based only on repository evidence, define one Finance-owned command/RPC or service boundary for order revenue import, invoice issuance, payment allocation, refund/reversal, and tax evidence. Orders Admin should request Finance actions and render returned projections, not insert `financial_entries` directly. The milestone must include idempotency keys/order linkage, duplicate-prevention tests, deployed RLS/grant verification, and explicit correction/reversal behavior. It must not redesign Inventory, workflow, Quote acceptance, UI, fundraiser behavior, or historical cleanup.


## Finance posting and correction command milestone

Forward-only migration `supabase/migrations/202607210005_authoritative_finance_posting_corrections.sql` adds the planned Finance-owned RPC boundary for future Order-derived income posting and append-only corrections/reversals. The migration is not deployed by this repository change and does not automatically post historical Orders.

Planned command behavior:

- `post_order_finance_income(p_order_id, p_order_number, p_expected_updated_at, p_correlation_id)` is authenticated-owner scoped, `SECURITY DEFINER`, idempotent for the same immutable command identity, and binds identity reuse to the same owner, Order UUID, Order number, and command. It locks the Order and relevant Finance rows, persists explicit `order_id`/`order_number` linkage, preserves an accepted Order commercial snapshot from the Order row, creates exactly one command-owned income entry, and atomically marks the Order as Finance pushed.
- `append_finance_correction(p_original_entry_id, p_command, p_amount, p_reason, p_correlation_id)` appends compensating Finance evidence for corrections/reversals, preserves and links the original entry identity, blocks double reversal, and does not update or delete the original entry.
- `anon` direct mutation privileges on `financial_entries` are revoked. Owner-scoped authenticated reads and ordinary manual Finance Pro insert/update/delete remain temporarily available because active repository evidence shows Finance Pro still uses direct browser writes for manual entries. Command-owned linkage, idempotency, actor, timestamp, and reversal fields are protected from browser-direct authenticated updates.

Manual browser tests required after deployment:

1. Sign in as an owner, create a normal manual income entry in Finance Pro, edit an ordinary manual field, and delete a test manual entry if deletion remains an approved manual Finance operation.
2. Push one paid Order from Orders Admin and verify the network call is `/rest/v1/rpc/post_order_finance_income`, not direct `financial_entries` insertion.
3. Simulate a failed/retried push and verify the same correlation identity returns the original Finance entry without a duplicate.
4. Attempt to post the same Order with a different command identity and verify the duplicate Order income posting is rejected.
5. Append one correction/reversal in a non-production environment and verify the original Finance row is unchanged and the correction row links to it.
