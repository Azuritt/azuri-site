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
  selected_delivery record;
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

  select * into selected_delivery from public.delivery_options()
  where id = customer ->> 'deliveryArea';
  if not found then
    raise exception 'Please select a delivery area at checkout. Refresh checkout if this option is missing.';
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
    request_id, customer - 'deliveryFee' - 'delivery_fee' - 'total', order_items,
    amount + selected_delivery.fee, selected_delivery.fee, selected_delivery.label
  );

  return jsonb_build_object('id', request_id, 'subtotal', amount,
    'delivery_fee', selected_delivery.fee, 'total', amount + selected_delivery.fee);
end;
$function$;

revoke all on function public.place_order(uuid,jsonb,jsonb) from public;
grant execute on function public.place_order(uuid,jsonb,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
