-- OliPoly Engine RC2.7: safe generic public campaign intake contract.
-- Additive/forward-only. Apply manually only after RC2.4 and RC2.5 verification.

create or replace function public.get_public_campaign(p_campaign_slug text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

revoke all on function public.get_public_campaign(text) from public;
grant execute on function public.get_public_campaign(text) to anon, authenticated;
comment on function public.get_public_campaign(text) is 'Narrow customer-safe campaign intake catalog. Product UUID is an opaque submission selector; owner/private/operator fields are excluded.';

create or replace function public.submit_campaign_submission(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

revoke all on function public.submit_campaign_submission(jsonb) from public;
grant execute on function public.submit_campaign_submission(jsonb) to anon, authenticated;
comment on function public.submit_campaign_submission(jsonb) is 'RC2.7 narrow public staging boundary with strict fields/limits, configured vocabulary, server pricing, immutable snapshots, and idempotency. Creates no downstream records.';
