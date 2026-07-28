-- OliPoly Engine RC2.4: immutable campaign submission staging authority.
-- Forward-only and additive. Deploy manually after owner review; this file was not executed by Codex.

create extension if not exists pgcrypto with schema extensions;

alter table public.campaign_products
  add column if not exists variant_config jsonb not null default '{}'::jsonb,
  add column if not exists fulfillment_options jsonb not null default '[]'::jsonb,
  add column if not exists payment_options jsonb not null default '[]'::jsonb,
  add column if not exists customer_disclosures jsonb not null default '[]'::jsonb;

create table if not exists public.campaign_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  public_reference text not null unique default ('CS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  submission_source text not null check (submission_source ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  source_event_key text not null check (length(source_event_key) between 8 and 200),
  source_schema_version text not null default '1',
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  campaign_snapshot jsonb not null,
  customer_snapshot jsonb not null,
  fulfillment_selection text not null,
  fulfillment_snapshot jsonb not null,
  payment_method_selection text not null,
  payment_selection_snapshot jsonb not null,
  payment_evidence_state text not null default 'unverified' check (payment_evidence_state in ('unverified','externally_reported','operator_verified','not_required')),
  customer_notes text,
  consent_snapshot jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  personalization_total numeric(12,2) not null check (personalization_total >= 0),
  shipping_amount numeric(12,2) check (shipping_amount is null or shipping_amount >= 0),
  tax_amount numeric(12,2) check (tax_amount is null or tax_amount >= 0),
  accepted_total numeric(12,2) not null check (accepted_total >= 0),
  item_count integer not null check (item_count > 0),
  review_status text not null default 'new' check (review_status in ('new','under_review','needs_clarification','approved_for_conversion','rejected','duplicate','cancelled','converted')),
  internal_review_notes text,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  replay_conflict_count integer not null default 0 check (replay_conflict_count >= 0),
  replay_conflict_at timestamptz,
  conversion_status text not null default 'not_converted' check (conversion_status in ('not_converted','converted')),
  conversion_reference text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_source, source_event_key),
  constraint campaign_submission_conversion_reserved check (conversion_status = 'not_converted' and conversion_reference is null and review_status <> 'converted')
);

create table if not exists public.campaign_submission_items (
  id uuid primary key default gen_random_uuid(),
  campaign_submission_id uuid not null references public.campaign_submissions(id) on delete restrict,
  campaign_product_id uuid not null references public.campaign_products(id) on delete restrict,
  offer_snapshot jsonb not null,
  product_public_code text not null,
  submitted_variant jsonb not null default '{}'::jsonb,
  quantity integer not null check (quantity between 1 and 1000),
  personalization_requested boolean not null default false,
  personalization_selection jsonb not null default '{}'::jsonb,
  authoritative_base_unit_price numeric(12,2) not null check (authoritative_base_unit_price >= 0),
  authoritative_personalization_unit_price numeric(12,2) not null check (authoritative_personalization_unit_price >= 0),
  authoritative_line_subtotal numeric(12,2) not null check (authoritative_line_subtotal >= 0),
  item_notes text,
  line_sequence integer not null check (line_sequence > 0),
  created_at timestamptz not null default now(),
  unique (campaign_submission_id, line_sequence)
);

create index if not exists campaign_submissions_review_queue_idx on public.campaign_submissions (user_id, review_status, submitted_at desc);
create index if not exists campaign_submissions_campaign_queue_idx on public.campaign_submissions (campaign_id, submitted_at desc);
create index if not exists campaign_submissions_payment_fulfillment_idx on public.campaign_submissions (user_id, payment_evidence_state, fulfillment_selection);
create index if not exists campaign_submission_items_submission_idx on public.campaign_submission_items (campaign_submission_id, line_sequence);

alter table public.campaign_submissions enable row level security;
alter table public.campaign_submission_items enable row level security;
create policy "Owners read campaign submissions" on public.campaign_submissions for select to authenticated using (auth.uid() = user_id);
create policy "Owners read campaign submission items" on public.campaign_submission_items for select to authenticated using (
  exists (select 1 from public.campaign_submissions s where s.id = campaign_submission_id and s.user_id = auth.uid())
);
revoke all on table public.campaign_submissions from public, anon, authenticated;
revoke all on table public.campaign_submission_items from public, anon, authenticated;
grant select on table public.campaign_submissions, public.campaign_submission_items to authenticated;

