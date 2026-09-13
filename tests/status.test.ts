import { describe, expect, it } from 'vitest'
import { proximoStatus } from '../src/domain/status'

describe('esteira da ordem de serviço', () => {
  it('segue as seis fases na ordem definida e para na entrega', () => {
    expect(proximoStatus('aguardando_avaliacao')).toBe('orcamento_enviado')
    expect(proximoStatus('orcamento_enviado')).toBe('aprovado')
    expect(proximoStatus('aprovado')).toBe('em_conserto')
    expect(proximoStatus('em_conserto')).toBe('pronto')
    expect(proximoStatus('pronto')).toBe('entregue')
    expect(proximoStatus('entregue')).toBeNull()
  })
})
