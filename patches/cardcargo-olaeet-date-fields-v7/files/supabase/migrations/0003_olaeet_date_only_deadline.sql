-- OLAEET package dates are entered as calendar dates in CardCargo.
-- Keep the existing timestamptz columns for backwards compatibility, but
-- enforce the storage deadline as exactly 80 days after arrival.

create or replace function public.set_warehouse_package_storage_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.arrived_at is null then
    new.storage_deadline_at := null;
  else
    new.storage_deadline_at := new.arrived_at + interval '80 days';
  end if;

  return new;
end;
$$;

drop trigger if exists warehouse_packages_storage_deadline_trigger
on public.warehouse_packages;

create trigger warehouse_packages_storage_deadline_trigger
before insert or update of arrived_at
on public.warehouse_packages
for each row
execute function public.set_warehouse_package_storage_deadline();

-- Backfill packages already stored before this rule was introduced.
update public.warehouse_packages
set storage_deadline_at = arrived_at + interval '80 days'
where arrived_at is not null
  and storage_deadline_at is distinct from arrived_at + interval '80 days';

update public.warehouse_packages
set storage_deadline_at = null
where arrived_at is null
  and storage_deadline_at is not null;

notify pgrst, 'reload schema';
