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

create table if not exists public.automation_agents (
  id text primary key,
  kind text not null default 'lead-automation',
  active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.message_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.message_sequences(id) on delete cascade,
  step_order integer not null,
  label text not null,
  condition text not null default 'Sem resposta',
  delay_hours integer not null default 48,
  template_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (sequence_id, step_order)
);

create table if not exists public.automation_cycle_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  cycle_id uuid,
  started_at timestamptz,
  finished_at timestamptz not null default now(),
  niche text,
  city text,
  discovered integer not null default 0,
  imported integer not null default 0,
  auto_approved integer not null default 0,
  skipped_existing integer not null default 0,
  blocked integer not null default 0,
  below_score integer not null default 0,
  dispatched integer not null default 0,
  dispatch_failed integer not null default 0,
  followed_up integer not null default 0,
  terms jsonb not null default '[]'::jsonb,
  imported_preview jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hot_handoffs (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  conversation_id uuid,
  lead_id uuid references public.leads(id) on delete set null,
  lead_name text,
  score integer not null default 0,
  reason text,
  source text not null default 'agent',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (phone, status)
);

create table if not exists public.message_quality_audits (
  id uuid primary key default gen_random_uuid(),
  agent_id text,
  stage text not null,
  reviewed boolean not null default false,
  changed boolean not null default false,
  source text not null default 'local',
  company text,
  niche text,
  city text,
  final_chars integer not null default 0,
  question_count integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
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
  cnpj text,
  email text,
  source text not null default 'manual'
    check (source in ('manual', 'google_places', 'overpass', 'foursquare', 'guiamais', 'apontador', 'import', 'webhook', 'cnpj')),
  status text not null default 'new',
  last_interaction_at timestamptz,
  raw_payload jsonb,
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
create index if not exists automation_agents_active_idx on public.automation_agents (active);
create index if not exists message_sequences_niche_idx on public.message_sequences (niche, is_active);
create index if not exists message_sequence_steps_seq_idx on public.message_sequence_steps (sequence_id, step_order);
create index if not exists automation_cycle_runs_agent_idx on public.automation_cycle_runs (agent_id, finished_at desc);
create index if not exists hot_handoffs_status_idx on public.hot_handoffs (status, created_at desc);
create index if not exists message_quality_audits_created_idx on public.message_quality_audits (created_at desc);
create index if not exists message_quality_audits_stage_idx on public.message_quality_audits (stage, created_at desc);
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
alter table public.automation_agents disable row level security;
alter table public.message_sequences disable row level security;
alter table public.message_sequence_steps disable row level security;
alter table public.automation_cycle_runs disable row level security;
alter table public.hot_handoffs disable row level security;
alter table public.message_quality_audits disable row level security;
alter table public.leads disable row level security;
alter table public.message_templates disable row level security;
alter table public.campaigns disable row level security;
alter table public.campaign_leads disable row level security;
alter table public.messages disable row level security;
