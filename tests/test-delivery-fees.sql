begin;
alter table public.orders disable trigger user;
update public.products set stock=jsonb_set(stock,'{S}','100'::jsonb) where id='black';
set local role anon;
do $test$
declare l record; result jsonb; request uuid;
 customer jsonb:='{"firstName":"Delivery","lastName":"Test","phone":"8680000000","email":"automatic-delivery-test@example.invalid","address":"Integration test — rollback","country":"Trinidad and Tobago","deliveryFee":0,"deliveryArea":"st-joseph"}';
 bag jsonb:='[{"id":"black","size":"S","qty":1,"price":1}]';
begin
 for l in select * from public.delivery_locations() loop
  request:=gen_random_uuid();
  result:=public.place_order(request,customer||jsonb_build_object('city',l.town),bag);
  if (result->>'delivery_fee')::numeric<>l.fee or (result->>'total')::numeric<>500+l.fee then raise exception 'Incorrect delivery for %',l.town; end if;
  perform public.place_order(request,customer||jsonb_build_object('city',l.town),bag);
 end loop;
 if (public.delivery_quote('Saint Joseph')->>'fee')::numeric<>40 or
    (public.delivery_quote('Mount Hope')->>'fee')::numeric<>40 or
    (public.delivery_quote('St Anns')->>'fee')::numeric<>45 or
    (public.delivery_quote('Scarborough, Tobago')->>'fee')::numeric<>80 then raise exception 'Alias matching failed'; end if;
 if public.delivery_quote('San Juan and Mayaro') is not null or public.delivery_quote('ArimaStreet') is not null then raise exception 'Ambiguous or partial town matched'; end if;
 begin
  perform public.place_order(gen_random_uuid(),customer||'{"city":"Unknown"}',bag);
  raise exception 'Unknown city accepted';
 exception when others then if sqlerrm not like 'Please enter a recognised delivery town%' then raise; end if; end;
end $test$;
reset role;
do $verify$
begin
 if (select count(*) from public.orders where customer->>'email'='automatic-delivery-test@example.invalid')<>61 then raise exception 'Unexpected order count'; end if;
 if (select (stock->>'S')::int from public.products where id='black')<>39 then raise exception 'Duplicate request reserved stock twice'; end if;
 if exists(select 1 from public.orders o where customer->>'email'='automatic-delivery-test@example.invalid' and (total<>500+delivery_fee or delivery_area is null or customer?'deliveryFee' or (public.delivery_quote(customer->>'city')->>'id')<>customer->>'deliveryArea')) then raise exception 'Canonical fee persistence failed'; end if;
end $verify$;
rollback;
select 'PASS: 61 towns and aliases, city-based fees, forged area/fee ignored, unknown/ambiguous town checks and idempotency; all test changes rolled back' result;