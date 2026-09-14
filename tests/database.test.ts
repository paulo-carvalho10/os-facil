import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarOrdem, db } from '../src/db/database'
import { carregarDadosDemonstracao } from '../src/db/seed'
import { STATUS_OS } from '../src/db/types'

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
  })

  it('cada ordem de demonstração traz o histórico de todas as etapas até a atual', async () => {
    await carregarDadosDemonstracao()

    for (const ordem of await db.ordens.toArray()) {
      const eventos = await db.eventos.where('osId').equals(ordem.id).sortBy('criadoEm')
      const esperado = STATUS_OS.slice(0, STATUS_OS.indexOf(ordem.status) + 1)

      expect(eventos.map((evento) => evento.status), `OS #${ordem.numero}`).toEqual(esperado)
      expect(eventos[0]?.criadoEm).toBe(ordem.criadaEm)
      expect(eventos.at(-1)?.criadoEm).toBe(ordem.atualizadaEm)
      expect(Date.parse(ordem.atualizadaEm)).toBeLessThan(Date.now())
    }
  })
})
