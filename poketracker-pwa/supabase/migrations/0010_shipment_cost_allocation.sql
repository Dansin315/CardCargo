-- Shipment cost allocation.
-- Allocates international shipping, forwarding fees and import costs to the
-- Bunjang purchases contained in the OLAEET packages of one outbound shipment.

create table if not exists public.shipment_cost_allocation_settings (
  shipment_id uuid primary key references public.shipments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shipping_method text not null default 'package_weight',
  forwarding_method text not null default 'equal_purchase',
  import_method text not null default 'purchase_value',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipment_cost_allocation_shipping_method_check
    check (shipping_method in ('package_weight', 'purchase_value', 'equal_purchase', 'manual')),
  constraint shipment_cost_allocation_forwarding_method_check
    check (forwarding_method in ('package_weight', 'purchase_value', 'equal_purchase', 'manual')),
  constraint shipment_cost_allocation_import_method_check
    check (import_method in ('package_weight', 'purchase_value', 'equal_purchase', 'manual'))
);

create table if not exists public.shipment_purchase_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  warehouse_package_id uuid not null references public.warehouse_packages(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  international_shipping_amount numeric(14,2) not null default 0,
  forwarding_fee_amount numeric(14,2) not null default 0,
  import_tax_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipment_purchase_cost_allocations_nonnegative check (
    international_shipping_amount >= 0
    and forwarding_fee_amount >= 0
    and import_tax_amount >= 0
  ),
  constraint shipment_purchase_cost_allocations_unique unique (shipment_id, purchase_id)
);

create index if not exists shipment_purchase_cost_allocations_purchase_idx
  on public.shipment_purchase_cost_allocations(user_id, purchase_id);
create index if not exists shipment_purchase_cost_allocations_package_idx
  on public.shipment_purchase_cost_allocations(user_id, warehouse_package_id);

alter table public.shipment_cost_allocation_settings enable row level security;
alter table public.shipment_purchase_cost_allocations enable row level security;

drop policy if exists "Owner manages shipment cost allocation settings"
  on public.shipment_cost_allocation_settings;
create policy "Owner manages shipment cost allocation settings"
  on public.shipment_cost_allocation_settings
  for all
  to authenticated
  using (public.is_app_owner() and user_id = (select auth.uid()))
  with check (public.is_app_owner() and user_id = (select auth.uid()));

drop policy if exists "Owner manages shipment purchase cost allocations"
  on public.shipment_purchase_cost_allocations;
create policy "Owner manages shipment purchase cost allocations"
  on public.shipment_purchase_cost_allocations
  for all
  to authenticated
  using (public.is_app_owner() and user_id = (select auth.uid()))
  with check (public.is_app_owner() and user_id = (select auth.uid()));

grant select, insert, update, delete
  on public.shipment_cost_allocation_settings,
     public.shipment_purchase_cost_allocations
  to authenticated;

drop trigger if exists shipment_cost_allocation_settings_set_updated_at
  on public.shipment_cost_allocation_settings;
create trigger shipment_cost_allocation_settings_set_updated_at
before update on public.shipment_cost_allocation_settings
for each row execute function public.set_updated_at();

drop trigger if exists shipment_purchase_cost_allocations_set_updated_at
  on public.shipment_purchase_cost_allocations;
create trigger shipment_purchase_cost_allocations_set_updated_at
before update on public.shipment_purchase_cost_allocations
for each row execute function public.set_updated_at();

