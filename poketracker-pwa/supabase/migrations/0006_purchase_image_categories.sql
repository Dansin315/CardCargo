-- Add categories for manually appended purchase images such as chat screenshots,
-- condition details, receipts and shipping evidence.

alter table public.purchase_images
  add column if not exists category text;

update public.purchase_images
set category = case
  when kind = 'remote' then 'listing'
  else 'general'
end
where category is null;

alter table public.purchase_images
  alter column category set default 'listing',
  alter column category set not null;

alter table public.purchase_images
  drop constraint if exists purchase_images_category_check;

alter table public.purchase_images
  add constraint purchase_images_category_check
  check (
    category in (
      'listing',
      'general',
      'chat',
      'condition',
      'receipt',
      'shipping'
    )
  );

notify pgrst, 'reload schema';
