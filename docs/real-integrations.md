# Integracoes Reais

O backend concentra as chaves sensiveis e expoe uma camada local para o frontend. As abas de campanhas, leads, templates, inbox e instancias ja consultam rotas reais quando a API esta rodando.

## Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute o arquivo `supabase/schema.sql`.
   - Em projetos ja existentes, execute tambem `supabase/migrations/20260429_align_mvp_contract.sql`.
4. Copie `Project URL` e `service_role key`.
5. Configure no `.env` local ou no ambiente da VPS:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

Nunca use a `service_role key` no frontend. Toda leitura/escrita real deve passar pelo backend.

## Health Check

Com o backend rodando:

```bash
npm run api
```

Teste:

```bash
curl http://127.0.0.1:3001/api/db/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "supabaseUrl": "https://seu-projeto.supabase.co",
  "table": "whatsapp_instances"
}
```

## Rotas Reais Ativas

```text
GET  /api/db/health
GET  /api/campaigns
POST /api/campaigns
GET  /api/leads
POST /api/leads
GET  /api/templates
POST /api/templates
GET  /api/inbox/conversations
POST /api/inbox/conversations/:phone/send
POST /api/webhooks/evolution
GET  /api/whatsapp/messages
```

## Evolution API

A Evolution continua acessada apenas pelo backend proxy. O frontend chama rotas locais como:

```text
/api/whatsapp/instances
/api/whatsapp/instances/:instanceName/connect
/api/whatsapp/instances/:instanceName/state
/api/whatsapp/instances/:instanceName/send-text
```

Para receber respostas automaticamente, configure o webhook da Evolution apontando para:

```text
https://api.seudominio.com/api/webhooks/evolution
```

No desenvolvimento local, use um tunel HTTPS quando precisar testar webhooks externos.

## Ainda Mockado Ou Parcial

- Banco por nicho e sequencias de automacao ainda ficam em memoria no frontend.
- Google Places ainda nao esta integrado; o MVP usa Overpass/OSM para descoberta real de leads.
- A fila real com delay 30-60s, limite diario e retomada de campanha ainda precisa de worker.
- Autenticacao de usuarios/SaaS ainda nao foi adicionada.
