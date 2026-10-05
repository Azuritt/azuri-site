-- Existing Azuri project migration. Preserves product IDs, inventory, and orders.
begin;
alter table public.products drop constraint if exists products_id_check;
alter table public.products add column if not exists product_name text not null default 'Élan I';
alter table public.products add column if not exists sizes text[] not null default array['S','M','L'];
alter table public.products add column if not exists active boolean not null default true;
create or replace function public.validate_stock() returns trigger language plpgsql set search_path='' as $$
declare sz text; v text;
begin
 if cardinality(new.sizes)<1 or cardinality(new.sizes)>20 or array_position(new.sizes,null) is not null then raise exception 'Provide 1 to 20 sizes'; end if;
 if (select count(distinct x) from unnest(new.sizes) x)<>cardinality(new.sizes) then raise exception 'Sizes must be distinct'; end if;
 foreach sz in array new.sizes loop
 if length(trim(sz))<1 or length(sz)>20 then raise exception 'Invalid size';end if;
 v:=new.stock->>sz;
 if v is null or v !~ '^[0-9]+$' or length(v)>5 or v::integer>10000 then raise exception 'Stock must be a whole number from 0 to 10000 for every size';end if;
 end loop;
 return new;
end $$;
drop trigger if exists validate_product_stock on public.products;
create trigger validate_product_stock before insert or update on public.products for each row execute function public.validate_stock();
drop policy if exists "Public product catalogue" on public.products;
create policy "Public product catalogue" on public.products for select to anon,authenticated using(active);
drop policy if exists "Admin full catalogue" on public.products;
create policy "Admin full catalogue" on public.products for select to authenticated using(public.is_azuri_admin());
create or replace function public.save_product_variant(variant jsonb) returns void language plpgsql security definer set search_path='' as $$
declare identifier text:=variant->>'id'; list text[];
begin
 if not public.is_azuri_admin() then raise exception 'Admin access required';end if;
 if identifier is null or identifier !~ '^[a-z0-9-]{1,80}$' then raise exception 'Use a unique lowercase variant ID';end if;
 if length(trim(coalesce(variant->>'product_name','')))<1 or length(variant->>'product_name')>80 or length(trim(coalesce(variant->>'color','')))<1 or length(variant->>'color')>80 then raise exception 'Provide a product name and colour';end if;
 if coalesce(variant->>'image','') !~ '^(assets/[a-zA-Z0-9_./ -]+|https://[^[:space:]]+)$' then raise exception 'Use an assets path or HTTPS image URL';end if;
 if coalesce((variant->>'create_new')::boolean,false) and exists(select 1 from public.products where id=identifier) then raise exception 'That variant ID already exists';end if;
 select array_agg(value) into list from jsonb_array_elements_text(variant->'sizes');
 if exists(select 1 from public.products where id=identifier and sizes<>list) then raise exception 'Existing variant sizes cannot be changed; create a new variant';end if;
 insert into public.products(id,product_name,color,image,price,sizes,stock,active) values(identifier,trim(variant->>'product_name'),trim(variant->>'color'),variant->>'image',(variant->>'price')::numeric,list,variant->'stock',coalesce((variant->>'active')::boolean,false))
 on conflict(id) do update set product_name=excluded.product_name,color=excluded.color,image=excluded.image,price=excluded.price,stock=excluded.stock,active=excluded.active;
end $$;
revoke all on function public.save_product_variant(jsonb) from public;
grant execute on function public.save_product_variant(jsonb) to authenticated;
create or replace function public.place_order(request_id uuid, customer jsonb, bag jsonb) returns jsonb
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
 if sz is null or (entry->>'qty') is null or (entry->>'qty') !~ '^[1-9][0-9]?$' then raise exception 'Invalid size or quantity'; end if;
 qty:=(entry->>'qty')::integer;
 if qty>60 then raise exception 'Invalid quantity'; end if;
 select * into prod from public.products where id=entry->>'id';
 if not found or not prod.active or not (sz=any(prod.sizes)) then raise exception 'Product unavailable'; end if;
 available:=coalesce((prod.stock->>sz)::integer,0);
 if available<qty then raise exception 'Insufficient stock for % size %',prod.color,sz; end if;
 update public.products set stock=jsonb_set(stock,array[sz],to_jsonb(available-qty)) where id=prod.id;
 amount:=amount+prod.price*qty;
 order_items:=order_items||jsonb_build_array(jsonb_build_object('id',prod.id,'product_name',prod.product_name,'color',prod.color,'size',sz,'qty',qty,'price',prod.price));
 end loop;
 insert into public.orders(id,customer,items,total) values(request_id,customer,order_items,amount);
 return jsonb_build_object('id',request_id);
end $$;

commit;