create or replace function public.reject_campaign_submission_snapshot_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'campaign_submission_items' then raise exception 'Campaign submission items are immutable' using errcode='55000'; end if;
  -- The ingestion function inserts the envelope before its atomic item loop, then
  -- finalizes database-calculated totals once. No table UPDATE grant is exposed.
  if old.accepted_total = 0 and old.subtotal = 0 and old.updated_at = old.created_at then return new; end if;
  if (to_jsonb(new) - array['review_status','internal_review_notes','reviewed_by','reviewed_at','replay_conflict_count','replay_conflict_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['review_status','internal_review_notes','reviewed_by','reviewed_at','replay_conflict_count','replay_conflict_at','updated_at']) then
    raise exception 'Campaign submission sale snapshot is immutable' using errcode='55000';
  end if;
  return new;
end $$;
create trigger campaign_submissions_immutable before update on public.campaign_submissions for each row execute function public.reject_campaign_submission_snapshot_mutation();
create trigger campaign_submission_items_immutable before update or delete on public.campaign_submission_items for each row execute function public.reject_campaign_submission_snapshot_mutation();

create or replace function public.submit_campaign_submission(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_campaign public.campaigns%rowtype; v_product public.campaign_products%rowtype; v_existing public.campaign_submissions%rowtype;
  v_source text := lower(trim(coalesce(p_request->>'source',''))); v_key text := trim(coalesce(p_request->>'source_event_key',''));
  v_fingerprint text; v_submission_id uuid; v_item jsonb; v_qty integer; v_personalized boolean; v_base numeric(12,2); v_extra numeric(12,2);
  v_subtotal numeric(12,2) := 0; v_personalization numeric(12,2) := 0; v_count integer := 0; v_sequence integer := 0;
  v_customer jsonb := coalesce(p_request->'customer','{}'); v_fulfillment text := trim(coalesce(p_request->>'fulfillment_selection',''));
  v_payment text := trim(coalesce(p_request->>'payment_method_selection',''));
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then raise exception 'Request must be an object' using errcode='22023'; end if;
  if v_source !~ '^[a-z0-9][a-z0-9_-]{1,47}$' or length(v_key) not between 8 and 200 then raise exception 'Invalid source or source event key' using errcode='22023'; end if;
  if jsonb_typeof(p_request->'items') <> 'array' or jsonb_array_length(p_request->'items') < 1 then raise exception 'At least one item is required' using errcode='22023'; end if;
  if length(coalesce(v_customer->>'name','')) not between 1 and 160 or length(coalesce(v_customer->>'email','')) > 254 then raise exception 'Invalid customer contact' using errcode='22023'; end if;
  if p_request ?| array['total','subtotal','price','review_status','payment_evidence_state','user_id'] then raise exception 'Authority fields are not accepted' using errcode='22023'; end if;
  v_fingerprint := encode(extensions.digest(convert_to((p_request - 'source_metadata')::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_existing from public.campaign_submissions where submission_source=v_source and source_event_key=v_key for update;
  if found then
    if v_existing.payload_fingerprint <> v_fingerprint then
      update public.campaign_submissions set replay_conflict_count=replay_conflict_count+1,replay_conflict_at=now(),updated_at=now() where id=v_existing.id;
      return jsonb_build_object('submission_reference',v_existing.public_reference,'status','conflicting_replay','rejected',true);
    end if;
    return jsonb_build_object('submission_reference',v_existing.public_reference,'status',v_existing.review_status);
  end if;
  select * into v_campaign from public.campaigns c where c.campaign_slug=lower(trim(p_request->>'campaign_code')) and c.status='active' and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now());
  if not found then raise exception 'Campaign is unavailable' using errcode='22023'; end if;
  if v_fulfillment = '' or v_payment = '' then raise exception 'Fulfillment and payment selections are required' using errcode='22023'; end if;
  if jsonb_array_length(v_campaign.public_config->'fulfillment_options') > 0 and not (v_campaign.public_config->'fulfillment_options' ? v_fulfillment) then raise exception 'Fulfillment selection is unavailable' using errcode='22023'; end if;
  if jsonb_array_length(v_campaign.public_config->'payment_options') > 0 and not (v_campaign.public_config->'payment_options' ? v_payment) then raise exception 'Payment selection is unavailable' using errcode='22023'; end if;
  insert into public.campaign_submissions(user_id,campaign_id,submission_source,source_event_key,source_schema_version,payload_fingerprint,campaign_snapshot,customer_snapshot,fulfillment_selection,fulfillment_snapshot,payment_method_selection,payment_selection_snapshot,customer_notes,consent_snapshot,source_metadata,currency,subtotal,personalization_total,accepted_total,item_count)
  values(v_campaign.user_id,v_campaign.id,v_source,v_key,coalesce(p_request->>'source_schema_version','1'),v_fingerprint,
    jsonb_build_object('campaign_id',v_campaign.id,'campaign_slug',v_campaign.campaign_slug,'campaign_code',v_campaign.campaign_code,'name',v_campaign.name,'organization_name',v_campaign.organization_name,'status',v_campaign.status,'sale_event_identifier',v_campaign.public_config->>'sale_event_identifier','pricing_schema_version',coalesce(v_campaign.public_config->>'pricing_schema_version','1')),
    v_customer,v_fulfillment,jsonb_build_object('selection',v_fulfillment,'location',p_request->'fulfillment'->'location','instructions',p_request->'fulfillment'->'instructions','shipping_address',p_request->'fulfillment'->'shipping_address'),
    v_payment,jsonb_build_object('selection',v_payment),nullif(p_request->>'customer_notes',''),coalesce(p_request->'consent','{}'),coalesce(p_request->'source_metadata','{}'),'USD',0,0,0,1) returning id into v_submission_id;
  for v_item in select value from jsonb_array_elements(p_request->'items') loop
    v_sequence:=v_sequence+1;
    begin v_qty := (v_item->>'quantity')::integer; exception when others then raise exception 'Quantity must be an integer' using errcode='22023'; end;
    if v_qty < 1 or v_qty > 1000 then raise exception 'Quantity is outside allowed range' using errcode='22023'; end if;
    v_personalized := coalesce((v_item->>'personalization_requested')::boolean,false);
    select * into v_product from public.campaign_products p where p.id=(v_item->>'campaign_product_id')::uuid and p.campaign_id=v_campaign.id and p.enabled=true;
    if not found then raise exception 'Campaign product is unavailable' using errcode='22023'; end if;
    if v_personalized and (not v_product.personalization_enabled or v_product.personalized_customer_price is null) then raise exception 'Personalization is unavailable' using errcode='22023'; end if;
    v_base:=v_product.standard_customer_price; v_extra:=case when v_personalized then v_product.personalized_customer_price-v_product.standard_customer_price else 0 end;
    v_subtotal:=v_subtotal+(v_base*v_qty); v_personalization:=v_personalization+(v_extra*v_qty); v_count:=v_count+v_qty;
    insert into public.campaign_submission_items(campaign_submission_id,campaign_product_id,offer_snapshot,product_public_code,submitted_variant,quantity,personalization_requested,personalization_selection,authoritative_base_unit_price,authoritative_personalization_unit_price,authoritative_line_subtotal,item_notes,line_sequence)
    values(v_submission_id,v_product.id,jsonb_build_object('campaign_product_id',v_product.id,'product_code',v_product.campaign_sku,'title',v_product.display_name,'description',v_product.public_description,'variant_config',v_product.variant_config,'standard_unit_price',v_product.standard_customer_price,'personalized_unit_price',v_product.personalized_customer_price,'personalization_enabled',v_product.personalization_enabled,'personalization_instructions',v_product.personalization_instructions,'personalization_limits',v_product.personalization_limits,'fulfillment_options',v_product.fulfillment_options,'payment_options',v_product.payment_options,'customer_disclosures',v_product.customer_disclosures),v_product.campaign_sku,coalesce(v_item->'variant','{}'),v_qty,v_personalized,coalesce(v_item->'personalization','{}'),v_base,v_extra,(v_base+v_extra)*v_qty,nullif(v_item->>'notes',''),v_sequence);
  end loop;
  update public.campaign_submissions set subtotal=v_subtotal,personalization_total=v_personalization,accepted_total=v_subtotal+v_personalization,item_count=v_count where id=v_submission_id;
  select * into v_existing from public.campaign_submissions where id=v_submission_id;
  return jsonb_build_object('submission_reference',v_existing.public_reference,'status','new');
exception when unique_violation then
  select * into v_existing from public.campaign_submissions where submission_source=v_source and source_event_key=v_key;
  if found and v_existing.payload_fingerprint=v_fingerprint then return jsonb_build_object('submission_reference',v_existing.public_reference,'status',v_existing.review_status); end if;
  raise exception 'Conflicting idempotency replay' using errcode='23505';
end $$;

create or replace function public.review_campaign_submission(p_submission_id uuid,p_next_status text,p_internal_notes text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_current text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select review_status into v_current from public.campaign_submissions where id=p_submission_id and user_id=auth.uid() for update;
  if not found then raise exception 'Submission not found or unauthorized' using errcode='42501'; end if;
  if not ((v_current='new' and p_next_status in ('under_review','duplicate','rejected','cancelled')) or (v_current='under_review' and p_next_status in ('needs_clarification','approved_for_conversion','duplicate','rejected')) or (v_current='needs_clarification' and p_next_status in ('under_review','cancelled'))) then raise exception 'Invalid review transition: % to %',v_current,p_next_status using errcode='22023'; end if;
  update public.campaign_submissions set review_status=p_next_status,internal_review_notes=nullif(trim(p_internal_notes),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_submission_id;
  return jsonb_build_object('submission_id',p_submission_id,'review_status',p_next_status);
end $$;

revoke all on function public.submit_campaign_submission(jsonb) from public;
grant execute on function public.submit_campaign_submission(jsonb) to anon, authenticated;
revoke all on function public.review_campaign_submission(uuid,text,text) from public, anon;
grant execute on function public.review_campaign_submission(uuid,text,text) to authenticated;
comment on function public.submit_campaign_submission(jsonb) is 'Narrow atomic public staging boundary. Prices and snapshots resolve from active campaign authority; creates no downstream business records.';
comment on function public.review_campaign_submission(uuid,text,text) is 'Owner-only staging review transition. RC2.4 performs no conversion.';
