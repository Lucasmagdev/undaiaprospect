-- Undaia Prospect - Supabase schema for the functional MVP.
-- Execute this file in Supabase SQL Editor for a fresh project.

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  evolution_instance_name text not null unique,
  evolution_instance_id text,
  display_name text,
  phone text,
  status text not null default 'created',
  integration text not null default 'WHATSAPP-BAILEYS',
  sent_today integer not null default 0,
  daily_limit integer not null default 100,
  last_seen_at timestamptz,
  last_connected_at timestamptz,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null default 'other',
  niche text,
  step_day integer,
  body text not null,
  variables jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text not null,
  city text not null,
  template_id uuid references public.message_templates(id) on delete set null,
  status text not null default 'draft',
  quantity_requested integer not null default 0,
  daily_limit integer not null default 50,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  delay_min_s integer not null default 30,
  delay_max_s integer not null default 90,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  normalized_phone text unique,
  niche text,
  city text,
  address text,
  website text,
  source text not null default 'manual'
    check (source in ('manual', 'google_places', 'overpass', 'import', 'webhook', 'cnpj')),
  status text not null default 'new',
  last_interaction_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  direction text not null default 'outbound',
  kind text not null default 'text',
  phone text,
  body text,
  status text not null default 'pending',
  provider_message_id text,
  error_message text,
  raw_payload jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

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

create index if not exists whatsapp_instances_status_idx on public.whatsapp_instances (status);
create index if not exists leads_niche_idx on public.leads (niche);
create index if not exists leads_city_idx on public.leads (city);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_normalized_phone_idx on public.leads (normalized_phone);
create index if not exists campaigns_status_idx on public.campaigns (status);
create index if not exists campaigns_niche_city_idx on public.campaigns (niche, city);
create index if not exists campaign_leads_campaign_idx on public.campaign_leads (campaign_id);
create index if not exists campaign_leads_status_idx on public.campaign_leads (campaign_id, status);
create index if not exists messages_lead_idx on public.messages (lead_id);
create index if not exists messages_phone_idx on public.messages (phone);
create index if not exists messages_campaign_idx on public.messages (campaign_id);
create index if not exists messages_created_idx on public.messages (created_at desc);

alter table public.whatsapp_instances disable row level security;
alter table public.leads disable row level security;
alter table public.message_templates disable row level security;
alter table public.campaigns disable row level security;
alter table public.campaign_leads disable row level security;
alter table public.messages disable row level security;
