-- Add XL to the three Élan I colours. Preserve existing inventory; new XL stock starts at zero.
update public.products
set sizes = case when 'XL'=any(sizes) then sizes else array_append(sizes,'XL') end,
    stock = case when stock ? 'XL' then stock else stock || '{"XL":0}'::jsonb end
where id in ('ivory','navy','black');
