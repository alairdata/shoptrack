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
