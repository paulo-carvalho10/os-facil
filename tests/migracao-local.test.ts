import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { OSFacilDatabase } from '../src/db/database'

const NOME = 'os-facil-teste-migracao'
const PNG_SINCRONIZADA = 'data:image/png;base64,JA-NO-SERVIDOR'
const PNG_PENDENTE = 'data:image/png;base64,SO-NESTE-APARELHO'

/** Cria o banco como a versão 2 do aplicativo deixava: assinatura dentro da OS. */
async function criarBancoVersao2() {
  const antigo = new Dexie(NOME)
  antigo.version(1).stores({
    clientes: 'id, nome, telefone, atualizadoEm',
    ordens: 'id, &numero, &codigoPublico, clienteId, status, criadaEm, atualizadaEm',
    eventos: 'id, osId, status, criadoEm, atualizadoEm',
    fotos: 'id, osId, momento, atualizadoEm, enviada',
    filaSync: 'id, entidade, entidadeId, estado, criadaEm, proximaTentativaEm',
    configuracoes: 'chave',
  })
  antigo.version(2).stores({ ordens: 'id, numero, &codigoPublico, clienteId, status, criadaEm, atualizadaEm' })
  await antigo.open()

  const ordem = (id: string, numero: number, codigo: string, assinaturaPng?: string) => ({
    id, numero, clienteId: 'c1', aparelho: 'Celular', marca: 'X', modelo: 'Y', defeitoRelatado: 'Z',
    status: 'entregue', criadaEm: '2026-09-10T10:00:00.000Z', atualizadaEm: '2026-09-10T11:00:00.000Z',
    codigoPublico: codigo, ...(assinaturaPng ? { assinaturaPng } : {}),
  })

  await antigo.table('ordens').bulkAdd([
    ordem('os-sincronizada', 1001, '23456789ABCDEFGH', PNG_SINCRONIZADA),
    ordem('os-pendente', 1002, '3456789ABCDEFGHJ', PNG_PENDENTE),
    ordem('os-sem-assinatura', 1003, '456789ABCDEFGHJK'),
  ])
  // A assinatura da os-pendente ainda estava na fila, dentro de uma operação de OS.
  await antigo.table('filaSync').add({
    id: 'op-antiga', entidade: 'os', entidadeId: 'os-pendente', acao: 'upsert',
    payload: ordem('os-pendente', 1002, '3456789ABCDEFGHJ', PNG_PENDENTE),
    criadaEm: '2026-09-10T11:00:00.000Z', tentativas: 0, proximaTentativaEm: '2026-09-10T11:00:00.000Z', estado: 'pendente',
  })
  antigo.close()
}

afterEach(async () => {
  await Dexie.delete(NOME)
})

describe('migração do banco local para a versão 3', () => {
  it('tira a assinatura da OS sem perder nem duplicar', async () => {
    await criarBancoVersao2()
    const banco = new OSFacilDatabase(NOME)
    await banco.open()

    const assinaturas = await banco.assinaturas.orderBy('osId').toArray()
    expect(assinaturas.map((a) => [a.osId, a.png])).toEqual([
      ['os-pendente', PNG_PENDENTE],
      ['os-sincronizada', PNG_SINCRONIZADA],
    ])

    // Já sincronizada: mesmo id da OS, igual ao que a migração 004 cria no servidor, e nada na fila.
    const sincronizada = assinaturas.find((a) => a.osId === 'os-sincronizada')!
    expect(sincronizada.id).toBe('os-sincronizada')

    // Pendente: id novo e uma operação própria na fila, porque o servidor não a tem.
    const pendente = assinaturas.find((a) => a.osId === 'os-pendente')!
    expect(pendente.id).not.toBe('os-pendente')
    const operacoes = await banco.filaSync.where('entidade').equals('assinatura').toArray()
    expect(operacoes.map((o) => o.entidadeId)).toEqual([pendente.id])

    // A OS não carrega mais o campo antigo.
    for (const ordem of await banco.ordens.toArray()) {
      expect(ordem).not.toHaveProperty('assinaturaPng')
    }
    banco.close()
  })
})
