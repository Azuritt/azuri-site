-- Azuri delivery fees. Existing orders retain NULL delivery fields and their original totals.
alter table public.orders add column if not exists delivery_fee numeric(12,2)
  check (delivery_fee is null or delivery_fee between 0 and 10000);
alter table public.orders add column if not exists delivery_area text;

create or replace function public.delivery_options()
returns table (id text, label text, fee numeric)
language sql immutable
set search_path = ''
as $delivery$
  select v.id, v.label, v.fee from (values
    ('st-joseph', 'St. Joseph, Curepe, St. Augustine, Valsayn, Mt. Hope', 40::numeric, 0),
    ('tunapuna-arima', 'Tunapuna, Tacarigua, Trincity, Arouca, Piarco, Arima', 40::numeric, 1),
    ('san-juan', 'San Juan, Barataria, Morvant, Laventille', 40::numeric, 2),
    ('port-of-spain', 'Port of Spain, St. Ann''s, Woodbrook, St. James', 45::numeric, 3),
    ('north-west', 'Diego Martin, Maraval, Carenage, Chaguaramas', 50::numeric, 4),
    ('central', 'Chaguanas, Cunupia, Longdenville, Carapichaima', 45::numeric, 5),
    ('couva', 'Couva, Freeport, Claxton Bay, Point Lisas', 50::numeric, 6),
    ('san-fernando', 'San Fernando, Marabella, Gasparillo, La Romain', 55::numeric, 7),
    ('princes-town', 'Princes Town, Debe, Penal', 60::numeric, 8),
    ('south-west', 'Siparia, Fyzabad, Point Fortin, La Brea', 65::numeric, 9),
    ('north-east', 'Valencia, Sangre Grande, Cumuto', 55::numeric, 10),
    ('south-east', 'Manzanilla, Rio Claro, Mayaro', 65::numeric, 11),
    ('remote-coast', 'Toco, Matelot, Guayaguayare, Blanchisseuse', 75::numeric, 12),
    ('remote', 'Cedros, Icacos and other remote areas', 80::numeric, 13),
    ('tobago', 'Tobago — Islandwide', 80::numeric, 14)
  ) as v(id,label,fee,position) order by v.position;
$delivery$;
revoke all on function public.delivery_options() from public;
grant execute on function public.delivery_options() to anon, authenticated;

-- Calculate delivery from the customer's town/city. Client-selected rates are never trusted.
create or replace function public.delivery_locations()
returns table(town text, area_id text, label text, fee numeric, aliases text[])
language sql immutable set search_path = ''
as $locations$
 select v.town, v.area_id, d.label, d.fee, v.aliases
 from (values
  ('St. Joseph','st-joseph',array[]::text[]),
  ('Curepe','st-joseph',array[]::text[]),
  ('St. Augustine','st-joseph',array[]::text[]),
  ('Valsayn','st-joseph',array[]::text[]),
  ('Mt. Hope','st-joseph',array[]::text[]),
  ('Tunapuna','tunapuna-arima',array[]::text[]),
  ('Tacarigua','tunapuna-arima',array[]::text[]),
  ('Trincity','tunapuna-arima',array[]::text[]),
  ('Arouca','tunapuna-arima',array[]::text[]),
  ('Piarco','tunapuna-arima',array[]::text[]),
  ('Arima','tunapuna-arima',array[]::text[]),
  ('San Juan','san-juan',array[]::text[]),
  ('Barataria','san-juan',array[]::text[]),
  ('Morvant','san-juan',array[]::text[]),
  ('Laventille','san-juan',array[]::text[]),
  ('Port of Spain','port-of-spain',array[]::text[]),
  ('St. Ann''s','port-of-spain',array['St Anns','St Ann','St. Anne''s']::text[]),
  ('Woodbrook','port-of-spain',array[]::text[]),
  ('St. James','port-of-spain',array[]::text[]),
  ('Diego Martin','north-west',array[]::text[]),
  ('Maraval','north-west',array[]::text[]),
  ('Carenage','north-west',array[]::text[]),
  ('Chaguaramas','north-west',array[]::text[]),
  ('Chaguanas','central',array[]::text[]),
  ('Cunupia','central',array[]::text[]),
  ('Longdenville','central',array[]::text[]),
  ('Carapichaima','central',array[]::text[]),
  ('Couva','couva',array[]::text[]),
  ('Freeport','couva',array[]::text[]),
  ('Claxton Bay','couva',array[]::text[]),
  ('Point Lisas','couva',array[]::text[]),
  ('San Fernando','san-fernando',array[]::text[]),
  ('Marabella','san-fernando',array[]::text[]),
  ('Gasparillo','san-fernando',array[]::text[]),
  ('La Romain','san-fernando',array[]::text[]),
  ('Princes Town','princes-town',array[]::text[]),
  ('Debe','princes-town',array[]::text[]),
  ('Penal','princes-town',array[]::text[]),
  ('Siparia','south-west',array[]::text[]),
  ('Fyzabad','south-west',array[]::text[]),
  ('Point Fortin','south-west',array[]::text[]),
  ('La Brea','south-west',array[]::text[]),
  ('Valencia','north-east',array[]::text[]),
  ('Sangre Grande','north-east',array[]::text[]),
  ('Cumuto','north-east',array[]::text[]),
  ('Manzanilla','south-east',array[]::text[]),
  ('Rio Claro','south-east',array[]::text[]),
  ('Mayaro','south-east',array[]::text[]),
  ('Toco','remote-coast',array[]::text[]),
  ('Matelot','remote-coast',array[]::text[]),
  ('Guayaguayare','remote-coast',array[]::text[]),
  ('Blanchisseuse','remote-coast',array[]::text[]),
  ('Cedros','remote',array[]::text[]),
  ('Icacos','remote',array[]::text[]),
  ('Other remote areas','remote',array[]::text[]),
  ('Tobago','tobago',array[]::text[]),
  ('Scarborough','tobago',array[]::text[]),
  ('Crown Point','tobago',array[]::text[]),
  ('Roxborough','tobago',array[]::text[]),
  ('Plymouth','tobago',array[]::text[]),
  ('Charlotteville','tobago',array[]::text[])
 ) v(town,area_id,aliases)
 join public.delivery_options() d on d.id=v.area_id;
