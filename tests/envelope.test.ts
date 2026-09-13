import { expect, test } from 'vitest'
import { envelope } from '../src/sync/supabase-engine'
import type { OperacaoSync } from '../src/db/types'
test('retries preserve the idempotency envelope after queue metadata changes', () => {
  const op: OperacaoSync = { id:'operation', entidade:'cliente', entidadeId:'client', acao:'upsert', payload:{id:'client'}, criadaEm:'2026-01-01', tentativas:0, proximaTentativaEm:'2026-01-01', estado:'pendente' }
  expect(envelope({...op,tentativas:3,estado:'erro',erro:'timeout',proximaTentativaEm:'2026-01-02'})).toEqual(envelope(op))
})
