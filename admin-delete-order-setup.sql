create function azuri_private.delete_order(order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
 if auth.uid() is null or not public.is_azuri_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select status into current_status from public.orders where id=order_id for update;
 if not found then return; end if;
 if current_status='Paid' then raise exception 'Cancel a paid order before deleting it.'; end if;
 if current_status<>'Cancelled' then perform public.set_order_status(order_id,'Cancelled'); end if;
 delete from public.orders where id=order_id;
end $$;
revoke all on function azuri_private.delete_order(uuid) from public,anon,authenticated;
grant usage on schema azuri_private to authenticated;
grant execute on function azuri_private.delete_order(uuid) to authenticated;
create function public.delete_order(order_id uuid) returns void language sql security invoker set search_path='' as $$
 select azuri_private.delete_order(order_id);
$$;
revoke all on function public.delete_order(uuid) from public,anon;
grant execute on function public.delete_order(uuid) to authenticated;