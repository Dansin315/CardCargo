-- OLAEET package management (manual CRUD foundation)
-- Run once after 0001_initial.sql.

alter table public.warehouse_packages
  add column if not exists domestic_carrier text,
  add column if not exists sender_name text,
  add column if not exists package_description text,
  add column if not exists provider_status text,
  add column if not exists inspected_at timestamptz,
  add column if not exists storage_started_at timestamptz,
  add column if not exists storage_deadline_at timestamptz,
  add column if not exists record_source text not null default 'manual';

alter table public.warehouse_packages
  drop constraint if exists warehouse_packages_record_source_check;

alter table public.warehouse_packages
  add constraint warehouse_packages_record_source_check
  check (record_source in ('manual', 'csv', 'xlsx', 'email', 'api'));

create index if not exists warehouse_packages_tracking_idx
  on public.warehouse_packages(user_id, domestic_tracking_number);

create index if not exists warehouse_packages_arrived_idx
  on public.warehouse_packages(user_id, arrived_at desc);

create index if not exists warehouse_packages_status_idx
  on public.warehouse_packages(user_id, status);

create or replace function public.replace_warehouse_package_purchases(
  p_package_id uuid,
  p_purchase_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_ids uuid[] := coalesce(p_purchase_ids, '{}'::uuid[]);
begin
  if not public.is_app_owner() then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1
    from public.warehouse_packages wp
    where wp.id = p_package_id
      and wp.user_id = (select auth.uid())
  ) then
    raise exception 'Warehouse package not found';
  end if;

  if exists (
    select 1
    from unnest(normalized_ids) requested_id
    left join public.purchases p
      on p.id = requested_id
     and p.user_id = (select auth.uid())
    where p.id is null
  ) then
    raise exception 'At least one purchase does not belong to the current user';
  end if;

  delete from public.warehouse_package_purchases
  where warehouse_package_id = p_package_id
    and user_id = (select auth.uid());

  insert into public.warehouse_package_purchases (
    user_id,
    warehouse_package_id,
    purchase_id
  )
  select
    (select auth.uid()),
    p_package_id,
    requested_id
  from (
    select distinct unnest(normalized_ids) as requested_id
  ) selected;
end;
$$;

revoke all on function public.replace_warehouse_package_purchases(uuid, uuid[]) from public;
grant execute on function public.replace_warehouse_package_purchases(uuid, uuid[]) to authenticated;
