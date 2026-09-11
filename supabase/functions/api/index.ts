import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const origem = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const cors = {
  'access-control-allow-origin': origem,
  'access-control-allow-headers': 'content-type,x-idempotency-key',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
  })
}

function cliente(payload: Record<string, unknown>) {
  return { id: payload.id, nome: payload.nome, telefone: payload.telefone, documento: payload.documento, criado_em: payload.criadoEm, atualizado_em: payload.atualizadoEm }
}

function ordem(payload: Record<string, unknown>) {
  return {
    id: payload.id, numero: payload.numero, cliente_id: payload.clienteId,
    aparelho: payload.aparelho, marca: payload.marca, modelo: payload.modelo,
    imei_ou_serie: payload.imeiOuSerie, defeito_relatado: payload.defeitoRelatado,
    acessorios: payload.acessorios, orcamento: payload.orcamento, status: payload.status,
    criada_em: payload.criadaEm, atualizada_em: payload.atualizadaEm,
    entregue_em: payload.entregueEm, codigo_publico: payload.codigoPublico,
    assinatura_png: payload.assinaturaPng, sincronizada_em: new Date().toISOString(),
  }
}

function evento(payload: Record<string, unknown>) {
  return { id: payload.id, os_id: payload.osId, status: payload.status, observacao: payload.observacao, publico: payload.publico, criado_em: payload.criadoEm, atualizado_em: payload.atualizadoEm }
}

async function jaProcessada(id: string) {
  const { data } = await supabase.from('sync_receipts').select('id').eq('id', id).maybeSingle()
  return Boolean(data)
}

async function upsertMaisRecente(tabela: string, registro: Record<string, unknown>) {
  const { data: atual } = await supabase.from(tabela).select('atualizado_em').eq('id', registro.id).maybeSingle()
  if (atual && Date.parse(atual.atualizado_em) > Date.parse(String(registro.atualizado_em))) return
  const { error } = await supabase.from(tabela).upsert(registro)
  if (error) throw error
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname.includes('/public/os/')) {
    const codigo = decodeURIComponent(url.pathname.split('/public/os/')[1] ?? '')
    const { data: os, error } = await supabase.from('ordens_servico')
      .select('id,codigo_publico,numero,aparelho,marca,modelo,status,atualizada_em')
      .eq('codigo_publico', codigo).maybeSingle()
    if (error) return resposta({ erro: 'Falha na consulta.' }, 500)
    if (!os) return resposta({ erro: 'OS não encontrada.' }, 404)
    const { data: eventos } = await supabase.from('os_eventos')
      .select('id,status,observacao,criado_em').eq('os_id', os.id).eq('publico', true).order('criado_em')
    return resposta({
      codigoPublico: os.codigo_publico, numero: os.numero, aparelho: os.aparelho,
      marca: os.marca, modelo: os.modelo, status: os.status, atualizadaEm: os.atualizada_em,
      eventos: (eventos ?? []).map((item) => ({ id: item.id, status: item.status, observacao: item.observacao, criadoEm: item.criado_em })),
    })
  }

  if (request.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405)
  const idempotencia = request.headers.get('x-idempotency-key')
  if (!idempotencia) return resposta({ erro: 'Chave de idempotência ausente.' }, 400)
  if (await jaProcessada(idempotencia)) return resposta({ repetida: true })

  try {
    if (url.pathname.endsWith('/sync/foto')) {
      const form = await request.formData()
      const metadata = JSON.parse(String(form.get('metadata'))) as Record<string, string>
      const arquivo = form.get('arquivo') as File
      const caminho = `${metadata.osId}/${metadata.id}.jpg`
      const { error: uploadError } = await supabase.storage.from('os-fotos').upload(caminho, arquivo, { upsert: true, contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      await upsertMaisRecente('os_fotos', {
        id: metadata.id, os_id: metadata.osId, momento: metadata.momento,
        caminho_storage: caminho, nome_arquivo: metadata.nomeArquivo,
        criado_em: metadata.atualizadoEm, atualizado_em: metadata.atualizadoEm,
      })
    } else {
      const operacao = await request.json() as { entidade: string; acao: string; payload: Record<string, unknown> }
      if (operacao.acao !== 'upsert') return resposta({ erro: 'Ação não suportada no MVP.' }, 400)
      if (operacao.entidade === 'cliente') await upsertMaisRecente('clientes', cliente(operacao.payload))
      else if (operacao.entidade === 'os') await upsertMaisRecente('ordens_servico', ordem(operacao.payload))
      else if (operacao.entidade === 'evento') await upsertMaisRecente('os_eventos', evento(operacao.payload))
      else return resposta({ erro: 'Entidade desconhecida.' }, 400)
    }
    await supabase.from('sync_receipts').insert({ id: idempotencia })
    return resposta({ ok: true })
  } catch (erro) {
    console.error(erro)
    return resposta({ erro: 'Não foi possível sincronizar.' }, 500)
  }
})
