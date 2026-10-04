-- Enforce that each purchase can be assigned to only one OLAEET package at a time.
-- Run after 0002_olaeet_packages.sql and 0003_olaeet_date_only_deadline.sql.

-- Do not silently choose between conflicting existing assignments.
do $$
begin
  if exists (
    select 1
    from public.warehouse_package_purchases
    group by user_id, purchase_id
    having count(*) > 1
  ) then
    raise exception using
      message = 'Existing duplicate purchase assignments found.',
      detail = 'Remove duplicate rows from warehouse_package_purchases before running migration 0004.';
  end if;
end
$$;

create unique index if not exists warehouse_package_purchases_one_package_per_purchase
  on public.warehouse_package_purchases(user_id, purchase_id);

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
    raise exception 'Nicht autorisiert.';
  end if;

  if not exists (
    select 1
    from public.warehouse_packages wp
    where wp.id = p_package_id
      and wp.user_id = (select auth.uid())
  ) then
    raise exception 'OLAEET-Paket wurde nicht gefunden.';
  end if;

  if exists (
    select 1
    from unnest(normalized_ids) as requested(requested_id)
    left join public.purchases p
      on p.id = requested.requested_id
     and p.user_id = (select auth.uid())
    where p.id is null
  ) then
    raise exception 'Mindestens ein Einkauf gehört nicht zum aktuellen Benutzer.';
  end if;

  if exists (
    select 1
    from unnest(normalized_ids) as requested(requested_id)
    join public.warehouse_package_purchases link
      on link.purchase_id = requested.requested_id
     and link.user_id = (select auth.uid())
     and link.warehouse_package_id <> p_package_id
  ) then
    raise exception 'Mindestens ein Einkauf ist bereits einem anderen OLAEET-Paket zugeordnet.';
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
    selected.requested_id
  from (
    select distinct requested_id
    from unnest(normalized_ids) as requested(requested_id)
  ) selected;
end;
$$;

revoke all
on function public.replace_warehouse_package_purchases(uuid, uuid[])
from public;

grant execute
on function public.replace_warehouse_package_purchases(uuid, uuid[])
to authenticated;

notify pgrst, 'reload schema';
