#!/usr/bin/env node
/**
 * import-cnpj.mjs
 *
 * Importa empresas ativas da base pública da Receita Federal para o Supabase.
 * Fonte: https://dados.rfb.gov.br/CNPJ/dados_abertos_cnpj/
 *
 * Pré-requisito: executar scripts/cnpj-schema.sql no Supabase SQL Editor.
 *
 * Uso:
 *   node scripts/import-cnpj.mjs                       # todos os 10 arquivos do mês atual
 *   node scripts/import-cnpj.mjs --file 0              # só o arquivo 0 (teste rápido ~10% do Brasil)
 *   node scripts/import-cnpj.mjs --month 2025-03       # mês específico
 *   node scripts/import-cnpj.mjs --file 0 --month 2025-03
 */

import { request as httpsRequest, get as httpsGet } from 'node:https'
import { request as httpRequest } from 'node:http'
import zlib from 'node:zlib'
import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'
import { existsSync, readFileSync } from 'node:fs'

// ── Env ───────────────────────────────────────────────────────────────────

function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const [k, ...v] = t.split('=')
      if (!process.env[k]) process.env[k] = v.join('=')
    }
  }
}
loadEnv()

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env')
  process.exit(1)
}

const FORCE = process.argv.includes('--force')

// ── CNAEs alvo (formato Receita Federal: 7 dígitos sem pontuação) ─────────

const TARGET_CNAES = new Set([
  // Restaurante
  '5611201', '5611203', '5611204', '5611205', '5612100',
  // Odontologia
  '8630504',
  // Academia / Fitness
  '9313100',
  // Advocacia
  '6911701',
  // Contabilidade
  '6920601', '6920602',
  // Estética / Beleza
  '9602501', '9602502', '9602503',
  // Imobiliária
  '6810201', '6810202', '6821801', '6821802', '6822600',
])

// ── Argumentos CLI ────────────────────────────────────────────────────────

function getArg(flag, def = null) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}

const monthArg = getArg('--month')
const fileArg  = getArg('--file')
const FILES    = fileArg !== null ? [Number(fileArg)] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

// ── HTTP helper com redirect ──────────────────────────────────────────────

function fetchStream(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects === 0) { reject(new Error('Muitos redirecionamentos')); return }
    const lib = url.startsWith('https') ? httpsGet : httpRequest
    lib(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(fetchStream(res.headers.location, redirects - 1))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} — ${url}`))
        return
      }
      resolve(res)
    }).on('error', reject)
  })
}

// ── Streaming ZIP extractor (sem dependências externas) ───────────────────
// Lê o cabeçalho local do ZIP (30 bytes + nome + extra) e extrai o primeiro
// arquivo, descomprimindo deflate via zlib nativo.

function extractFirstFileFromZip(inStream) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0)
    let extracted = false

    const onData = chunk => {
      if (extracted) return
      buf = Buffer.concat([buf, chunk])
      if (buf.length < 30) return

      // Assinatura ZIP local file header: PK\x03\x04
      if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
        inStream.removeListener('data', onData)
        reject(new Error('Não é um arquivo ZIP válido'))
        return
      }

      const nameLen  = buf.readUInt16LE(26)
      const extraLen = buf.readUInt16LE(28)
      const dataStart = 30 + nameLen + extraLen
      if (buf.length < dataStart) return

      extracted = true
      inStream.removeListener('data', onData)

      const compression = buf.readUInt16LE(8) // 0=store, 8=deflate
      const out = compression === 8 ? zlib.createInflateRaw() : new PassThrough()

      const leftover = buf.slice(dataStart)
      if (leftover.length > 0) out.write(leftover)
      inStream.pipe(out)
      inStream.on('error', e => out.destroy(e))
      resolve(out)
    }

    inStream.on('data', onData)
    inStream.on('error', reject)
    inStream.on('end', () => {
      if (!extracted) reject(new Error('ZIP vazio ou menor que o esperado'))
    })
  })
}

// ── Parser CSV Latin-1 ────────────────────────────────────────────────────
// A Receita Federal usa encoding Latin-1 e separador ponto-e-vírgula.

function parseCSV(line) {
  const fields = []
  let cur = ''
  let inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ';' && !inQ) { fields.push(cur); cur = ''; continue }
    cur += ch
  }
  fields.push(cur)
  return fields
}

// ── Supabase helpers ──────────────────────────────────────────────────────

const BATCH = 500

async function supabasePost(table, records, prefer = 'return=minimal,resolution=merge-duplicates') {
  const body = JSON.stringify(records)
  const url  = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      { hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
          apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: prefer } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })) },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function supabasePatch(table, query, data) {
  const body = JSON.stringify(data)
  const url  = new URL(`${SUPABASE_URL}/rest/v1/${table}?${query}`)
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      { hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
          apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'return=minimal' } },
      res => { res.resume(); res.on('end', () => resolve(res.statusCode)) },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function supabaseGet(table, query) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}?${query}`)
  return new Promise((resolve, reject) => {
    httpsRequest(
      { hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve([]) } }) },
    ).on('error', reject).end()
  })
}

// ── Controle de importação ────────────────────────────────────────────────

async function checkJaImportado(mes, arquivo) {
  if (FORCE) return false
  const rows = await supabaseGet('cnpj_importacoes', `mes=eq.${mes}&arquivo=eq.${arquivo}&status=eq.ok&select=id`)
  return Array.isArray(rows) && rows.length > 0
}

async function marcarInicio(mes, arquivo) {
  await supabasePost('cnpj_importacoes',
    [{ mes, arquivo, status: 'em_andamento', iniciado_em: new Date().toISOString() }],
    'return=minimal,resolution=merge-duplicates',
  )
}

