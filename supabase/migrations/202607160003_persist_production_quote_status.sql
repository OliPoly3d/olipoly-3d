-- Milestone 2B.1: make accepted Quote -> Production workflow advancement durable.
-- Apply this migration deliberately through the normal Supabase migration process.

create or replace function public.advance_linked_production_on_quote_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_response = 'accepted'
     and old.customer_response is distinct from new.customer_response then
    update public.production_jobs
       set production_status = 'ready_to_print',
           updated_at = greatest(coalesce(updated_at, '-infinity'::timestamptz), now())
     where quote_number = new.quote_number
       and production_status = 'waiting_customer';
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_advance_linked_production on public.quotes;
create trigger quotes_advance_linked_production
after update of customer_response on public.quotes
for each row
execute function public.advance_linked_production_on_quote_acceptance();
