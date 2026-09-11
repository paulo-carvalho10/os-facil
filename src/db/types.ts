export const STATUS_OS = [
  'aguardando_avaliacao',
  'orcamento_enviado',
  'aprovado',
  'em_conserto',
  'pronto',
  'entregue',
] as const

export type StatusOS = (typeof STATUS_OS)[number]

export const STATUS_LABEL: Record<StatusOS, string> = {
  aguardando_avaliacao: 'Aguardando avaliação',
  orcamento_enviado: 'Orçamento enviado',
  aprovado: 'Aprovado',
  em_conserto: 'Em conserto',
  pronto: 'Pronto para retirada',
  entregue: 'Entregue',
}

export interface Cliente {
  id: string
  nome: string
  telefone: string
  documento?: string
  criadoEm: string
  atualizadoEm: string
}

export interface OrdemServico {
  id: string
  numero: number
  clienteId: string
  aparelho: string
  marca: string
  modelo: string
  imeiOuSerie?: string
  defeitoRelatado: string
  acessorios?: string
  orcamento?: number
  status: StatusOS
  criadaEm: string
  atualizadaEm: string
  entregueEm?: string
  codigoPublico: string
  assinaturaPng?: string
  sincronizadaEm?: string
}

export interface EventoOS {
  id: string
  osId: string
  status: StatusOS
  observacao?: string
  publico: boolean
  criadoEm: string
  atualizadoEm: string
}

export interface FotoOS {
  id: string
  osId: string
  momento: 'entrada' | 'saida'
  arquivo: Blob
  nomeArquivo: string
  criadoEm: string
  atualizadoEm: string
  enviada: boolean
}

export type EntidadeSincronizavel = 'cliente' | 'os' | 'evento' | 'foto'

export interface OperacaoSync {
  id: string
  entidade: EntidadeSincronizavel
  entidadeId: string
  acao: 'upsert' | 'delete' | 'upload'
  payload: unknown
  criadaEm: string
  tentativas: number
  proximaTentativaEm: string
  estado: 'pendente' | 'processando' | 'erro'
  erro?: string
}

export interface Configuracao {
  chave: string
  valor: string
}

export interface NovaOSInput {
  clienteNome: string
  clienteTelefone: string
  clienteDocumento?: string
  aparelho: string
  marca: string
  modelo: string
  imeiOuSerie?: string
  defeitoRelatado: string
  acessorios?: string
  orcamento?: number
}

export interface DadosPublicosOS {
  codigoPublico: string
  numero: number
  aparelho: string
  marca: string
  modelo: string
  status: StatusOS
  atualizadaEm: string
  eventos: Array<Pick<EventoOS, 'id' | 'status' | 'observacao' | 'criadoEm'>>
}