-- Transactional save: validates ownership, current shipment membership and that
-- every cost component adds up exactly to the amount stored on the shipment.
create or replace function public.save_shipment_cost_allocation(
  p_shipment_id uuid,
  p_shipping_method text,
  p_forwarding_method text,
  p_import_method text,
  p_allocations jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_shipping numeric(14,2);
  v_forwarding numeric(14,2);
  v_import numeric(14,2);
  v_expected_count integer;
  v_input_count integer;
begin
  if not public.is_app_owner() then
    raise exception 'Not authorized';
  end if;

  if p_shipping_method not in ('package_weight', 'purchase_value', 'equal_purchase', 'manual')
     or p_forwarding_method not in ('package_weight', 'purchase_value', 'equal_purchase', 'manual')
     or p_import_method not in ('package_weight', 'purchase_value', 'equal_purchase', 'manual') then
    raise exception 'Invalid allocation method';
  end if;

  select
    coalesce(s.international_shipping_amount, 0),
    coalesce(s.forwarding_fee_amount, 0),
    coalesce(s.import_tax_amount, 0)
  into v_shipping, v_forwarding, v_import
  from public.shipments s
  where s.id = p_shipment_id
    and s.user_id = v_user_id;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Allocations must be an array';
  end if;

  select count(*)
  into v_expected_count
  from public.shipment_packages sp
  join public.warehouse_package_purchases wpp
    on wpp.warehouse_package_id = sp.warehouse_package_id
   and wpp.user_id = v_user_id
  where sp.shipment_id = p_shipment_id
    and sp.user_id = v_user_id;

  select count(*)
  into v_input_count
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb));

  if v_expected_count = 0 then
    raise exception 'Shipment has no linked purchases';
  end if;

  if v_input_count <> v_expected_count then
    raise exception 'Allocation must contain every purchase in the shipment exactly once';
  end if;

  if exists (
    select 1
    from (
      select (item->>'purchaseId')::uuid as purchase_id, count(*) as n
      from jsonb_array_elements(p_allocations) item
      group by (item->>'purchaseId')::uuid
      having count(*) <> 1
    ) duplicates
  ) then
    raise exception 'Duplicate purchase in allocation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) item
    left join public.shipment_packages sp
      on sp.shipment_id = p_shipment_id
     and sp.user_id = v_user_id
     and sp.warehouse_package_id = (item->>'warehousePackageId')::uuid
    left join public.warehouse_package_purchases wpp
      on wpp.user_id = v_user_id
     and wpp.warehouse_package_id = sp.warehouse_package_id
     and wpp.purchase_id = (item->>'purchaseId')::uuid
    where sp.warehouse_package_id is null
       or wpp.purchase_id is null
  ) then
    raise exception 'At least one allocation does not match the current shipment/package/purchase relationship';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) item
    where coalesce((item->>'internationalShippingAmount')::numeric, 0) < 0
       or coalesce((item->>'forwardingFeeAmount')::numeric, 0) < 0
       or coalesce((item->>'importTaxAmount')::numeric, 0) < 0
  ) then
    raise exception 'Allocation amounts must not be negative';
  end if;

  if round((
    select coalesce(sum((item->>'internationalShippingAmount')::numeric), 0)
    from jsonb_array_elements(p_allocations) item
  ), 2) <> round(v_shipping, 2) then
    raise exception 'Allocated international shipping does not equal shipment international shipping';
  end if;

  if round((
    select coalesce(sum((item->>'forwardingFeeAmount')::numeric), 0)
    from jsonb_array_elements(p_allocations) item
  ), 2) <> round(v_forwarding, 2) then
    raise exception 'Allocated forwarding fees do not equal shipment forwarding fees';
  end if;

  if round((
    select coalesce(sum((item->>'importTaxAmount')::numeric), 0)
    from jsonb_array_elements(p_allocations) item
  ), 2) <> round(v_import, 2) then
    raise exception 'Allocated import costs do not equal shipment import costs';
  end if;

  insert into public.shipment_cost_allocation_settings (
    shipment_id,
    user_id,
    shipping_method,
    forwarding_method,
    import_method
  ) values (
    p_shipment_id,
    v_user_id,
    p_shipping_method,
    p_forwarding_method,
    p_import_method
  )
  on conflict (shipment_id) do update set
    shipping_method = excluded.shipping_method,
    forwarding_method = excluded.forwarding_method,
    import_method = excluded.import_method,
    updated_at = now();

  delete from public.shipment_purchase_cost_allocations
  where shipment_id = p_shipment_id
    and user_id = v_user_id;

  insert into public.shipment_purchase_cost_allocations (
    user_id,
    shipment_id,
    warehouse_package_id,
    purchase_id,
    international_shipping_amount,
    forwarding_fee_amount,
    import_tax_amount
  )
  select
    v_user_id,
    p_shipment_id,
    (item->>'warehousePackageId')::uuid,
    (item->>'purchaseId')::uuid,
    round((item->>'internationalShippingAmount')::numeric, 2),
    round((item->>'forwardingFeeAmount')::numeric, 2),
    round((item->>'importTaxAmount')::numeric, 2)
  from jsonb_array_elements(p_allocations) item;
