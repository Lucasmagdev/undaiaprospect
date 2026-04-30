alter table public.leads add column if not exists cnpj text;
alter table public.leads add column if not exists email text;
alter table public.leads add column if not exists raw_payload jsonb;

create index if not exists leads_cnpj_idx on public.leads (cnpj) where cnpj is not null;
create index if not exists leads_email_idx on public.leads (email) where email is not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'leads'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.leads drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.leads
  add constraint leads_source_check
  check (source in (
    'manual',
    'google_places',
    'overpass',
    'foursquare',
    'guiamais',
    'apontador',
    'import',
    'webhook',
    'cnpj'
  ));
