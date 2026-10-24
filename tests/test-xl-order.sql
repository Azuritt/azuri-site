begin;
alter table public.orders disable trigger user;
update public.products set stock=jsonb_set(stock,'{XL}','1'::jsonb) where id='ivory';
set local role anon;
do $test$
declare result jsonb;
 customer jsonb:='{"firstName":"XL","lastName":"Test","email":"xl-test@example.invalid","phone":"8680000000","address":"Test — rollback","city":"St Joseph","country":"Trinidad and Tobago"}';
 bag jsonb:='[{"id":"ivory","size":"XL","qty":1}]';
begin
 result:=public.place_order(gen_random_uuid(),customer,bag);
 if (result->>'total')::numeric<>540 then raise exception 'Incorrect XL order total'; end if;
 begin
  perform public.place_order(gen_random_uuid(),customer,bag);
  raise exception 'XL oversold';
 exception when others then if sqlerrm not like 'Insufficient stock%' then raise; end if; end;
end $test$;
reset role;
do $verify$
begin
 if (select items->0->>'size' from public.orders where customer->>'email'='xl-test@example.invalid')<>'XL' then raise exception 'XL missing from saved order'; end if;
 if (select stock->>'XL' from public.products where id='ivory')<>'0' then raise exception 'XL inventory not reserved'; end if;
end $verify$;
rollback;
select 'PASS: XL order accepted with stock, correct delivery total and XL order details saved; overselling prevented; test rolled back' result;