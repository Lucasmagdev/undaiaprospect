-- Tabela de conversas do agente SDR
-- Rodar no Supabase: SQL Editor → New Query → Cole e execute

create table if not exists conversations (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null,
  lead_id         uuid references leads(id) on delete set null,
  lead_name       text,
  niche           text,
  city            text,

  -- Array de mensagens: [{role: 'user'|'assistant', content: '...', ts: '...'}]
  messages        jsonb not null default '[]'::jsonb,

  -- Scoring
  score           integer not null default 0,
  score_reason    text,
  status          text not null default 'active',
  -- status valores: active | hot | cold | opt_out | finished

  -- Controle
  agent_active    boolean not null default true,
  exchanges       integer not null default 0,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índices para buscas frequentes
create index if not exists conversations_phone_idx  on conversations(phone);
create index if not exists conversations_status_idx on conversations(status);
create index if not exists conversations_score_idx  on conversations(score desc);

-- Atualiza updated_at automaticamente
create or replace function update_conversations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_updated_at on conversations;
create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_conversations_updated_at();
