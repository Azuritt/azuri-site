create schema if not exists azuri_private;
revoke all on schema azuri_private from public, anon, authenticated;
create extension if not exists pg_cron;

create table public.azuri_push_devices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<4096),
 subscription jsonb not null,
 label text not null default 'Device',
 updated_at timestamptz not null default now(),
 last_test_at timestamptz
);
alter table public.azuri_push_devices enable row level security;
revoke all on public.azuri_push_devices from public,anon,authenticated;
grant all on public.azuri_push_devices to service_role;
create index azuri_push_devices_user on public.azuri_push_devices(user_id);

create table public.azuri_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 device_id uuid not null references public.azuri_push_devices(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 locked_until timestamptz,
 http_status integer,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 unique(order_id,device_id)
);
alter table public.azuri_push_deliveries enable row level security;
revoke all on public.azuri_push_deliveries from public,anon,authenticated;
grant all on public.azuri_push_deliveries to service_role;
create index azuri_push_pending on public.azuri_push_deliveries(next_attempt_at) where status in ('pending','sending');

-- Secrets are encrypted in Vault and returned only to the service role.
create function public.azuri_push_config() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets
 where name in ('azuri_push_public_key','azuri_push_private_key','azuri_push_worker_secret');
$$;
revoke all on function public.azuri_push_config() from public,anon,authenticated;
grant execute on function public.azuri_push_config() to service_role;

create function azuri_private.wake_push_worker() returns void language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 if not exists(select 1 from public.azuri_push_deliveries where
   (status='pending' and next_attempt_at<=now()) or (status='sending' and locked_until<now())) then return; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='azuri_push_worker_secret';
 perform net.http_post(url:='https://txxmviiyposodzbzsken.supabase.co/functions/v1/order-push',
   headers:=jsonb_build_object('Content-Type','application/json','x-azuri-push-secret',secret),
   body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=10000);
exception when others then
 raise warning 'Order push dispatch deferred to retry';
end $$;
revoke all on function azuri_private.wake_push_worker() from public,anon,authenticated;

create function azuri_private.queue_order_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.azuri_push_deliveries(order_id,device_id)
 select new.id,d.id from public.azuri_push_devices d join auth.users u on u.id=d.user_id
 where u.raw_app_meta_data->>'azuri_admin'='true'
 on conflict do nothing;
 perform azuri_private.wake_push_worker();
 return new;
end $$;
revoke all on function azuri_private.queue_order_push() from public,anon,authenticated;
create trigger azuri_order_push after insert on public.orders for each row execute function azuri_private.queue_order_push();

create function public.azuri_claim_push() returns jsonb language plpgsql security definer set search_path='' as $$
declare claimed jsonb;
begin
 -- Removed administrators must never receive subsequent customer alerts.
 delete from public.azuri_push_devices d where not exists(
  select 1 from auth.users u where u.id=d.user_id and u.raw_app_meta_data->>'azuri_admin'='true');
 update public.azuri_push_deliveries set status='failed' where status in ('pending','sending')
 and (attempts>=6 or created_at<now()-interval '24 hours');
 with picked as (
  select id from public.azuri_push_deliveries
  where attempts<6 and ((status='pending' and next_attempt_at<=now()) or (status='sending' and locked_until<now()))
  order by created_at for update skip locked limit 20
 ), claimed_rows as (
  update public.azuri_push_deliveries q set status='sending',attempts=attempts+1,locked_until=now()+interval '2 minutes'
  from picked where q.id=picked.id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'attempts',q.attempts,'device_id',d.id,
  'subscription',d.subscription,'order_id',o.id,'total',o.total,'order_status',o.status,
  'item_count',(select coalesce(sum((i->>'qty')::int),0) from jsonb_array_elements(o.items) i))), '[]'::jsonb)
 into claimed from claimed_rows q join public.azuri_push_devices d on d.id=q.device_id join public.orders o on o.id=q.order_id;
 return claimed;
end $$;
revoke all on function public.azuri_claim_push() from public,anon,authenticated;
grant execute on function public.azuri_claim_push() to service_role;

select cron.schedule('azuri-order-push-retry','* * * * *',$$select azuri_private.wake_push_worker();$$);
