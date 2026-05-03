-- Seed inicial de templates de follow-up e sequencias por nicho.
-- Seguro para rodar mais de uma vez (usa checagens por nome/niche/purpose).

alter table if exists public.message_templates
  add column if not exists niche text,
  add column if not exists step_day integer,
  add column if not exists variables jsonb not null default '[]'::jsonb,
  add column if not exists is_active boolean not null default true;

with tpl as (
  insert into public.message_templates (name, purpose, niche, step_day, body, variables, is_active)
  values
    ('Odontologia Follow-up D+2', 'follow_up', 'Odontologia', 2,
      'Oi {nome_empresa}! Passando para saber se faz sentido retomar a conversa sobre melhorar o atendimento da clínica em {cidade}. Posso te mostrar em 2 minutos?',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),
    ('Odontologia Follow-up D+5', 'follow_up', 'Odontologia', 5,
      'Só para não deixar passar: clínicas odontológicas da região têm ganho previsibilidade com processos simples no WhatsApp. Quer que eu te mostre um exemplo para {nome_empresa}?',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),
    ('Odontologia Follow-up D+10', 'follow_up', 'Odontologia', 10,
      'Fechando por aqui para não incomodar. Se quiser voltar nesse assunto para {nome_empresa}, me chama que te mostro o caminho mais rápido.',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),

    ('Advocacia Follow-up D+2', 'follow_up', 'Advocacia', 2,
      'Oi {nome_empresa}! Tudo certo? Posso te mostrar uma forma objetiva de melhorar o fluxo comercial do escritório em {cidade} sem aumentar equipe?',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),
    ('Advocacia Follow-up D+5', 'follow_up', 'Advocacia', 5,
      'Passando para confirmar se vale retomar: muitos escritórios perdem oportunidade por falta de cadência simples de contato. Quer ver um modelo para {nome_empresa}?',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),
    ('Advocacia Follow-up D+10', 'follow_up', 'Advocacia', 10,
      'Sem problemas, encerro por aqui. Se fizer sentido depois, retomamos e eu te mostro uma aplicação prática para {nome_empresa}.',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),

    ('Restaurante Follow-up D+2', 'follow_up', 'Restaurante', 2,
      'Oi {nome_empresa}! Posso te mostrar uma ideia rápida para aumentar recorrência de clientes no WhatsApp em {cidade}?',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),
    ('Restaurante Follow-up D+5', 'follow_up', 'Restaurante', 5,
      'Passando para retomar: restaurantes da região têm melhorado ocupação com automações simples de reativação. Quer um exemplo para {nome_empresa}?',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),
    ('Restaurante Follow-up D+10', 'follow_up', 'Restaurante', 10,
      'Vou encerrar por aqui para não atrapalhar. Quando quiser, te mostro um plano direto para {nome_empresa}.',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),

    ('Template Follow-up Geral D+2', 'follow_up', 'Geral', 2,
      'Oi {nome_empresa}! Passando para saber se faz sentido retomar nossa conversa sobre melhorias operacionais em {cidade}.',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),
    ('Template Follow-up Geral D+5', 'follow_up', 'Geral', 5,
      'Só para confirmar: quer que eu te mostre uma proposta objetiva para o cenário da {nome_empresa}?',
      '["nome_empresa","cidade","nicho"]'::jsonb, true),
    ('Template Follow-up Geral D+10', 'follow_up', 'Geral', 10,
      'Encerrando por aqui para não incomodar. Se quiser retomar depois, é só me chamar.',
      '["nome_empresa","cidade","nicho"]'::jsonb, true)
  on conflict do nothing
  returning id, name, niche
),
ensure_tpl as (
  select id, name, niche
  from public.message_templates
  where (purpose = 'follow_up' and niche in ('Odontologia','Advocacia','Restaurante','Geral'))
),
seed_sequences as (
  insert into public.message_sequences (name, niche, is_active)
  values
    ('Odontologia - Cadencia Padrao', 'Odontologia', true),
    ('Advocacia - Cadencia Padrao', 'Advocacia', true),
    ('Restaurante - Cadencia Padrao', 'Restaurante', true),
    ('Geral - Cadencia Padrao', 'Geral', true)
  on conflict do nothing
  returning id, name, niche
),
all_sequences as (
  select id, name, niche from public.message_sequences where name in (
    'Odontologia - Cadencia Padrao',
    'Advocacia - Cadencia Padrao',
    'Restaurante - Cadencia Padrao',
    'Geral - Cadencia Padrao'
  )
),
step_map as (
  select
    s.id as sequence_id,
    s.niche,
    t.id as template_id,
    case
      when t.name ilike '%D+2%' then 0
      when t.name ilike '%D+5%' then 1
      else 2
    end as step_order,
    case
      when t.name ilike '%D+2%' then 'D+2'
      when t.name ilike '%D+5%' then 'D+5'
      else 'D+10'
    end as label,
    case
      when t.name ilike '%D+2%' then 48
      when t.name ilike '%D+5%' then 120
      else 240
    end as delay_hours
  from all_sequences s
  join ensure_tpl t
    on (t.niche = s.niche)
     or (s.niche = 'Geral' and t.niche = 'Geral')
)
insert into public.message_sequence_steps (sequence_id, step_order, label, condition, delay_hours, template_id, is_active)
select
  sequence_id,
  step_order,
  label,
  'Sem resposta' as condition,
  delay_hours,
  template_id::text,
  true
from step_map
on conflict (sequence_id, step_order) do update
set template_id = excluded.template_id,
    label = excluded.label,
    condition = excluded.condition,
    delay_hours = excluded.delay_hours,
    is_active = excluded.is_active;