$locations$;
revoke all on function public.delivery_locations() from public;
grant execute on function public.delivery_locations() to anon, authenticated;

create or replace function public.normalize_delivery_town(value text)
returns text language sql immutable set search_path = ''
as $normalize$
 select trim(regexp_replace(regexp_replace(regexp_replace(
  lower(coalesce(value,'')), '[^a-z0-9]+',' ','g'),
  '\msaint\M','st','g'), '\mmount\M','mt','g'));
$normalize$;
revoke all on function public.normalize_delivery_town(text) from public;
grant execute on function public.normalize_delivery_town(text) to anon, authenticated;

create or replace function public.delivery_quote(city text)
returns jsonb language sql immutable set search_path = ''
as $quote$
 with matches as (
  select distinct l.area_id, l.label, l.fee
  from public.delivery_locations() l
  cross join lateral unnest(array[l.town]||l.aliases) a(name)
  where strpos(' '||public.normalize_delivery_town(city)||' ',
               ' '||public.normalize_delivery_town(a.name)||' ')>0
 )
 select case when count(*)=1 then
  jsonb_build_object('id',min(area_id),'label',min(label),'fee',min(fee))
 else null end from matches;
$quote$;
revoke all on function public.delivery_quote(text) from public;
grant execute on function public.delivery_quote(text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_order(request_id uuid, customer jsonb, bag jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  entry jsonb;
  prod public.products;
  qty integer;
  sz text;
  available integer;
  amount numeric := 0;
  order_items jsonb := '[]';
  existing uuid;
  selected_delivery jsonb;
begin
  if request_id is null then raise exception 'Invalid order reference'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(request_id::text, 0)
  );

  select id into existing
  from public.orders
  where id = request_id;

  if existing is not null then
    return jsonb_build_object('id', existing);
  end if;

  if jsonb_typeof(customer) is distinct from 'object'
     or jsonb_typeof(bag) is distinct from 'array' then
    raise exception 'Invalid order';
  end if;

  if jsonb_array_length(bag) < 1
     or jsonb_array_length(bag) > 12 then
    raise exception 'Invalid shopping bag';
  end if;

  if length(coalesce(customer ->> 'email', '')) > 254
     or (customer ->> 'email') is null
     or (customer ->> 'email') !~
       '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Please provide a valid email';
  end if;

  foreach sz in array array[
    'firstName', 'lastName', 'phone',
    'address', 'city', 'country'
  ] loop
    if length(trim(coalesce(customer ->> sz, ''))) < 1
       or length(customer ->> sz) > 500 then
      raise exception
        'Please complete your contact and delivery information';
    end if;
  end loop;

  if customer ->> 'country' <> 'Trinidad and Tobago' then
    raise exception 'Delivery is available in Trinidad and Tobago';
  end if;

  selected_delivery := public.delivery_quote(customer ->> 'city');
  if selected_delivery is null then
    raise exception 'Please enter a recognised delivery town or city. Choose a town suggestion, or contact Azuri for help.';
  end if;

  perform id from public.products
  order by id for update;

  for entry in
    select value from jsonb_array_elements(bag)
  loop
    sz := entry ->> 'size';

    if sz is null
       or (entry ->> 'qty') is null
       or (entry ->> 'qty') !~ '^[1-9][0-9]?$' then
      raise exception 'Invalid size or quantity';
    end if;

    qty := (entry ->> 'qty')::integer;

    if qty > 60 then
      raise exception 'Invalid quantity';
    end if;

    select * into prod
    from public.products
    where id = entry ->> 'id';

    if not found
       or not prod.active
       or not (sz = any(prod.sizes)) then
      raise exception 'Product unavailable';
    end if;

    available := coalesce((prod.stock ->> sz)::integer, 0);

    if available < qty then
      raise exception
        'Insufficient stock for % size %', prod.color, sz;
    end if;

    update public.products
    set stock = jsonb_set(
      stock,
      array[sz],
      to_jsonb(available - qty)
    )
    where id = prod.id;

    amount := amount + prod.price * qty;

    order_items := order_items || jsonb_build_array(
      jsonb_build_object(
        'id', prod.id,
        'product_name', prod.product_name,
        'color', prod.color,
        'size', sz,
        'qty', qty,
        'price', prod.price
      )
    );
  end loop;

  insert into public.orders (
    id, customer, items, total, delivery_fee, delivery_area
  )
  values (
    request_id, jsonb_set(customer - 'deliveryFee' - 'delivery_fee' - 'total' - 'deliveryArea', '{deliveryArea}', selected_delivery->'id'), order_items,
    amount + (selected_delivery ->> 'fee')::numeric, (selected_delivery ->> 'fee')::numeric, selected_delivery ->> 'label'
  );

  return jsonb_build_object('id', request_id, 'subtotal', amount,
    'delivery_fee', (selected_delivery ->> 'fee')::numeric, 'total', amount + (selected_delivery ->> 'fee')::numeric);
end;
$function$;

notify pgrst, 'reload schema';

revoke all on function public.place_order(uuid,jsonb,jsonb) from public;
grant execute on function public.place_order(uuid,jsonb,jsonb) to anon, authenticated;
