-- ERP Blueprint v1: Fundraiser / Campaign Manager Phase 1 foundation.
-- Forward-only migration. Deploy manually in Supabase SQL Editor after review.
-- Codex did not deploy this SQL or alter Supabase state.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  campaign_slug text not null,
  campaign_code text not null,
  name text not null,
  organization_name text not null,
  public_description text,
  status text not null default 'draft' check (status in ('draft','scheduled','active','closed','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  payment_mode text not null default 'external_org_collects' check (payment_mode in ('external_org_collects','olipoly_collects')),
  delivery_mode text not null default 'organization_pickup' check (delivery_mode in ('organization_pickup','event_pickup','customer_pickup','shipping','mixed')),
  branding_config jsonb not null default '{}'::jsonb,
  public_config jsonb not null default '{}'::jsonb,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_slug_format check (campaign_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint campaigns_code_format check (campaign_code ~ '^[A-Z0-9][A-Z0-9-]{1,62}[A-Z0-9]$'),
  constraint campaigns_window_order check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create unique index if not exists campaigns_slug_unique_idx on public.campaigns (campaign_slug);
create unique index if not exists campaigns_user_code_unique_idx on public.campaigns (user_id, campaign_code);
create index if not exists campaigns_user_status_idx on public.campaigns (user_id, status, updated_at desc);
create index if not exists campaigns_public_lookup_idx on public.campaigns (campaign_slug, status, starts_at, ends_at);

create table if not exists public.campaign_products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  product_recipe_id uuid references public.product_recipes(id) on delete set null,
  campaign_sku text not null,
  display_name text not null,
  public_description text,
  display_order integer not null default 0 check (display_order >= 0),
  enabled boolean not null default true,
  standard_customer_price numeric(12,2) not null check (standard_customer_price >= 0),
  personalized_customer_price numeric(12,2) check (personalized_customer_price is null or personalized_customer_price >= standard_customer_price),
  olipoly_standard_share numeric(12,2) not null check (olipoly_standard_share >= 0),
  olipoly_personalized_share numeric(12,2) check (olipoly_personalized_share is null or olipoly_personalized_share >= olipoly_standard_share),
  personalization_enabled boolean not null default false,
  personalization_instructions text,
  personalization_limits jsonb not null default '{}'::jsonb,
  image_url text,
  reference_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_products_sku_format check (campaign_sku ~ '^[A-Z0-9][A-Z0-9-]{1,62}[A-Z0-9]$'),
  constraint campaign_products_personalized_config check (personalization_enabled or personalized_customer_price is null),
  constraint campaign_products_share_not_over_price check (olipoly_standard_share <= standard_customer_price and (olipoly_personalized_share is null or personalized_customer_price is null or olipoly_personalized_share <= personalized_customer_price))
);

create unique index if not exists campaign_products_campaign_sku_unique_idx on public.campaign_products (campaign_id, campaign_sku);
create index if not exists campaign_products_campaign_order_idx on public.campaign_products (campaign_id, enabled, display_order, campaign_sku);
create index if not exists campaign_products_user_idx on public.campaign_products (user_id, updated_at desc);

create or replace function public.set_campaign_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_campaign_updated_at();
drop trigger if exists campaign_products_set_updated_at on public.campaign_products;
create trigger campaign_products_set_updated_at before update on public.campaign_products for each row execute function public.set_campaign_updated_at();

alter table public.campaigns enable row level security;
alter table public.campaign_products enable row level security;

drop policy if exists "Users manage own campaigns" on public.campaigns;
create policy "Users manage own campaigns" on public.campaigns for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own campaign products" on public.campaign_products;
create policy "Users manage own campaign products" on public.campaign_products for all to authenticated using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
);

revoke all on table public.campaigns from anon;
revoke all on table public.campaign_products from anon;
grant select, insert, update on table public.campaigns to authenticated;
grant select, insert, update on table public.campaign_products to authenticated;

create or replace function public.get_public_campaign(p_campaign_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := lower(trim(coalesce(p_campaign_slug, '')));
  v_payload jsonb;
begin
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'Invalid campaign slug' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'campaign_slug', c.campaign_slug,
    'campaign_code', c.campaign_code,
    'name', c.name,
    'organization_name', c.organization_name,
    'public_description', c.public_description,
    'status', c.status,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'payment_mode', c.payment_mode,
    'delivery_mode', c.delivery_mode,
    'branding_config', c.branding_config,
    'public_config', c.public_config,
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign_sku', p.campaign_sku,
        'display_name', p.display_name,
        'public_description', p.public_description,
        'display_order', p.display_order,
        'standard_customer_price', p.standard_customer_price,
        'personalized_customer_price', p.personalized_customer_price,
        'personalization_enabled', p.personalization_enabled,
        'personalization_instructions', p.personalization_instructions,
        'personalization_limits', p.personalization_limits,
        'image_url', p.image_url,
        'reference_url', p.reference_url
      ) order by p.display_order, p.campaign_sku)
      from public.campaign_products p
      where p.campaign_id = c.id and p.enabled = true
    ), '[]'::jsonb)
  )
  into v_payload
  from public.campaigns c
  where c.campaign_slug = v_slug
    and c.status in ('scheduled','active')
    and (c.starts_at is null or c.starts_at <= now() or c.status = 'scheduled')
    and (c.ends_at is null or c.ends_at > now())
  limit 1;

  return v_payload;
end;
$$;

revoke all on function public.get_public_campaign(text) from public;
grant execute on function public.get_public_campaign(text) to anon, authenticated;

comment on table public.campaigns is 'Owner-scoped Campaign Manager Phase 1 authority for fundraiser/campaign setup; no orders, production batching, or settlement accounting.';
comment on table public.campaign_products is 'Owner-scoped products assigned to a campaign with public price terms and private OliPoly share terms.';
comment on function public.get_public_campaign(text) is 'Customer-safe campaign lookup RPC. Returns active/scheduled campaign data and enabled products only; excludes owner IDs, table IDs, private notes, and OliPoly share fields.';

-- Verification SQL (run manually after deployment):
-- select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('campaigns','campaign_products');
-- select policyname, roles, cmd from pg_policies where schemaname='public' and tablename in ('campaigns','campaign_products') order by tablename, policyname;
-- select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('campaigns','campaign_products') order by table_name, grantee, privilege_type;
-- select routine_name, security_type from information_schema.routines where routine_schema='public' and routine_name='get_public_campaign';
