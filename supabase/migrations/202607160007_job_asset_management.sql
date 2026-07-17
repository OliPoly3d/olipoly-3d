-- Milestone 4C: private job assets. Deploy manually; application code does not apply migrations.
begin;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('job-assets','job-assets',false,104857600,array[
  'application/octet-stream','application/pdf','application/zip','application/vnd.ms-pki.stl',
  'model/stl','model/3mf','model/step','image/png','image/jpeg','image/webp','image/svg+xml',
  'text/plain','text/markdown','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/postscript'
]) on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.asset_records (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  filename text not null check (length(filename) between 1 and 255), storage_path text not null unique,
  mime_type text not null, category text not null check(category in ('fusion_source','step','stl','slicer_project','reference_image','finished_photo','assembly_instructions','packaging_template','customer_artwork','production_document','other')),
  file_size bigint not null check(file_size > 0 and file_size <= 104857600), revision integer not null default 1 check(revision > 0),
  revision_group_id uuid not null, supersedes_asset_id uuid references public.asset_records(id), description text,
  uploaded_at timestamptz not null default now(), uploaded_by text, status text not null default 'active' check(status in ('active','archived')),
  archived_at timestamptz, designation text not null default 'internal' check(designation in ('internal','customer_supplied')),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'), created_at timestamptz not null default now(),
  unique(owner_id,revision_group_id,revision), unique(owner_id,sha256,revision_group_id)
);
create index if not exists asset_records_owner_current_idx on public.asset_records(owner_id,revision_group_id,revision desc) where status='active';

create table if not exists public.asset_links (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  asset_revision_id uuid not null references public.asset_records(id) on delete cascade,
  record_type text not null check(record_type in ('recipe','quote','order','production_job','customer')),
  record_key text not null check(length(trim(record_key)) > 0), created_at timestamptz not null default now(),
  unique(asset_revision_id,record_type,record_key)
);
create index if not exists asset_links_record_idx on public.asset_links(owner_id,record_type,record_key);

alter table public.asset_records enable row level security;
alter table public.asset_links enable row level security;
drop policy if exists asset_records_owner_select on public.asset_records;
create policy asset_records_owner_select on public.asset_records for select to authenticated using(owner_id=auth.uid());
drop policy if exists asset_records_owner_insert on public.asset_records;
create policy asset_records_owner_insert on public.asset_records for insert to authenticated with check(owner_id=auth.uid() and split_part(storage_path,'/',1)=auth.uid()::text);
drop policy if exists asset_records_owner_update on public.asset_records;
create policy asset_records_owner_update on public.asset_records for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists asset_records_owner_delete on public.asset_records;
create policy asset_records_owner_delete on public.asset_records for delete to authenticated using(owner_id=auth.uid());
drop policy if exists asset_links_owner_all on public.asset_links;
create policy asset_links_owner_all on public.asset_links for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and exists(select 1 from public.asset_records a where a.id=asset_revision_id and a.owner_id=auth.uid()));

drop policy if exists job_assets_owner_select on storage.objects;
create policy job_assets_owner_select on storage.objects for select to authenticated using(bucket_id='job-assets' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists job_assets_owner_insert on storage.objects;
create policy job_assets_owner_insert on storage.objects for insert to authenticated with check(bucket_id='job-assets' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists job_assets_owner_delete on storage.objects;
create policy job_assets_owner_delete on storage.objects for delete to authenticated using(bucket_id='job-assets' and (storage.foldername(name))[1]=auth.uid()::text);
grant select,insert,update,delete on public.asset_records,public.asset_links to authenticated;
commit;

-- Verification (run after deployment):
-- select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='job-assets';
-- select tablename,policyname,cmd,roles from pg_policies where tablename in ('asset_records','asset_links','objects') order by tablename,policyname;
-- select conrelid::regclass,conname from pg_constraint where conrelid in ('public.asset_records'::regclass,'public.asset_links'::regclass);
