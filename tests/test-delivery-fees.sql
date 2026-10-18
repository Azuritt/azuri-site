-- Tests are fully rolled back, including stock, order rows and queued webhooks.
begin;
alter table public.orders disable trigger user;
update public.products set stock=jsonb_set(stock,'{S}','100'::jsonb) where id='black';
set local role anon;
do $test$
declare
 option record;
 result jsonb;
 request uuid;
 customer jsonb := '{"firstName":"Delivery","lastName":"Test","phone":"8680000000","email":"delivery-test@example.invalid","address":"Integration test — rollback","city":"Test","country":"Trinidad and Tobago","deliveryFee":0,"delivery_fee":0,"total":1}'::jsonb;
 bag jsonb := '[{"id":"black","size":"S","qty":1,"price":1}]';
begin
 for option in select * from public.delivery_options() loop
  request:=gen_random_uuid();
  result:=public.place_order(request,customer||jsonb_build_object('deliveryArea',option.id),bag);
  if (result->>'delivery_fee')::numeric<>option.fee or (result->>'total')::numeric<>500+option.fee or (result->>'subtotal')::numeric<>500 then raise exception 'Incorrect total for %',option.id; end if;
  if (public.place_order(request,customer||jsonb_build_object('deliveryArea',option.id),bag)->>'id')::uuid<>request then raise exception 'Idempotency failed'; end if;
 end loop;
 begin
  perform public.place_order(gen_random_uuid(),customer,bag);
  raise exception 'Missing area was accepted';
 exception when others then
  if sqlerrm not like 'Please select a delivery area%' then raise; end if;
 end;
 begin
  perform public.place_order(gen_random_uuid(),customer||'{"deliveryArea":"fake-free-shipping"}',bag);
  raise exception 'Invalid area was accepted';
 exception when others then
  if sqlerrm not like 'Please select a delivery area%' then raise; end if;
 end;
 begin
  perform public.place_order(gen_random_uuid(),customer||'{"deliveryArea":"tobago","country":"USA"}',bag);
  raise exception 'Invalid country was accepted';
 exception when others then
  if sqlerrm<>'Delivery is available in Trinidad and Tobago' then raise; end if;
 end;
 begin
  perform public.place_order(gen_random_uuid(),customer||'{"deliveryArea":"tobago"}','[{"id":"black","size":"M","qty":1}]');
  raise exception 'Unavailable stock was accepted';
 exception when others then
  if sqlerrm not like 'Insufficient stock%' then raise; end if;
 end;
end $test$;
reset role;
do $verify$
begin
 if (select count(*) from public.orders where customer->>'email'='delivery-test@example.invalid')<>15 then raise exception 'Unexpected order count'; end if;
 if (select (stock->>'S')::int from public.products where id='black')<>85 then raise exception 'Duplicate request reserved stock twice'; end if;
 if exists(select 1 from public.orders o where customer->>'email'='delivery-test@example.invalid' and (total<>500+delivery_fee or delivery_area is null or customer?'deliveryFee' or customer?'delivery_fee' or customer?'total')) then raise exception 'Fee persistence or input sanitizing failed'; end if;
end $verify$;
rollback;
select 'PASS: all 15 delivery fees, canonical saved fees, tamper resistance, idempotency, missing/invalid areas, country and stock checks; all test changes rolled back' as result;

