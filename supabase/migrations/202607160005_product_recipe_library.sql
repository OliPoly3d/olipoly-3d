-- Milestone 4A: versioned internal Product / Recipe Library.
-- Deploy manually in Supabase SQL Editor. The application continues to use its browser backup until deployed.
create table if not exists public.product_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_key uuid not null,
  revision_number integer not null check (revision_number > 0),
  revision text not null,
  name text not null,
  olipoly_part_number text,
  category text,
  active boolean not null default true,
  default_quantity integer not null default 1 check (default_quantity > 0),
  suggested_selling_price numeric(12,2),
  suggested_piece_price numeric(12,2),
  manufacturing_snapshot jsonb not null default '{}'::jsonb,
  internal_notes text,
  customer_description text,
  source_production_job_id uuid,
  source_order_number text,
  supersedes_recipe_id uuid references public.product_recipes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, recipe_key, revision_number)
);
create index if not exists product_recipes_user_active_idx on public.product_recipes(user_id, active, updated_at desc);
create index if not exists product_recipes_part_idx on public.product_recipes(user_id, olipoly_part_number);
alter table public.product_recipes enable row level security;
drop policy if exists "Users manage own product recipes" on public.product_recipes;
create policy "Users manage own product recipes" on public.product_recipes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
comment on table public.product_recipes is 'Versioned internal manufacturing recipe snapshots; intentionally excludes customer contact fields.';
