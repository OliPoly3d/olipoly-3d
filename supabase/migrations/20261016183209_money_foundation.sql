-- Money milestone 1. Review and apply manually; do not auto-run against production.
begin;
create schema if not exists money_private;
revoke all on schema money_private from public, anon, authenticated;

create table public.money_access (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);
alter table public.money_access enable row level security;
revoke all on public.money_access from public, anon, authenticated;
grant select on public.money_access to authenticated;
create policy money_access_self on public.money_access for select to authenticated
using (user_id = (select auth.uid()));

create table public.money_plans (
  user_id uuid primary key references public.money_access(user_id),
  revision integer not null default 0 check (revision >= 0),
  body jsonb not null check (
    jsonb_typeof(body) = 'object' and body->>'version' = '1'
    and jsonb_typeof(body->'accounts') = 'array'
    and jsonb_typeof(body->'transactions') = 'array'
    and jsonb_typeof(body->'schedules') = 'array'
    and body ?& array['version','start','accounts','transactions','schedules']
    and octet_length(body::text) <= 2000000
  ),
  updated_at timestamptz not null default now()
);
alter table public.money_plans enable row level security;
revoke all on public.money_plans from public, anon, authenticated;
grant select on public.money_plans to authenticated;
grant update(body, revision) on public.money_plans to authenticated;
create policy money_plan_read on public.money_plans for select to authenticated
using (user_id = (select auth.uid()) and exists(select 1 from public.money_access a where a.user_id=(select auth.uid())));
create policy money_plan_write on public.money_plans for update to authenticated
using (user_id = (select auth.uid()) and exists(select 1 from public.money_access a where a.user_id=(select auth.uid())))
with check (user_id = (select auth.uid()) and exists(select 1 from public.money_access a where a.user_id=(select auth.uid())));

create table public.money_history (
  user_id uuid not null,
  revision integer not null,
  body jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (user_id, revision)
);
alter table public.money_history enable row level security;
revoke all on public.money_history from public, anon, authenticated;
grant select on public.money_history to authenticated;
create policy money_history_read on public.money_history for select to authenticated
using (user_id = (select auth.uid()) and exists(select 1 from public.money_access a where a.user_id=(select auth.uid())));

-- The private trigger is privileged only to append immutable history.
-- It cannot be called as a normal RPC and never accepts a client-supplied owner.
create function money_private.archive_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.revision <> old.revision + 1 then
    raise exception 'Invalid Money revision or owner change';
  end if;
  if auth.uid() is distinct from old.user_id then
    raise exception 'Money owner authentication required';
  end if;
  if not exists(select 1 from public.money_access where user_id=auth.uid()) then
    raise exception 'Money access revoked';
  end if;
  insert into public.money_history(user_id,revision,body) values(old.user_id,old.revision,old.body);
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function money_private.archive_revision() from public, anon, authenticated;
create trigger money_archive_revision before update on public.money_plans
for each row execute function money_private.archive_revision();
commit;

-- Provision ONE existing verified auth.users.id in a separate admin transaction.
-- No account email/UUID, balances, or financial seed data belong in Git.
-- insert into public.money_access(user_id) values ('VERIFIED-OWNER-UUID');
-- insert into public.money_plans(user_id,body) values ('VERIFIED-OWNER-UUID',
--   '{"version":1,"start":"YYYY-MM-DD","accounts":[],"transactions":[],"schedules":[]}');
