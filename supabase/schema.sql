create extension if not exists pgcrypto;

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  evolution_instance_name text not null unique,
  evolution_instance_id text,
  display_name text,
  phone text,
  status text not null default 'created'
    check (status in ('created', 'connecting', 'open', 'close', 'paused', 'error')),
  integration text not null default 'WHATSAPP-BAILEYS',
  daily_limit integer not null default 80 check (daily_limit >= 0),
  sent_today integer not null default 0 check (sent_today >= 0),
  delay_min_seconds integer not null default 30 check (delay_min_seconds >= 0),
  delay_max_seconds integer not null default 60 check (delay_max_seconds >= delay_min_seconds),
  last_connected_at timestamptz,
  last_seen_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null default 'initial'
    check (purpose in ('initial', 'follow_up', 'manual_reply', 'proposal', 'other')),
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text not null,
  city text not null,
  quantity_requested integer not null default 0 check (quantity_requested >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'running', 'paused', 'finished', 'error')),
  template_id uuid references public.message_templates(id) on delete set null,
  daily_limit integer not null default 120 check (daily_limit >= 0),
  delay_min_seconds integer not null default 30 check (delay_min_seconds >= 0),
  delay_max_seconds integer not null default 60 check (delay_max_seconds >= delay_min_seconds),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  phone text,
  normalized_phone text,
  niche text,
  city text,
  address text,
  website text,
  google_place_id text,
  source text not null default 'manual'
    check (source in ('manual', 'google_places', 'import', 'webhook')),
  status text not null default 'new'
    check (status in ('new', 'queued', 'sent', 'responded', 'qualified', 'closed', 'invalid', 'opt_out')),
  last_interaction_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  kind text not null default 'text' check (kind in ('text', 'image', 'audio', 'document', 'system')),
  phone text,
  body text,
  provider_message_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'read', 'received', 'failed')),
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  level text not null default 'info' check (level in ('debug', 'info', 'warning', 'error')),
  event text not null,
  message text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  name text not null,
  rule_type text not null
    check (rule_type in ('send_window', 'daily_limit', 'delay', 'follow_up', 'stop_on_reply', 'dedupe')),
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_instances_status on public.whatsapp_instances(status);
create index if not exists idx_campaigns_status on public.campaigns(status);
create index if not exists idx_campaigns_niche_city on public.campaigns(niche, city);
create index if not exists idx_leads_campaign_id on public.leads(campaign_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_normalized_phone on public.leads(normalized_phone);
create unique index if not exists idx_leads_google_place_id_unique
  on public.leads(google_place_id)
  where google_place_id is not null;
create index if not exists idx_messages_lead_id_created_at on public.messages(lead_id, created_at desc);
create index if not exists idx_messages_provider_message_id on public.messages(provider_message_id);
create index if not exists idx_campaign_logs_campaign_created_at on public.campaign_logs(campaign_id, created_at desc);
create index if not exists idx_automation_rules_campaign_type on public.automation_rules(campaign_id, rule_type);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_whatsapp_instances_updated_at on public.whatsapp_instances;
create trigger trg_whatsapp_instances_updated_at
before update on public.whatsapp_instances
for each row execute function public.set_updated_at();

drop trigger if exists trg_message_templates_updated_at on public.message_templates;
create trigger trg_message_templates_updated_at
before update on public.message_templates
for each row execute function public.set_updated_at();

drop trigger if exists trg_campaigns_updated_at on public.campaigns;
create trigger trg_campaigns_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

drop trigger if exists trg_automation_rules_updated_at on public.automation_rules;
create trigger trg_automation_rules_updated_at
before update on public.automation_rules
for each row execute function public.set_updated_at();
