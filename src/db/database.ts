import Dexie, { type EntityTable, type Transaction } from 'dexie'
import type {
  AssinaturaOS,
  Cliente,
  Configuracao,
  EventoOS,
  FotoOS,
  NovaOSInput,
  OperacaoSync,
  OrdemServico,
  StatusOS,
} from './types'
import { gerarCodigoPublico } from '../domain/public-code'
import { DadosInvalidos, validarAssinatura, validarNovaOS, validarObservacao } from '../domain/validacao'

export class OSFacilDatabase extends Dexie {
  clientes!: EntityTable<Cliente, 'id'>
  ordens!: EntityTable<OrdemServico, 'id'>
  eventos!: EntityTable<EventoOS, 'id'>
  assinaturas!: EntityTable<AssinaturaOS, 'id'>
  fotos!: EntityTable<FotoOS, 'id'>
  filaSync!: EntityTable<OperacaoSync, 'id'>
  configuracoes!: EntityTable<Configuracao, 'chave'>

  constructor(nome = 'os-facil') {
    super(nome)
    this.version(1).stores({
      clientes: 'id, nome, telefone, atualizadoEm',
      ordens: 'id, &numero, &codigoPublico, clienteId, status, criadaEm, atualizadaEm',
      eventos: 'id, osId, status, criadoEm, atualizadoEm',
      fotos: 'id, osId, momento, atualizadoEm, enviada',
      filaSync: 'id, entidade, entidadeId, estado, criadaEm, proximaTentativaEm',
      configuracoes: 'chave',
    })
    this.version(2).stores({ ordens: 'id, numero, &codigoPublico, clienteId, status, criadaEm, atualizadaEm' })
    this.version(3).stores({ assinaturas: 'id, osId, criadoEm' }).upgrade(migrarAssinaturasLegadas)
  }
}

type OrdemLegada = OrdemServico & { assinaturaPng?: string }

/**
 * Versão 3: a assinatura sai da OS e vira registro próprio.
 *
 * O cuidado é não perder nem duplicar assinatura na troca:
 * - Se nenhuma operação da fila carrega aquela assinatura, ela já está no
 *   servidor. O registro local recebe o id da própria OS, o mesmo id que a
 *   migração 004 usa ao copiar a coluna antiga, e nada é enfileirado.
 * - Se ainda há uma operação pendente com ela, o servidor não a tem. Ela ganha
 *   id novo e vai para a fila como assinatura, porque a RPC nova ignora o campo
 *   antigo dentro da OS.
 */
async function migrarAssinaturasLegadas(tx: Transaction): Promise<void> {
  const ordens = (await tx.table<OrdemLegada>('ordens').toArray()).filter((ordem) => ordem.assinaturaPng)
  if (!ordens.length) return

  const fila = await tx.table<OperacaoSync>('filaSync').where('entidade').equals('os').toArray()
  const instante = new Date().toISOString()

  for (const ordem of ordens) {
    const pendente = fila.some((operacao) => {
      const payload = operacao.payload as OrdemLegada
      return operacao.entidadeId === ordem.id && payload.assinaturaPng === ordem.assinaturaPng
    })
    const assinatura: AssinaturaOS = {
      id: pendente ? crypto.randomUUID() : ordem.id,
      osId: ordem.id,
      png: ordem.assinaturaPng!,
      criadoEm: ordem.atualizadaEm,
      atualizadoEm: ordem.atualizadaEm,
    }
    await tx.table('assinaturas').put(assinatura)
    if (pendente) {
      await tx.table('filaSync').add({
        id: crypto.randomUUID(), entidade: 'assinatura', entidadeId: assinatura.id, acao: 'upsert',
        payload: assinatura, criadaEm: instante, tentativas: 0, proximaTentativaEm: instante, estado: 'pendente',
      } satisfies OperacaoSync)
    }
  }

  await tx.table<OrdemLegada>('ordens').toCollection().modify((ordem) => {
    delete ordem.assinaturaPng
  })
}

export let db = new OSFacilDatabase()

export function selecionarBanco(usuario: string): void {
  db.close()
  db = new OSFacilDatabase(`os-facil-${usuario}`)
}

function agora(): string {
  return new Date().toISOString()
}

async function enfileirar(
  entidade: OperacaoSync['entidade'],
  entidadeId: string,
  acao: OperacaoSync['acao'],
  payload: unknown,
): Promise<void> {
  const instante = agora()
  await db.filaSync.put({
    id: crypto.randomUUID(),
    entidade,
    entidadeId,
    acao,
    payload,
    criadaEm: instante,
    tentativas: 0,
    proximaTentativaEm: instante,
    estado: 'pendente',
  })
}

/** Devolve uma operação recusada para a fila, por exemplo depois de ajustar uma regra no servidor. */
export async function reenviarOperacao(operacaoId: string): Promise<void> {
  await db.filaSync.update(operacaoId, {
    estado: 'pendente',
    tentativas: 0,
    erro: undefined,
    proximaTentativaEm: agora(),
  })
}

/**
 * Tira uma operação recusada da fila. O dado continua neste aparelho, mas
 * aquela alteração não será enviada ao servidor.
 */
