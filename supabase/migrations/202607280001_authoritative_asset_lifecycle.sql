-- RC2.3 authoritative asset lifecycle. Review and deploy manually; no data migration is executed here.
begin;

alter table public.asset_links
  add column if not exists link_type text not null default 'attachment';

alter table public.asset_links drop constraint if exists asset_links_link_type_check;
alter table public.asset_links add constraint asset_links_link_type_check check (
  link_type in ('attachment','handoff') or
  link_type ~ '^manifest:(source_design|export_mesh|slicer_project|reference_image|setup_document|quality_reference|packaging_reference):(current|historical)$'
);
create index if not exists asset_links_manifest_idx
  on public.asset_links(owner_id,record_key,link_type)
  where record_type='recipe' and link_type like 'manifest:%:current';

-- Atomically replace one exact current recipe manifest role while retaining history.
create or replace function public.link_recipe_manifest_revision(p_recipe_id uuid,p_asset_revision_id uuid,p_manifest_role text)
returns public.asset_links language plpgsql security invoker set search_path=public,pg_temp as $$
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
end $$;
revoke all on function public.link_recipe_manifest_revision(uuid,uuid,text) from public,anon;
grant execute on function public.link_recipe_manifest_revision(uuid,uuid,text) to authenticated;

-- The accepted Quote and created Order are joined by their database IDs, never by a
-- filename or display-name approximation. Only customer-supplied active revisions
-- transfer automatically; the source Quote link and file bytes remain unchanged.
create or replace function public.transfer_accepted_quote_asset_links()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
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
end $$;
revoke all on function public.transfer_accepted_quote_asset_links() from public,anon,authenticated;

drop trigger if exists orders_transfer_accepted_quote_assets on public.orders;
create trigger orders_transfer_accepted_quote_assets after insert on public.orders
for each row execute function public.transfer_accepted_quote_asset_links();

commit;