end;
$$;

revoke all
on function public.save_shipment_cost_allocation(uuid, text, text, text, jsonb)
from public;

grant execute
on function public.save_shipment_cost_allocation(uuid, text, text, text, jsonb)
to authenticated;

-- Source shipment costs changing invalidates the saved purchase allocations.
create or replace function public.clear_shipment_cost_allocation_on_shipment_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.international_shipping_amount is distinct from new.international_shipping_amount
     or old.forwarding_fee_amount is distinct from new.forwarding_fee_amount
     or old.import_tax_amount is distinct from new.import_tax_amount
     or old.currency is distinct from new.currency then
    delete from public.shipment_purchase_cost_allocations
    where shipment_id = new.id
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_clear_cost_allocation
  on public.shipments;
create trigger shipments_clear_cost_allocation
after update on public.shipments
for each row execute function public.clear_shipment_cost_allocation_on_shipment_change();

-- Weight changes invalidate weight-based suggestions/saved allocations for the
-- shipment containing that OLAEET package.
create or replace function public.clear_shipment_cost_allocation_on_package_weight_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.weight_grams is distinct from new.weight_grams then
    delete from public.shipment_purchase_cost_allocations a
    where a.user_id = new.user_id
      and exists (
        select 1
        from public.shipment_packages sp
        where sp.shipment_id = a.shipment_id
          and sp.warehouse_package_id = new.id
          and sp.user_id = new.user_id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_packages_clear_cost_allocation
  on public.warehouse_packages;
create trigger warehouse_packages_clear_cost_allocation
after update on public.warehouse_packages
for each row execute function public.clear_shipment_cost_allocation_on_package_weight_change();

-- Purchase value changes invalidate value-based allocation results.
create or replace function public.clear_shipment_cost_allocation_on_purchase_value_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.price_amount is distinct from new.price_amount
     or old.domestic_shipping_amount is distinct from new.domestic_shipping_amount
     or old.service_fee_amount is distinct from new.service_fee_amount
     or old.price_currency is distinct from new.price_currency then
    delete from public.shipment_purchase_cost_allocations a
    where a.user_id = new.user_id
      and exists (
        select 1
        from public.warehouse_package_purchases wpp
        join public.shipment_packages sp
          on sp.warehouse_package_id = wpp.warehouse_package_id
         and sp.user_id = new.user_id
        where wpp.purchase_id = new.id
          and wpp.user_id = new.user_id
          and sp.shipment_id = a.shipment_id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_clear_shipment_cost_allocation
  on public.purchases;
create trigger purchases_clear_shipment_cost_allocation
after update on public.purchases
for each row execute function public.clear_shipment_cost_allocation_on_purchase_value_change();

-- Keep the existing exclusive assignment behavior, but avoid rewriting identical
-- package sets. A genuine package-set change invalidates saved allocations.
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
  old_ids uuid[];
  new_ids uuid[];
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

  select coalesce(array_agg(sp.warehouse_package_id order by sp.warehouse_package_id), '{}'::uuid[])
  into old_ids
  from public.shipment_packages sp
  where sp.shipment_id = p_shipment_id
    and sp.user_id = auth.uid();

  select coalesce(array_agg(x.requested_id order by x.requested_id), '{}'::uuid[])
  into new_ids
  from (
    select distinct requested_id
    from unnest(normalized_ids) as requested(requested_id)
  ) x;

  if old_ids is not distinct from new_ids then
    return;
  end if;

  delete from public.shipment_purchase_cost_allocations
  where shipment_id = p_shipment_id
    and user_id = auth.uid();

  delete from public.shipment_packages
  where shipment_id = p_shipment_id
    and user_id = auth.uid();

  insert into public.shipment_packages (
    user_id,
    shipment_id,
    warehouse_package_id
  )
  select auth.uid(), p_shipment_id, selected.requested_id
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
