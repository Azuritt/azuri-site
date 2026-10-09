create table public.product_reviews (
 id uuid primary key default gen_random_uuid(),
 product_id text not null references public.products(id),
 display_name text not null check(char_length(btrim(display_name)) between 2 and 60),
 rating smallint not null check(rating between 1 and 5),
 title text not null check(char_length(btrim(title)) between 3 and 100),
 body text not null check(char_length(btrim(body)) between 10 and 2000),
 status text not null default 'pending' check(status in ('pending','published','hidden')),
 created_at timestamptz not null default now()
);
alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from anon, authenticated;
grant select on public.product_reviews to anon, authenticated;
grant insert(product_id,display_name,rating,title,body) on public.product_reviews to anon,authenticated;
grant update(status) on public.product_reviews to authenticated;
create policy reviews_public_read on public.product_reviews for select to anon,authenticated using(status='published');
create policy reviews_admin_read on public.product_reviews for select to authenticated using((select auth.jwt()->'app_metadata'->>'azuri_admin')='true');
create policy reviews_submit on public.product_reviews for insert to anon,authenticated with check(status='pending' and exists(select 1 from public.products p where p.id=product_id and p.active=true));
create policy reviews_admin_moderate on public.product_reviews for update to authenticated using((select auth.jwt()->'app_metadata'->>'azuri_admin')='true') with check((select auth.jwt()->'app_metadata'->>'azuri_admin')='true');
create index product_reviews_public_idx on public.product_reviews(product_id,created_at desc) where status='published';
create index product_reviews_moderation_idx on public.product_reviews(status,created_at desc);
create function public.product_review_summary(variant_id text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('count',count(*),'average',coalesce(round(avg(r.rating),1),0),'five',count(*) filter(where r.rating=5),'four',count(*) filter(where r.rating=4),'three',count(*) filter(where r.rating=3),'two',count(*) filter(where r.rating=2),'one',count(*) filter(where r.rating=1))
 from public.product_reviews r join public.products p on p.id=r.product_id
 where r.status='published' and p.product_name=(select product_name from public.products where id=variant_id);
$$;
revoke all on function public.product_review_summary(text) from public;
grant execute on function public.product_review_summary(text) to anon,authenticated;
