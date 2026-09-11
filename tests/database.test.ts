import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarOrdem, db } from '../src/db/database'
import { carregarDadosDemonstracao } from '../src/db/seed'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterAll(async () => db.delete())

describe('banco local offline', () => {
  it('abre a OS e enfileira as três alterações sem usar a rede', async () => {
    const ordem = await criarOrdem({
      clienteNome: 'Cliente Teste', clienteTelefone: '(11) 99999-0000',
      aparelho: 'Celular', marca: 'Teste', modelo: 'T1',
      defeitoRelatado: 'Não liga',
    })
    expect(await db.clientes.count()).toBe(1)
    expect(await db.ordens.count()).toBe(1)
    expect(await db.eventos.count()).toBe(1)
    expect(await db.filaSync.count()).toBe(3)
    expect(ordem.numero).toBe(1001)
    expect(ordem.codigoPublico).toHaveLength(16)
  })

  it('carrega exatamente oito ordens de demonstração uma vez', async () => {
    await carregarDadosDemonstracao()
    await carregarDadosDemonstracao()
    expect(await db.ordens.count()).toBe(8)
    expect(await db.clientes.count()).toBe(8)
    expect(await db.eventos.count()).toBe(8)
  })
})