async function marcarFim(mes, arquivo, total, importadas) {
  await supabasePatch('cnpj_importacoes', `mes=eq.${mes}&arquivo=eq.${arquivo}`,
    { status: 'ok', linhas_total: total, linhas_importadas: importadas, concluido_em: new Date().toISOString() },
  )
}

async function marcarErro(mes, arquivo, total, importadas) {
  await supabasePatch('cnpj_importacoes', `mes=eq.${mes}&arquivo=eq.${arquivo}`,
    { status: 'erro', linhas_total: total, linhas_importadas: importadas, concluido_em: new Date().toISOString() },
  )
}

// ── Passo 1: carregar mapa de municípios ──────────────────────────────────
// Arquivo Municipios.zip: colunas [codigo, descricao]

async function loadMunicipios(baseUrl) {
  process.stdout.write('Carregando municípios... ')
  const res    = await fetchStream(`${baseUrl}/Municipios.zip`)
  const stream = await extractFirstFileFromZip(res)
  stream.setEncoding('latin1')

  const rl  = createInterface({ input: stream, crlfDelay: Infinity })
  const map = new Map()

  for await (const line of rl) {
    const [codigo, descricao] = parseCSV(line)
    if (codigo && descricao) map.set(codigo.trim(), descricao.trim().toUpperCase())
  }

  console.log(`${map.size} municípios.`)
  return map
}

// ── Passo 2: processar arquivo de estabelecimentos ────────────────────────
// Colunas relevantes do CSV Estabelecimentos (índice base 0):
//  0  cnpj_basico          8 dígitos
//  1  cnpj_ordem           4 dígitos
//  2  cnpj_dv              2 dígitos
//  4  nome_fantasia
//  5  situacao_cadastral   '2' = ativa
// 11  cnae_fiscal_principal
// 19  uf
// 20  municipio            código IBGE
// 21  ddd1
// 22  telefone1
// 23  ddd2
// 24  telefone2
// 27  email

async function processFile(baseUrl, mes, fileIdx, municipios) {
  const url = `${baseUrl}/Estabelecimentos${fileIdx}.zip`
  console.log(`\n[${fileIdx}] ${url}`)

  // Verifica se já foi importado com sucesso
  if (await checkJaImportado(mes, fileIdx)) {
    console.log('  Já importado anteriormente. Use --force para re-importar.')
    return 0
  }

  let res
  try {
    res = await fetchStream(url)
  } catch (err) {
    console.error(`  Erro ao baixar: ${err.message}`)
    return 0
  }

  await marcarInicio(mes, fileIdx)

  const stream = await extractFirstFileFromZip(res)
  stream.setEncoding('latin1')
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  let batch    = []
  let total    = 0
  let matched  = 0
  let imported = 0

  async function flush() {
    if (!batch.length) return
    // merge-duplicates: atualiza registros já existentes (importante para updates mensais)
    const r = await supabasePost('cnpj_empresas', batch)
    if (r.status >= 200 && r.status < 300) imported += batch.length
    else console.warn(`\n  Aviso: Supabase retornou ${r.status}`)
    batch = []
  }

  try {
    for await (const line of rl) {
      total++
      if (total % 200_000 === 0) {
        process.stdout.write(`\r  Linhas: ${(total / 1e6).toFixed(1)}M  Importadas: ${imported}   `)
      }

      const f = parseCSV(line)
      if (f.length < 28) continue
      if (f[5] !== '2') continue               // só ativas
      if (!TARGET_CNAES.has(f[11])) continue   // só CNAEs alvo
      if (!f[22] || f[22].length < 4) continue // deve ter telefone

      matched++
      batch.push({
        cnpj:             (f[0] + f[1] + f[2]).trim(),
        nome_fantasia:    f[4].trim() || null,
        cnae_principal:   f[11].trim(),
        municipio_codigo: f[20].trim(),
        municipio_nome:   municipios.get(f[20].trim()) || f[20].trim(),
        uf:               f[19].trim() || null,
        ddd1:             f[21].trim() || null,
        telefone1:        f[22].trim(),
        ddd2:             f[23].trim() || null,
        telefone2:        f[24].trim() || null,
        email:            f[27].trim() || null,
      })

      if (batch.length >= BATCH) await flush()
    }
    await flush()
    await marcarFim(mes, fileIdx, total, imported)
  } catch (err) {
    await flush()
    await marcarErro(mes, fileIdx, total, imported)
    console.error(`\n  Erro durante processamento: ${err.message}`)
  }

  process.stdout.write('\n')
  console.log(`  Total: ${total.toLocaleString('pt-BR')} | Alvo: ${matched.toLocaleString('pt-BR')} | Importadas: ${imported.toLocaleString('pt-BR')}`)
  return imported
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const now   = new Date()
  const month = monthArg || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const base  = `https://dados.rfb.gov.br/CNPJ/dados_abertos_cnpj/${month}`

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Importação CNPJ — Receita Federal')
  console.log(`  Mês: ${month}`)
  console.log(`  Arquivos: ${FILES.join(', ')}  (0–9 = 100% do Brasil)`)
  console.log(`  CNAEs alvo: ${TARGET_CNAES.size} códigos`)
  if (FORCE) console.log('  Modo: --force (re-importa mesmo já feitos)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const municipios = await loadMunicipios(base)

  let totalImported = 0
  for (const idx of FILES) {
    totalImported += await processFile(base, month, idx, municipios)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Concluído: ${totalImported.toLocaleString('pt-BR')} empresas importadas.`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().catch(err => { console.error('\nErro fatal:', err.message); process.exit(1) })
