-- Durable Production -> Quote -> Order identity and controlled legacy repair.
-- Forward-only migration. Deploy through the normal Supabase migration process;
-- browser code must never execute this file.

begin;

alter table public.quotes
  add column if not exists production_job_id uuid references public.production_jobs(id) on delete restrict;

comment on column public.quotes.production_job_id is
  'Canonical nullable provenance for a Quote created from Production. Immutable after assignment.';

create unique index if not exists quotes_one_per_production_job_idx
  on public.quotes(production_job_id) where production_job_id is not null;

create table if not exists public.production_linkage_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  production_job_id uuid not null references public.production_jobs(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  command_identity text not null unique,
  event_type text not null check (event_type in ('production_quote_linked','production_order_linked','legacy_linkage_repaired')),
  from_status text,
  to_status text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.production_linkage_audit enable row level security;
drop policy if exists "Owners read Production linkage audit" on public.production_linkage_audit;
create policy "Owners read Production linkage audit" on public.production_linkage_audit
  for select to authenticated using (auth.uid() = user_id);
revoke all on table public.production_linkage_audit from public, anon, authenticated;
grant select on table public.production_linkage_audit to authenticated;

create or replace function public.prevent_production_quote_provenance_drift()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.production_job_id is not null and new.production_job_id is distinct from old.production_job_id then
    raise exception 'Production Quote provenance is immutable' using errcode='23514';
  end if;
  if old.quote_number is distinct from new.quote_number and old.production_job_id is not null then
    raise exception 'Production Quote number is immutable' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists quotes_prevent_production_provenance_drift on public.quotes;
create trigger quotes_prevent_production_provenance_drift
before update on public.quotes for each row execute function public.prevent_production_quote_provenance_drift();
revoke all on function public.prevent_production_quote_provenance_drift() from public, anon, authenticated;

-- Atomic save for Production-origin Quotes. Ordinary Quotes keep their existing
-- persistence path. Quote numbering remains next_document_counter authority.
create or replace function public.save_production_quote(
  p_production_job_id uuid,
  p_expected_updated_at timestamptz,
  p_command_identity text,
  p_quote jsonb
) returns public.quotes
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;
revoke all on function public.save_production_quote(uuid,timestamptz,text,jsonb) from public, anon;
grant execute on function public.save_production_quote(uuid,timestamptz,text,jsonb) to authenticated, service_role;

-- An Order insert is the atomic boundary. A Production-origin Quote must backfill
-- its exact source job or the Order insert (and the full acceptance transaction)
-- fails and rolls back. Non-Production Quotes intentionally do nothing here.
create or replace function public.link_production_after_quote_order_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;
drop trigger if exists orders_link_production_after_quote_insert on public.orders;
create trigger orders_link_production_after_quote_insert after insert on public.orders
for each row execute function public.link_production_after_quote_order_insert();
revoke all on function public.link_production_after_quote_order_insert() from public, anon, authenticated;

create or replace function public.repair_production_quote_order_linkage(p_production_job_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid(); v_job public.production_jobs%rowtype; v_quote public.quotes%rowtype; v_order public.orders%rowtype; v_count integer; v_now timestamptz:=now();
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_job from public.production_jobs where id=p_production_job_id and user_id=v_actor for update;
  if not found then raise exception 'Production job not found or access denied' using errcode='42501'; end if;
  if v_job.quote_number is null or nullif(v_job.job_payload->>'quote_number','') is distinct from v_job.quote_number then raise exception 'Production Quote identity is missing or inconsistent' using errcode='23514'; end if;
  select count(*) into v_count from public.quotes where quote_number=v_job.quote_number and user_id=v_actor;
  if v_count <> 1 then raise exception 'Expected exactly one same-owner Quote; found %',v_count using errcode='23514'; end if;
  select * into v_quote from public.quotes where quote_number=v_job.quote_number and user_id=v_actor for update;
  if v_quote.production_job_id is not null and v_quote.production_job_id is distinct from v_job.id then raise exception 'Quote has conflicting Production provenance' using errcode='23514'; end if;
  select count(*) into v_count from public.orders where source_quote_number=v_job.quote_number;
  if v_count <> 1 then raise exception 'Expected exactly one Order candidate; found %',v_count using errcode='23514'; end if;
  select * into v_order from public.orders where source_quote_number=v_job.quote_number for update;
  if v_order.user_id is distinct from v_actor then raise exception 'Order candidate owner mismatch' using errcode='42501'; end if;
  if v_order.created_from_quote is not true or v_order.source_type is distinct from 'quote' then raise exception 'Order candidate is not Quote-created' using errcode='23514'; end if;
  if v_job.order_number is not null and v_job.order_number is distinct from v_order.order_number then raise exception 'Production job has a conflicting Order identity' using errcode='23514'; end if;
  if coalesce(v_job.production_status,'') not in ('estimate','waiting_customer','quote_sent','quote_accepted','awaiting_approval','waiting_for_customer','ready_to_print') then raise exception 'Production lifecycle cannot be repaired safely' using errcode='22023'; end if;
  if coalesce((v_job.job_payload->>'actual_usage_captured')::boolean,false) then raise exception 'Production job has actual-production evidence' using errcode='23514'; end if;
  update public.quotes set production_job_id=v_job.id where id=v_quote.id and production_job_id is null;
  update public.production_jobs set order_number=v_order.order_number,production_status='ready_to_print',
    job_payload=jsonb_set(jsonb_set(jsonb_set(coalesce(job_payload,'{}'::jsonb),'{quote_number}',to_jsonb(v_job.quote_number),true),'{order_number}',to_jsonb(v_order.order_number),true),'{order_id}',to_jsonb(v_order.id),true),updated_at=v_now
    where id=v_job.id returning * into v_job;
  insert into public.production_linkage_audit(user_id,production_job_id,order_id,command_identity,event_type,from_status,to_status,evidence)
  values(v_actor,v_job.id,v_order.id,'legacy-repair:'||v_job.id||':'||v_order.id,'legacy_linkage_repaired','estimate','ready_to_print',jsonb_build_object('quote_number',v_job.quote_number,'order_number',v_order.order_number)) on conflict(command_identity) do nothing;
  return jsonb_build_object('outcome','linked','production_job_id',v_job.id,'quote_number',v_job.quote_number,'order_id',v_order.id,'order_number',v_order.order_number,'production_status',v_job.production_status,'idempotent',v_job.order_number=v_order.order_number);
end $$;
revoke all on function public.repair_production_quote_order_linkage(uuid) from public, anon;
grant execute on function public.repair_production_quote_order_linkage(uuid) to authenticated, service_role;

create or replace view public.production_linkage_candidates
with (security_invoker=true) as
select p.id production_job_id,p.job_title,p.user_id owner_id,p.production_status,p.quote_number,
 p.job_payload->>'quote_number' payload_quote_number,p.order_number,p.job_payload->>'order_number' payload_order_number,
 p.job_payload->>'order_id' payload_order_id,c.candidate_count,c.order_id candidate_order_id,c.order_number candidate_order_number,
 c.same_owner,c.created_from_quote,c.source_type,
 (p.quote_number is not distinct from p.job_payload->>'quote_number' and p.order_number is not distinct from c.order_number and p.job_payload->>'order_number' is not distinct from c.order_number and p.job_payload->>'order_id' is not distinct from c.order_id::text) linkage_consistent,
 (c.candidate_count=1 and c.same_owner and c.created_from_quote and c.source_type='quote' and (p.order_number is null or p.order_number=c.order_number)) safe_repair_eligible,
 case when p.quote_number is null then 'missing_quote' when p.quote_number is distinct from p.job_payload->>'quote_number' then 'payload_quote_mismatch' when c.candidate_count=0 then 'no_order_candidate' when c.candidate_count>1 then 'ambiguous_orders' when not c.same_owner then 'owner_mismatch' when not c.created_from_quote or c.source_type is distinct from 'quote' then 'not_quote_created' when p.order_number is not null and p.order_number is distinct from c.order_number then 'conflicting_order' else null end exclusion_reason
from public.production_jobs p
left join lateral (select count(*)::int candidate_count,(array_agg(o.id))[1] order_id,min(o.order_number) order_number,bool_and(o.user_id=p.user_id) same_owner,bool_and(o.created_from_quote) created_from_quote,min(o.source_type) source_type from public.orders o where o.source_quote_number=p.quote_number) c on true;
revoke all on public.production_linkage_candidates from public,anon;
grant select on public.production_linkage_candidates to authenticated,service_role;

-- Apply only the explicitly proven, unambiguous chain. All predicates must hold;
-- otherwise deployment stops instead of guessing.
do $$ begin
  if exists(select 1 from public.production_jobs where id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59'::uuid) then
    if not exists(select 1 from public.production_linkage_candidates where production_job_id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59'::uuid and quote_number='Q-000013' and candidate_count=1 and candidate_order_id='4601a9d3-68d2-467c-bc41-8aeb63bafc78'::uuid and candidate_order_number='OP-000189' and same_owner and created_from_quote and source_type='quote' and safe_repair_eligible)
       or (select count(*) from public.quotes q join public.production_jobs p on p.user_id=q.user_id where p.id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59'::uuid and q.quote_number='Q-000013' and (q.production_job_id is null or q.production_job_id=p.id)) <> 1 then
      raise exception 'Proven Q-000013 / OP-000189 repair predicates no longer hold';
    end if;
    -- Migration execution uses trusted deployment authority but retains the same
    -- exact evidence checks above; write and audit are one transaction.
    update public.production_jobs set order_number='OP-000189',production_status='ready_to_print',
      job_payload=jsonb_set(jsonb_set(jsonb_set(coalesce(job_payload,'{}'::jsonb),'{quote_number}',to_jsonb('Q-000013'::text),true),'{order_number}',to_jsonb('OP-000189'::text),true),'{order_id}',to_jsonb('4601a9d3-68d2-467c-bc41-8aeb63bafc78'::uuid),true),updated_at=now()
      where id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59'::uuid;
    update public.quotes set production_job_id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59'::uuid
      where quote_number='Q-000013'
        and user_id=(select user_id from public.production_jobs where id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59'::uuid)
        and production_job_id is null;
    insert into public.production_linkage_audit(user_id,production_job_id,order_id,command_identity,event_type,from_status,to_status,evidence)
      select user_id,id,'4601a9d3-68d2-467c-bc41-8aeb63bafc78','legacy-repair:'||id||':4601a9d3-68d2-467c-bc41-8aeb63bafc78','legacy_linkage_repaired','estimate','ready_to_print',jsonb_build_object('quote_number','Q-000013','order_number','OP-000189') from public.production_jobs where id='72a14a94-b126-4dc5-b31f-32ec7cd6eb59' on conflict(command_identity) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
