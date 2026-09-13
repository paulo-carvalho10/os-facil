import type { NovaOSInput } from '../db/types'

/**
 * Os mesmos limites das constraints do banco (migração 002).
 *
 * Validar só no servidor não basta num app offline: a OS é salva no aparelho e
 * só chega ao banco horas depois. Se o banco recusar nesse momento, o atendimento
 * já aconteceu e o cliente já foi embora. Por isso a tela recusa antes.
 */
export const LIMITES = {
  clienteNome: { min: 2, max: 160 },
  clienteTelefone: { min: 8, max: 30 },
  clienteDocumento: { max: 40 },
  aparelho: { min: 1, max: 80 },
  marca: { min: 1, max: 80 },
  modelo: { min: 1, max: 120 },
  imeiOuSerie: { max: 120 },
  defeitoRelatado: { min: 1, max: 4000 },
  acessorios: { max: 2000 },
  observacao: { max: 2000 },
  orcamentoMaximo: 99_999_999.99,
  assinatura: { max: 300_000 },
} as const

export class DadosInvalidos extends Error {
  constructor(readonly erros: string[]) {
    super(erros.join(' '))
    this.name = 'DadosInvalidos'
  }
}

/**
 * Conta caracteres como o PostgreSQL conta em length(): por ponto de código.
 * `'😀'.length` é 2 no JavaScript e 1 no banco; um nome de um emoji passaria
 * no mínimo de 2 aqui e seria recusado lá.
 */
export function tamanho(texto: string | undefined): number {
  return texto ? [...texto].length : 0
}

function faixa(rotulo: string, valor: string | undefined, min: number, max: number): string | null {
  const n = tamanho(valor?.trim())
  if (n < min) return min === 1 ? `Informe ${rotulo}.` : `${primeiraMaiuscula(rotulo)} precisa ter ao menos ${min} caracteres.`
  if (n > max) return `${primeiraMaiuscula(rotulo)} pode ter no máximo ${max} caracteres.`
  return null
}

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function validarNovaOS(input: NovaOSInput): string[] {
  const erros = [
    faixa('o nome do cliente', input.clienteNome, LIMITES.clienteNome.min, LIMITES.clienteNome.max),
    faixa('o telefone', input.clienteTelefone, LIMITES.clienteTelefone.min, LIMITES.clienteTelefone.max),
    faixa('o documento', input.clienteDocumento, 0, LIMITES.clienteDocumento.max),
    faixa('o tipo de aparelho', input.aparelho, LIMITES.aparelho.min, LIMITES.aparelho.max),
    faixa('a marca', input.marca, LIMITES.marca.min, LIMITES.marca.max),
    faixa('o modelo', input.modelo, LIMITES.modelo.min, LIMITES.modelo.max),
    faixa('o IMEI ou número de série', input.imeiOuSerie, 0, LIMITES.imeiOuSerie.max),
    faixa('o defeito relatado', input.defeitoRelatado, LIMITES.defeitoRelatado.min, LIMITES.defeitoRelatado.max),
    faixa('a lista de acessórios', input.acessorios, 0, LIMITES.acessorios.max),
  ]

  const { orcamento } = input
  if (orcamento !== undefined && (!Number.isFinite(orcamento) || orcamento < 0 || orcamento > LIMITES.orcamentoMaximo)) {
    erros.push('O orçamento precisa ser um valor entre R$ 0,00 e R$ 99.999.999,99.')
  }

  return erros.filter((erro): erro is string => erro !== null)
}

export function validarObservacao(observacao: string): string | null {
  return faixa('a observação', observacao, 0, LIMITES.observacao.max)
}

export function validarAssinatura(png: string): string | null {
  if (!png.startsWith('data:image/png;base64,')) return 'A assinatura precisa ser uma imagem PNG.'
  if (png.length > LIMITES.assinatura.max) return 'A assinatura ficou grande demais para ser salva.'
  return null
}
