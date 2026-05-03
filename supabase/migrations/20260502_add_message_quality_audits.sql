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

create index if not exists message_quality_audits_created_idx on public.message_quality_audits (created_at desc);
create index if not exists message_quality_audits_stage_idx on public.message_quality_audits (stage, created_at desc);

alter table public.message_quality_audits disable row level security;