# Integrações Reais

Este projeto ainda usa dados mockados em boa parte do frontend, mas a base para integrações reais fica no backend.

## Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute o arquivo `supabase/schema.sql`.
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

Se o schema ainda não tiver sido aplicado, o endpoint deve retornar erro informando que a tabela não existe.

## Evolution API

A Evolution continua acessada apenas pelo backend proxy. O frontend chama rotas locais como:

```text
/api/whatsapp/instances
/api/whatsapp/instances/:instanceName/connect
/api/whatsapp/instances/:instanceName/state
```

## Próximos Passos

- Persistir instâncias da Evolution em `whatsapp_instances`.
- Registrar mensagens enviadas/recebidas em `messages`.
- Trocar a aba Leads para consultar `leads`.
- Trocar campanhas mockadas por `campaigns`.
- Criar webhook da Evolution para gravar respostas recebidas.
