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

create index if not exists automation_agents_active_idx on public.automation_agents (active);

create or replace function public.update_automation_agents_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists automation_agents_updated_at on public.automation_agents;
create trigger automation_agents_updated_at
before update on public.automation_agents
for each row execute function public.update_automation_agents_updated_at();

alter table public.automation_agents disable row level security;