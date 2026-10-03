-- Run once in a new Supabase project's SQL editor.
begin;
create table public.products (
 id text primary key check(id in ('ivory','navy','black')),
 color text not null, image text not null,
 price numeric(10,2) not null check(price > 0),
 stock jsonb not null check(jsonb_typeof(stock)='object')
);
create table public.orders (
 id uuid primary key,
 customer jsonb not null,
 items jsonb not null,
 total numeric(12,2) not null,
 status text not null default 'Pending' check(status in ('Pending','Paid','Cancelled')),
 created_at timestamptz not null default now()
);
alter table public.products enable row level security;
alter table public.orders enable row level security;
create function public.is_azuri_admin() returns boolean language sql stable set search_path='' as $$
 select coalesce((auth.jwt()->'app_metadata'->>'azuri_admin')='true',false)
$$;
create policy "Public product catalogue" on public.products for select to anon,authenticated using(true);
create policy "Admin product updates" on public.products for update to authenticated using(public.is_azuri_admin()) with check(public.is_azuri_admin());
create policy "Admin orders" on public.orders for select to authenticated using(public.is_azuri_admin());
revoke all on public.products,public.orders from anon,authenticated;
grant select on public.products to anon,authenticated;
grant update(price,stock) on public.products to authenticated;
grant select on public.orders to authenticated;
insert into public.products values
 ('ivory','Ivory','assets/elan-ivory.png',500,'{"S":0,"M":0,"L":0,"XL":0}'),
 ('navy','Navy','assets/elan-navy.png',500,'{"S":0,"M":0,"L":0,"XL":0}'),
 ('black','Black','assets/elan-black-correct.png',500,'{"S":0,"M":0,"L":0,"XL":0}');
create function public.place_order(request_id uuid, customer jsonb, bag jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry jsonb; prod public.products; qty integer; sz text; available integer; amount numeric:=0; order_items jsonb:='[]'; existing uuid;
begin
 -- Serialize retries for the same request; no customer information is returned.
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select id into existing from public.orders where id=request_id;
 if existing is not null then return jsonb_build_object('id',existing); end if;
 if jsonb_typeof(customer) is distinct from 'object' or jsonb_typeof(bag) is distinct from 'array' then raise exception 'Invalid order'; end if;
 if jsonb_array_length(bag)<1 or jsonb_array_length(bag)>12 then raise exception 'Invalid shopping bag'; end if;
 if length(coalesce(customer->>'email',''))>254 or (customer->>'email') is null or (customer->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Please provide a valid email'; end if;
 foreach sz in array array['firstName','lastName','phone','address','city','country'] loop
 if length(trim(coalesce(customer->>sz,'')))<1 or length(customer->>sz)>500 then raise exception 'Please complete your contact and delivery information'; end if;
 end loop;
 if customer->>'country'<>'Trinidad and Tobago' then raise exception 'Delivery is available in Trinidad and Tobago'; end if;
 -- Lock colours consistently; concurrent orders cannot oversell stock.
 perform id from public.products order by id for update;
 for entry in select value from jsonb_array_elements(bag) loop
 sz:=entry->>'size';
 if sz is null or sz not in ('S','M','L','XL') or (entry->>'qty') is null or (entry->>'qty') !~ '^[1-9][0-9]?$' then raise exception 'Invalid size or quantity'; end if;
 qty:=(entry->>'qty')::integer;
 if qty>60 then raise exception 'Invalid quantity'; end if;
 select * into prod from public.products where id=entry->>'id';
 if not found then raise exception 'Product unavailable'; end if;
 available:=coalesce((prod.stock->>sz)::integer,0);
 if available<qty then raise exception 'Insufficient stock for % size %',prod.color,sz; end if;
 update public.products set stock=jsonb_set(stock,array[sz],to_jsonb(available-qty)) where id=prod.id;
 amount:=amount+prod.price*qty;
 order_items:=order_items||jsonb_build_array(jsonb_build_object('id',prod.id,'color',prod.color,'size',sz,'qty',qty,'price',prod.price));
 end loop;
 insert into public.orders(id,customer,items,total) values(request_id,customer,order_items,amount);
 return jsonb_build_object('id',request_id);
end $$;
revoke all on function public.place_order(uuid,jsonb,jsonb) from public;
grant execute on function public.place_order(uuid,jsonb,jsonb) to anon,authenticated;
create function public.set_order_status(order_id uuid,new_status text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; i jsonb; prod public.products; sz text; q integer; direction integer;
begin
 if not public.is_azuri_admin() then raise exception 'Admin access required'; end if;
 if new_status is null or new_status not in ('Pending','Paid','Cancelled') then raise exception 'Invalid status'; end if;
 select * into o from public.orders where id=order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status=new_status then return; end if;
 direction:=case when new_status='Cancelled' then 1 when o.status='Cancelled' then -1 else 0 end;
 if direction<>0 then
 perform id from public.products order by id for update;
 for i in select value from jsonb_array_elements(o.items) loop
 select * into prod from public.products where id=i->>'id';
 sz:=i->>'size';q:=(i->>'qty')::integer;
 if direction=-1 and coalesce((prod.stock->>sz)::integer,0)<q then raise exception 'Stock unavailable to reopen order';end if;
 update public.products set stock=jsonb_set(stock,array[sz],to_jsonb(coalesce((prod.stock->>sz)::integer,0)+direction*q)) where id=prod.id;
 end loop;
 end if;
 update public.orders set status=new_status where id=order_id;
end $$;
revoke all on function public.set_order_status(uuid,text) from public;
grant execute on function public.set_order_status(uuid,text) to authenticated;
-- Guard admin stock edits as well.
create function public.validate_stock() returns trigger language plpgsql set search_path='' as $$
declare sz text; v text;
begin
 foreach sz in array array['S','M','L','XL'] loop
 v:=new.stock->>sz;
 if v is null or v !~ '^[0-9]+$' or length(v)>5 or v::integer>10000 then raise exception 'Stock must contain a whole number from 0 to 10000 for every size';end if;
 end loop;
 return new;
end $$;
create trigger validate_product_stock before update on public.products for each row execute function public.validate_stock();
commit;
