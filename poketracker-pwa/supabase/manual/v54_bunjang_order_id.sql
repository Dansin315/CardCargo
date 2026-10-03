-- CardCargo v54 – durable Bunjang order identity

alter table public.purchases
  add column if not exists bunjang_order_id text;

create unique index if not exists purchases_bunjang_order_id_unique
  on public.purchases(user_id, bunjang_order_id)
  where bunjang_order_id is not null;

notify pgrst, 'reload schema';
