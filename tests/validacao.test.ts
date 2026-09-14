import { beforeEach, describe, expect, it } from 'vitest'
import { atualizarStatus, criarOrdem, db } from '../src/db/database'
import type { NovaOSInput } from '../src/db/types'
import { DadosInvalidos, tamanho, validarAssinatura, validarNovaOS } from '../src/domain/validacao'

const valida: NovaOSInput = {
  clienteNome: 'Cliente Teste', clienteTelefone: '(34) 99999-0000',
  aparelho: 'Celular', marca: 'Samsung', modelo: 'A15', defeitoRelatado: 'Não carrega',
}

describe('limites iguais aos do banco', () => {
  it('aceita uma OS dentro de todos os limites', () => {
    expect(validarNovaOS(valida)).toEqual([])
  })

  it('recusa o telefone curto que antes a tela aceitava e o banco recusava', () => {
    expect(validarNovaOS({ ...valida, clienteTelefone: '12345' })).toEqual([
      'O telefone precisa ter ao menos 8 caracteres.',
    ])
  })

  it('confere os mínimos e máximos de cada campo', () => {
    const erros = validarNovaOS({
      ...valida,
      clienteNome: 'A',
      marca: '   ',
      defeitoRelatado: 'x'.repeat(4001),
      acessorios: 'x'.repeat(2001),
      clienteDocumento: 'x'.repeat(41),
    })
    expect(erros).toEqual([
      'O nome do cliente precisa ter ao menos 2 caracteres.',
      'O documento pode ter no máximo 40 caracteres.',
      'Informe a marca.',
      'O defeito relatado pode ter no máximo 4000 caracteres.',
      'A lista de acessórios pode ter no máximo 2000 caracteres.',
    ])
  })

  it('conta caracteres como o PostgreSQL, por ponto de código', () => {
    expect('😀'.length).toBe(2)
    expect(tamanho('😀')).toBe(1)
    expect(validarNovaOS({ ...valida, clienteNome: '😀' })).toHaveLength(1)
  })

  it('recusa orçamento negativo, acima do limite ou não numérico', () => {
    for (const orcamento of [-1, 100_000_000, Number.NaN]) {
      expect(validarNovaOS({ ...valida, orcamento })).toHaveLength(1)
    }
    expect(validarNovaOS({ ...valida, orcamento: 0 })).toEqual([])
  })

  it('só aceita assinatura em PNG e dentro do tamanho da coluna', () => {
    expect(validarAssinatura('data:image/png;base64,AAAA')).toBeNull()
    expect(validarAssinatura('data:image/jpeg;base64,AAAA')).not.toBeNull()
    expect(validarAssinatura(`data:image/png;base64,${'A'.repeat(300_000)}`)).not.toBeNull()
  })
})

describe('nada inválido entra na fila', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('criarOrdem recusa antes de gravar qualquer coisa', async () => {
    await expect(criarOrdem({ ...valida, clienteTelefone: '12345' })).rejects.toBeInstanceOf(DadosInvalidos)
    expect(await db.ordens.count()).toBe(0)
    expect(await db.clientes.count()).toBe(0)
    expect(await db.filaSync.count()).toBe(0)
  })

  it('atualizarStatus recusa observação acima do limite', async () => {
    const ordem = await criarOrdem(valida)
    const filaAntes = await db.filaSync.count()
    await expect(atualizarStatus(ordem.id, 'orcamento_enviado', 'x'.repeat(2001))).rejects.toBeInstanceOf(DadosInvalidos)
    expect((await db.ordens.get(ordem.id))?.status).toBe('aguardando_avaliacao')
    expect(await db.filaSync.count()).toBe(filaAntes)
  })
})
