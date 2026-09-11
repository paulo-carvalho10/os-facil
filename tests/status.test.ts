import { describe, expect, it } from 'vitest'
import { podeAvancarStatus, proximoStatus } from '../src/domain/status'

describe('esteira da ordem de serviço', () => {
  it('segue as seis fases na ordem definida', () => {
    expect(proximoStatus('aguardando_avaliacao')).toBe('orcamento_enviado')
    expect(proximoStatus('orcamento_enviado')).toBe('aprovado')
    expect(proximoStatus('aprovado')).toBe('em_conserto')
    expect(proximoStatus('em_conserto')).toBe('pronto')
    expect(proximoStatus('pronto')).toBe('entregue')
    expect(proximoStatus('entregue')).toBeNull()
  })

  it('não permite pular uma fase', () => {
    expect(podeAvancarStatus('aguardando_avaliacao', 'em_conserto')).toBe(false)
    expect(podeAvancarStatus('aprovado', 'em_conserto')).toBe(true)
  })
})
