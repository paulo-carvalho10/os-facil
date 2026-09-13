import Dexie, { type EntityTable } from 'dexie'
import type {
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
import { DadosInvalidos, validarNovaOS, validarObservacao } from '../domain/validacao'

export class OSFacilDatabase extends Dexie {
  clientes!: EntityTable<Cliente, 'id'>
  ordens!: EntityTable<OrdemServico, 'id'>
  eventos!: EntityTable<EventoOS, 'id'>
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
  }
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

export async function salvarAssinatura(osId: string, assinaturaPng: string): Promise<void> {
  const instante = agora()
  await db.transaction('rw', [db.ordens, db.filaSync], async () => {
    const ordem = await db.ordens.get(osId)
    if (!ordem) throw new Error('Ordem de serviço não encontrada.')
    const atualizada = { ...ordem, assinaturaPng, atualizadaEm: instante }
    await db.ordens.put(atualizada)
    await enfileirar('os', osId, 'upsert', atualizada)
  })
}
