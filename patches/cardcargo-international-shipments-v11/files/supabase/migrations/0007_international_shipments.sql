-- International OLAEET shipments: service level, total weight and exclusive
-- assignment of each warehouse package to at most one outbound shipment.

alter table public.shipments
  add column if not exists shipping_service text not null default 'other',
  add column if not exists total_weight_grams numeric(14,2);

alter table public.shipments
  drop constraint if exists shipments_shipping_service_check;

alter table public.shipments
  add constraint shipments_shipping_service_check
  check (
    shipping_service in (
      'fedex_priority',
      'fedex_economy',
      'fedex_connect',
      'fedex_express',
      'ems',
      'ems_premium',
      'k_packet',
      'air_mail',
      'ocean_transport',
      'other'
    )
  );

alter table public.shipments
  drop constraint if exists shipments_total_weight_nonnegative;

alter table public.shipments
  add constraint shipments_total_weight_nonnegative
  check (total_weight_grams is null or total_weight_grams >= 0);

alter table public.shipments
  drop constraint if exists shipments_costs_nonnegative;

alter table public.shipments
  add constraint shipments_costs_nonnegative
  check (
    (international_shipping_amount is null or international_shipping_amount >= 0)
    and (forwarding_fee_amount is null or forwarding_fee_amount >= 0)
    and (import_tax_amount is null or import_tax_amount >= 0)
  );

create unique index if not exists shipments_external_unique
  on public.shipments(user_id, provider, external_shipment_id)
  where external_shipment_id is not null;

create index if not exists shipments_tracking_idx
  on public.shipments(user_id, tracking_number)
  where tracking_number is not null;

create index if not exists shipments_status_idx
  on public.shipments(user_id, status, created_at desc);

-- Stop instead of silently deleting ambiguous historical assignments.
do $$
begin
  if exists (
    select 1
    from public.shipment_packages
    group by user_id, warehouse_package_id
    having count(*) > 1
  ) then
    raise exception using
      message = 'Existing OLAEET packages are assigned to more than one shipment.',
      hint = 'Resolve duplicate rows in public.shipment_packages before rerunning migration 0007.';
  end if;
end
$$;

create unique index if not exists shipment_packages_user_package_unique
  on public.shipment_packages(user_id, warehouse_package_id);

create or replace function public.replace_shipment_packages(
  p_shipment_id uuid,
  p_warehouse_package_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_ids uuid[] := coalesce(p_warehouse_package_ids, '{}'::uuid[]);
begin
  if not public.is_app_owner() then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1
    from public.shipments s
    where s.id = p_shipment_id
      and s.user_id = auth.uid()
  ) then
    raise exception 'Shipment not found';
  end if;

  if exists (
    select 1
    from unnest(normalized_ids) as requested(requested_id)
    left join public.warehouse_packages wp
      on wp.id = requested.requested_id
     and wp.user_id = auth.uid()
    where wp.id is null
  ) then
    raise exception 'At least one warehouse package does not belong to the current user';
  end if;

  if exists (
    select 1
    from unnest(normalized_ids) as requested(requested_id)
    join public.shipment_packages sp
      on sp.warehouse_package_id = requested.requested_id
     and sp.user_id = auth.uid()
    where sp.shipment_id <> p_shipment_id
  ) then
    raise exception 'At least one warehouse package is already assigned to another shipment';
  end if;

  delete from public.shipment_packages
  where shipment_id = p_shipment_id
    and user_id = auth.uid();

  insert into public.shipment_packages (
    user_id,
    shipment_id,
    warehouse_package_id
  )
  select
    auth.uid(),
    p_shipment_id,
    selected.requested_id
  from (
    select distinct requested_id
    from unnest(normalized_ids) as requested(requested_id)
  ) selected;
end;
$$;

revoke all
on function public.replace_shipment_packages(uuid, uuid[])
from public;

grant execute
on function public.replace_shipment_packages(uuid, uuid[])
to authenticated;

notify pgrst, 'reload schema';
