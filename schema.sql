-- ============================================================
-- Undaia Prospect — Schema completo
-- Execute no Supabase: SQL Editor → New query → Run
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────
-- whatsapp_instances
-- ─────────────────────────────────────────
create table if not exists whatsapp_instances (
  id                      uuid primary key default gen_random_uuid(),
  evolution_instance_name text not null unique,
  evolution_instance_id   text,
  display_name            text,
  phone                   text,
  status                  text not null default 'created',
  integration             text not null default 'WHATSAPP-BAILEYS',
  sent_today              integer not null default 0,
  daily_limit             integer not null default 100,
  last_seen_at            timestamptz,
  last_connected_at       timestamptz,
  settings                jsonb not null default '{}',
  created_at              timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- leads
-- ─────────────────────────────────────────
create table if not exists leads (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text,
  normalized_phone    text unique,
  niche               text,
  city                text,
  address             text,
  website             text,
  source              text not null default 'manual',  -- manual | overpass | cnpj
  status              text not null default 'new',     -- new | sent | responded | closed
  last_interaction_at timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists leads_niche_idx  on leads (niche);
create index if not exists leads_city_idx   on leads (city);
create index if not exists leads_status_idx on leads (status);

-- ─────────────────────────────────────────
-- message_templates
-- ─────────────────────────────────────────
create table if not exists message_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  purpose    text not null default 'other',  -- initial | follow_up | manual_reply | other
  niche      text,
  step_day   integer,                         -- 0 | 2 | 5 | 10
  body       text not null,
  variables  jsonb not null default '[]',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- campaigns
-- ─────────────────────────────────────────
create table if not exists campaigns (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  niche               text not null,
  city                text not null,
  template_id         uuid references message_templates (id) on delete set null,
  status              text not null default 'draft',  -- draft | running | paused | finished | error
  quantity_requested  integer not null default 0,
  daily_limit         integer not null default 50,
  sent_count          integer not null default 0,
  failed_count        integer not null default 0,
  delay_min_s         integer not null default 30,
  delay_max_s         integer not null default 90,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- campaign_leads  (fila de envio por campanha)
-- ─────────────────────────────────────────
create table if not exists campaign_leads (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  lead_id     uuid not null references leads (id) on delete cascade,
  status      text not null default 'pending',  -- pending | sent | failed | skipped
  message_id  uuid,
  error       text,
  scheduled_at timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

create index if not exists campaign_leads_campaign_idx on campaign_leads (campaign_id);
create index if not exists campaign_leads_status_idx   on campaign_leads (campaign_id, status);

-- ─────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────
create table if not exists messages (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid references leads (id) on delete set null,
  whatsapp_instance_id uuid references whatsapp_instances (id) on delete set null,
  campaign_id         uuid references campaigns (id) on delete set null,
  direction           text not null default 'outbound',  -- outbound | inbound
  kind                text not null default 'text',
  phone               text,
  body                text,
  status              text not null default 'pending',   -- pending | sent | failed | received
  provider_message_id text,
  error_message       text,
  raw_payload         jsonb,
  sent_at             timestamptz,
  received_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists messages_lead_idx     on messages (lead_id);
create index if not exists messages_phone_idx    on messages (phone);
create index if not exists messages_campaign_idx on messages (campaign_id);
create index if not exists messages_created_idx  on messages (created_at desc);

-- ─────────────────────────────────────────
-- Reset sent_today à meia-noite (requer pg_cron no Supabase)
-- Habilite em: Dashboard → Database → Extensions → pg_cron
-- ─────────────────────────────────────────
-- select cron.schedule('reset-sent-today', '0 0 * * *',
--   $$update whatsapp_instances set sent_today = 0$$);

-- ─────────────────────────────────────────
-- RLS: desabilitado (service_role key usada no backend)
-- ─────────────────────────────────────────
alter table whatsapp_instances  disable row level security;
alter table leads               disable row level security;
alter table message_templates   disable row level security;
alter table campaigns           disable row level security;
alter table campaign_leads      disable row level security;
alter table messages            disable row level security;
