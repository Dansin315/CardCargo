-- CardCargo v50 – Phase A: domestic tracking on purchases
-- Idempotent. May be run directly in the Supabase SQL Editor.

alter table public.purchases
  add column if not exists domestic_carrier text,
  add column if not exists domestic_tracking_number text;

create index if not exists purchases_domestic_tracking_idx
  on public.purchases(user_id, domestic_tracking_number)
  where domestic_tracking_number is not null;

notify pgrst, 'reload schema';
