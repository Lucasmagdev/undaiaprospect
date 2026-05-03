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

create index if not exists automation_cycle_runs_agent_idx on public.automation_cycle_runs (agent_id, finished_at desc);

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

create index if not exists hot_handoffs_status_idx on public.hot_handoffs (status, created_at desc);

create or replace function public.update_hot_handoffs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hot_handoffs_updated_at on public.hot_handoffs;
create trigger hot_handoffs_updated_at
before update on public.hot_handoffs
for each row execute function public.update_hot_handoffs_updated_at();

alter table public.automation_cycle_runs disable row level security;
alter table public.hot_handoffs disable row level security;