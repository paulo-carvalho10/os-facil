/**
 * Servidor em memória que imita as regras de sincronizar_operacao, para testar o
 * motor de sincronização sem Supabase.
 *
 * Não substitui supabase/testar-integracao.sql, que roda no banco de verdade.
 * Reproduz só o que o cliente observa:
 *  - checks de tamanho do cliente, com o código 23514 do PostgreSQL;
 *  - chave estrangeira ausente, com o código 23503;
 *  - upsert de OS que só aplica quando atualizada_em é mais recente, e responde
 *    ok mesmo quando descarta (o where da migração);
 *  - eventos e assinaturas imutáveis: um id repetido não reescreve nada;
 *  - falha de rede, que chega do supabase-js com código vazio.
 */

type Linha = Record<string, unknown> & { id: string }
type NomeTabela = 'clientes' | 'ordens_servico' | 'os_eventos' | 'os_assinaturas' | 'os_fotos'

const ERRO_DE_REDE = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }

export const servidor = {
  tabelas: {
    clientes: new Map<string, Linha>(),
    ordens_servico: new Map<string, Linha>(),
    os_eventos: new Map<string, Linha>(),
    os_assinaturas: new Map<string, Linha>(),
    os_fotos: new Map<string, Linha>(),
  } as Record<NomeTabela, Map<string, Linha>>,
  sequencia: 1000,
  /** Quantas das próximas chamadas a sincronizar_operacao falham por rede. */
  falhasDeRede: 0,
  telefoneMinimo: 8,
  recebidas: [] as string[],

  reiniciar() {
    Object.values(this.tabelas).forEach((tabela) => tabela.clear())
    this.sequencia = 1000
    this.falhasDeRede = 0
    this.telefoneMinimo = 8
    this.recebidas = []
  },

  cliente: {
    async rpc(nome: string, argumentos: { operacao?: { entidade: string; entidadeId: string; payload: Record<string, any> } }) {
      if (nome === 'acesso_oficina') return { data: true, error: null }
      if (servidor.falhasDeRede > 0) {
        servidor.falhasDeRede -= 1
        return { data: null, error: ERRO_DE_REDE }
      }
      const { entidade, entidadeId, payload: p } = argumentos.operacao!
      const erro = servidor.aplicar(entidade, p)
      if (erro) return { data: null, error: erro }
      servidor.recebidas.push(`${entidade}:${entidadeId}`)
      return { data: { ok: true }, error: null }
    },
    from(tabela: NomeTabela) {
      const linhas = () => [...servidor.tabelas[tabela].values()]
      return {
        select: () => ({
          order: () => ({
            range: async (inicio: number, fim: number) => ({ data: linhas().slice(inicio, fim + 1), error: null }),
          }),
        }),
      }
    },
    storage: { from: () => ({}) },
  },

  aplicar(entidade: string, p: Record<string, any>) {
    const { clientes, ordens_servico: ordens, os_eventos: eventos, os_assinaturas: assinaturas } = this.tabelas
    const alterado = (p.atualizadoEm ?? p.atualizadaEm) as string

    if (entidade === 'cliente') {
      if (String(p.telefone).length < this.telefoneMinimo) {
        return { message: 'new row violates check constraint "cliente_telefone_limite"', code: '23514' }
      }
      const atual = clientes.get(p.id)
      if (!atual || (atual.atualizado_em as string) < alterado) {
        clientes.set(p.id, { id: p.id, nome: p.nome, telefone: p.telefone, documento: p.documento ?? null, criado_em: p.criadoEm, atualizado_em: alterado })
      }
      return null
    }

    if (entidade === 'os') {
      if (!clientes.has(p.clienteId)) return { message: 'violates foreign key constraint "ordens_servico_cliente_id_fkey"', code: '23503' }
      const atual = ordens.get(p.id)
      if (atual && (atual.atualizada_em as string) >= alterado) return null
      ordens.set(p.id, {
        id: p.id, numero: atual?.numero ?? ++this.sequencia, cliente_id: p.clienteId,
        aparelho: p.aparelho, marca: p.marca, modelo: p.modelo, imei_ou_serie: p.imeiOuSerie ?? null,
        defeito_relatado: p.defeitoRelatado, acessorios: p.acessorios ?? null, orcamento: p.orcamento ?? null,
        status: p.status, criada_em: p.criadaEm, atualizada_em: alterado, entregue_em: p.entregueEm ?? null,
        codigo_publico: p.codigoPublico, sincronizada_em: null,
      })
      return null
    }

    if (entidade === 'evento') {
      if (!ordens.has(p.osId)) return { message: 'violates foreign key constraint "os_eventos_os_id_fkey"', code: '23503' }
      if (!eventos.has(p.id)) {
        eventos.set(p.id, { id: p.id, os_id: p.osId, status: p.status, observacao: p.observacao ?? null, publico: p.publico, criado_em: p.criadoEm, atualizado_em: alterado })
      }
      return null
    }

    if (entidade === 'assinatura') {
      if (!ordens.has(p.osId)) return { message: 'violates foreign key constraint "os_assinaturas_os_id_fkey"', code: '23503' }
      if (!String(p.png).startsWith('data:image/png;base64,')) {
        return { message: 'new row violates check constraint "assinatura_png_valida"', code: '23514' }
      }
      if (!assinaturas.has(p.id)) {
        assinaturas.set(p.id, { id: p.id, os_id: p.osId, png: p.png, criado_em: p.criadoEm, atualizado_em: alterado })
      }
      return null
    }

    return { message: 'Ação inválida', code: '22023' }
  },
}
