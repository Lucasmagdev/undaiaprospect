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

create index if not exists message_sequences_niche_idx on public.message_sequences (niche, is_active);
create index if not exists message_sequence_steps_seq_idx on public.message_sequence_steps (sequence_id, step_order);

create or replace function public.update_message_sequences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists message_sequences_updated_at on public.message_sequences;
create trigger message_sequences_updated_at
before update on public.message_sequences
for each row execute function public.update_message_sequences_updated_at();

alter table public.message_sequences disable row level security;
alter table public.message_sequence_steps disable row level security;