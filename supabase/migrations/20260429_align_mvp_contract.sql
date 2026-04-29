-- Align existing Supabase projects with the MVP contract used by server.js.
-- Run this in Supabase SQL Editor before operating real campaigns.

create extension if not exists pgcrypto;

alter table if exists public.campaigns
  add column if not exists sent_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists delay_min_s integer,
  add column if not exists delay_max_s integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaigns'
      and column_name = 'delay_min_seconds'
  ) then
    update public.campaigns
    set
      delay_min_s = coalesce(delay_min_s, delay_min_seconds, 30),
      delay_max_s = coalesce(delay_max_s, delay_max_seconds, 90)
    where delay_min_s is null or delay_max_s is null;
  else
    update public.campaigns
    set
      delay_min_s = coalesce(delay_min_s, 30),
      delay_max_s = coalesce(delay_max_s, 90)
    where delay_min_s is null or delay_max_s is null;
  end if;
end $$;

alter table if exists public.campaigns
  alter column delay_min_s set default 30,
  alter column delay_max_s set default 90,
  alter column delay_min_s set not null,
  alter column delay_max_s set not null;

create table if not exists public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'pending',
  message_id uuid references public.messages(id) on delete set null,
  error text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

create index if not exists campaign_leads_campaign_idx on public.campaign_leads (campaign_id);
create index if not exists campaign_leads_status_idx on public.campaign_leads (campaign_id, status);
create index if not exists campaigns_status_idx on public.campaigns (status);
create index if not exists campaigns_niche_city_idx on public.campaigns (niche, city);
create index if not exists leads_normalized_phone_idx on public.leads (normalized_phone);
create index if not exists messages_phone_idx on public.messages (phone);
create index if not exists messages_campaign_idx on public.messages (campaign_id);
create index if not exists messages_created_idx on public.messages (created_at desc);

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
  check (source in ('manual', 'google_places', 'overpass', 'import', 'webhook', 'cnpj'));

alter table if exists public.campaign_leads disable row level security;