export async function descartarOperacao(operacaoId: string): Promise<void> {
  await db.filaSync.delete(operacaoId)
}

export async function proximoNumero(): Promise<number> {
  const ultima = await db.ordens.orderBy('numero').last()
  return (ultima?.numero ?? 1000) + 1
}

export async function criarOrdem(input: NovaOSInput): Promise<OrdemServico> {
  // A validação fica aqui, e não só na tela: nada inválido entra na fila.
  const erros = validarNovaOS(input)
  if (erros.length) throw new DadosInvalidos(erros)
  const instante = agora()
  const cliente: Cliente = {
    id: crypto.randomUUID(),
    nome: input.clienteNome.trim(),
    telefone: input.clienteTelefone.trim(),
    documento: input.clienteDocumento?.trim() || undefined,
    criadoEm: instante,
    atualizadoEm: instante,
  }
  const ordem: OrdemServico = {
    id: crypto.randomUUID(),
    numero: 0,
    clienteId: cliente.id,
    aparelho: input.aparelho.trim(),
    marca: input.marca.trim(),
    modelo: input.modelo.trim(),
    imeiOuSerie: input.imeiOuSerie?.trim() || undefined,
    defeitoRelatado: input.defeitoRelatado.trim(),
    acessorios: input.acessorios?.trim() || undefined,
    orcamento: input.orcamento,
    status: 'aguardando_avaliacao',
    criadaEm: instante,
    atualizadaEm: instante,
    codigoPublico: gerarCodigoPublico(),
  }
  const evento: EventoOS = {
    id: crypto.randomUUID(),
    osId: ordem.id,
    status: ordem.status,
    observacao: 'Ordem de serviço aberta e aparelho recebido.',
    publico: true,
    criadoEm: instante,
    atualizadoEm: instante,
  }

  await db.transaction('rw', [db.clientes, db.ordens, db.eventos, db.filaSync], async () => {
    ordem.numero = await proximoNumero()
    await db.clientes.add(cliente)
    await db.ordens.add(ordem)
    await db.eventos.add(evento)
    await enfileirar('cliente', cliente.id, 'upsert', cliente)
    await enfileirar('os', ordem.id, 'upsert', ordem)
    await enfileirar('evento', evento.id, 'upsert', evento)
  })
  return ordem
}

export async function atualizarStatus(
  osId: string,
  status: StatusOS,
  observacao: string,
  publico = true,
): Promise<void> {
  const erro = validarObservacao(observacao)
  if (erro) throw new DadosInvalidos([erro])
  const instante = agora()
  await db.transaction('rw', [db.ordens, db.eventos, db.filaSync], async () => {
    const ordem = await db.ordens.get(osId)
    if (!ordem) throw new Error('Ordem de serviço não encontrada.')
    const alteracoes: Partial<OrdemServico> = {
      status,
      atualizadaEm: instante,
      ...(status === 'entregue' ? { entregueEm: instante } : {}),
    }
    await db.ordens.update(osId, alteracoes)
    const evento: EventoOS = {
      id: crypto.randomUUID(),
      osId,
      status,
      observacao: observacao.trim() || undefined,
      publico,
      criadoEm: instante,
      atualizadoEm: instante,
    }
    await db.eventos.add(evento)
    await enfileirar('os', osId, 'upsert', { ...ordem, ...alteracoes })
    await enfileirar('evento', evento.id, 'upsert', evento)
  })
}

export async function salvarFoto(osId: string, arquivo: Blob, nomeArquivo: string): Promise<void> {
  const instante = agora()
  const foto: FotoOS = {
    id: crypto.randomUUID(),
    osId,
    momento: 'entrada',
    arquivo,
    nomeArquivo,
    criadoEm: instante,
    atualizadoEm: instante,
    enviada: false,
  }
  await db.transaction('rw', [db.fotos, db.filaSync], async () => {
    await db.fotos.add(foto)
    await enfileirar('foto', foto.id, 'upload', {
      id: foto.id,
      osId,
      momento: foto.momento,
      nomeArquivo,
      atualizadoEm: instante,
    })
  })
}

/**
 * Grava a assinatura como registro novo, sem tocar na OS. Por isso ela não
 * disputa o "último horário vence" com as mudanças de status.
 */
export async function salvarAssinatura(osId: string, png: string): Promise<AssinaturaOS> {
  const erro = validarAssinatura(png)
  if (erro) throw new DadosInvalidos([erro])

  const instante = agora()
  const assinatura: AssinaturaOS = { id: crypto.randomUUID(), osId, png, criadoEm: instante, atualizadoEm: instante }

  await db.transaction('rw', [db.ordens, db.assinaturas, db.filaSync], async () => {
    if (!(await db.ordens.get(osId))) throw new Error('Ordem de serviço não encontrada.')
    await db.assinaturas.add(assinatura)
    await enfileirar('assinatura', assinatura.id, 'upsert', assinatura)
  })
  return assinatura
}

/** A assinatura que vale para a OS: a mais recente. */
export async function assinaturaVigente(osId: string): Promise<AssinaturaOS | null> {
  const assinaturas = await db.assinaturas.where('osId').equals(osId).sortBy('criadoEm')
  return assinaturas.at(-1) ?? null
}
