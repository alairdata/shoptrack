-- Run in Supabase SQL Editor. Email/password accounts must be created in Supabase Auth.
create table if not exists public.items (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name))>0), category text not null,
 quantity integer not null default 0 check(quantity>=0),
 cost numeric(12,2) not null check(cost>=0), price numeric(12,2) not null check(price>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.sales (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 item_id uuid not null references public.items(id), item_name text not null,
 quantity integer not null check(quantity>0), unit_cost numeric(12,2) not null,
 unit_price numeric(12,2) not null, created_at timestamptz not null default now()
);
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 purpose text not null check(length(trim(purpose))>0), amount numeric(12,2) not null check(amount>0),
 created_at timestamptz not null default now()
);
alter table public.items enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
create policy "own items" on public.items for all to authenticated using (owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "own sales read" on public.sales for select to authenticated using (owner_id=auth.uid());
create policy "own expenses" on public.expenses for all to authenticated using (owner_id=auth.uid()) with check(owner_id=auth.uid());
-- Atomic stock decrement + immutable sales snapshot. Clients cannot directly insert sales.
create or replace function public.record_sale(p_item_id uuid,p_quantity integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_item public.items%rowtype;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_quantity is null or p_quantity<=0 then raise exception 'Invalid quantity'; end if;
 select * into v_item from public.items where id=p_item_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Item not found'; end if;
 if v_item.quantity<p_quantity then raise exception 'Insufficient stock'; end if;
 update public.items set quantity=quantity-p_quantity where id=p_item_id;
 insert into public.sales(owner_id,item_id,item_name,quantity,unit_cost,unit_price)
 values(auth.uid(),p_item_id,v_item.name,p_quantity,v_item.cost,v_item.price);
end $$;
revoke all on function public.record_sale(uuid,integer) from public;
grant execute on function public.record_sale(uuid,integer) to authenticated;
-- Everything below can be run again safely, and is the upgrade for a database that already has the tables above.
-- Discounts: list_price is the item's listed price at the moment of sale (empty on older sales).
alter table public.sales add column if not exists list_price numeric(12,2);
-- Records a sale at the price actually charged. Same safeguards as record_sale above.
create or replace function public.record_sale(p_item_id uuid,p_quantity integer,p_unit_price numeric)
returns void language plpgsql security definer set search_path=public as $$
declare v_item public.items%rowtype;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_quantity is null or p_quantity<=0 then raise exception 'Invalid quantity'; end if;
 if p_unit_price is null or p_unit_price<0 then raise exception 'Invalid price'; end if;
 select * into v_item from public.items where id=p_item_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Item not found'; end if;
 if v_item.quantity<p_quantity then raise exception 'Insufficient stock'; end if;
 update public.items set quantity=quantity-p_quantity where id=p_item_id;
 insert into public.sales(owner_id,item_id,item_name,quantity,unit_cost,unit_price,list_price)
 values(auth.uid(),p_item_id,v_item.name,p_quantity,v_item.cost,p_unit_price,v_item.price);
end $$;
revoke all on function public.record_sale(uuid,integer,numeric) from public;
grant execute on function public.record_sale(uuid,integer,numeric) to authenticated;
-- Removed items: hidden from the shop, kept for their past sales.
alter table public.items add column if not exists archived boolean not null default false;
-- Item groups (Admin tab).
create table if not exists public.shop_categories (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name))>0), created_at timestamptz not null default now(),
 unique(owner_id,name)
);
alter table public.shop_categories enable row level security;
drop policy if exists "own categories" on public.shop_categories;
create policy "own categories" on public.shop_categories for all to authenticated using (owner_id=auth.uid()) with check(owner_id=auth.uid());
grant select,insert,update,delete on public.shop_categories to authenticated;
-- Starts each existing account with the usual groups plus any it already uses.
insert into public.shop_categories(owner_id,name)
 select u.id,c.name from auth.users u cross join unnest(array['Dresses','Jackets','Shoes','Shorts','Tops','Anklets','Bandanas','Socks']) as c(name)
 on conflict (owner_id,name) do nothing;
insert into public.shop_categories(owner_id,name)
 select distinct owner_id,category from public.items where archived=false
 on conflict (owner_id,name) do nothing;
-- Renames a group and moves its items to the new name.
drop function if exists public.rename_shop_category(text,text);
create function public.rename_shop_category(p_old text,p_new text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_new is null or length(trim(p_new))=0 then raise exception 'Invalid name'; end if;
 update public.items set category=trim(p_new) where owner_id=auth.uid() and category=p_old;
 delete from public.shop_categories where owner_id=auth.uid() and name=p_old;
 insert into public.shop_categories(owner_id,name) values(auth.uid(),trim(p_new)) on conflict (owner_id,name) do nothing;
end $$;
revoke all on function public.rename_shop_category(text,text) from public;
grant execute on function public.rename_shop_category(text,text) to authenticated;
-- Removes a sale recorded by mistake and returns its units to stock, atomically. Clients cannot directly delete sales.
-- If the item had been removed from the shop, it comes back, so the returned units are not lost.
create or replace function public.delete_sale(p_sale_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_sale public.sales%rowtype;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into v_sale from public.sales where id=p_sale_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Sale not found'; end if;
 update public.items set quantity=quantity+v_sale.quantity,archived=false where id=v_sale.item_id and owner_id=auth.uid();
 delete from public.sales where id=p_sale_id;
end $$;
revoke all on function public.delete_sale(uuid) from public;
grant execute on function public.delete_sale(uuid) to authenticated;
