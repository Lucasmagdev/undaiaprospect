-- Execute este arquivo no Supabase SQL Editor antes de rodar o import-cnpj.mjs
-- Pode re-executar sem risco (todos os comandos são idempotentes)
-- Dashboard → SQL Editor → New query → cole e execute

CREATE TABLE IF NOT EXISTS cnpj_empresas (
  cnpj              TEXT PRIMARY KEY,        -- 14 dígitos (sem pontuação)
  nome_fantasia     TEXT,                    -- nome comercial (pode ser vazio)
  cnae_principal    TEXT NOT NULL,           -- 7 dígitos, sem pontuação
  municipio_codigo  TEXT,                    -- código IBGE
  municipio_nome    TEXT NOT NULL,           -- nome em maiúsculas (ex: BELO HORIZONTE)
  uf                TEXT,                    -- sigla do estado
  ddd1              TEXT,
  telefone1         TEXT,
  ddd2              TEXT,
  telefone2         TEXT,
  email             TEXT,
  importado_em      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice principal: busca por nicho + cidade
CREATE INDEX IF NOT EXISTS idx_cnpj_cnae_municipio
  ON cnpj_empresas (cnae_principal, municipio_nome);

-- Índice secundário: busca só por cidade
CREATE INDEX IF NOT EXISTS idx_cnpj_municipio
  ON cnpj_empresas (municipio_nome);

-- Índice para filtrar registros com telefone
CREATE INDEX IF NOT EXISTS idx_cnpj_telefone
  ON cnpj_empresas (telefone1)
  WHERE telefone1 IS NOT NULL AND telefone1 <> '';

-- Tabela de controle de importação
-- Rastreia quais arquivos/meses já foram processados para evitar re-download
CREATE TABLE IF NOT EXISTS cnpj_importacoes (
  id              SERIAL PRIMARY KEY,
  mes             TEXT NOT NULL,        -- ex: '2025-04'
  arquivo         INTEGER NOT NULL,     -- 0–9
  status          TEXT NOT NULL,        -- 'ok' | 'erro' | 'em_andamento'
  linhas_total    INTEGER DEFAULT 0,
  linhas_importadas INTEGER DEFAULT 0,
  iniciado_em     TIMESTAMPTZ DEFAULT NOW(),
  concluido_em    TIMESTAMPTZ,
  UNIQUE (mes, arquivo)
);
