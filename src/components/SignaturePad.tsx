import { Eraser, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { salvarAssinatura } from '../db/database'

export function SignaturePad({ osId, assinaturaAtual }: { osId: string; assinaturaAtual?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const [salva, setSalva] = useState(Boolean(assinaturaAtual))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const contexto = canvas.getContext('2d')
    if (!contexto) return
    contexto.lineCap = 'round'
    contexto.lineJoin = 'round'
    contexto.lineWidth = 2.5
    contexto.strokeStyle = '#171a16'
    if (assinaturaAtual) {
      const imagem = new Image()
      imagem.onload = () => contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height)
      imagem.src = assinaturaAtual
    }
  }, [assinaturaAtual])

  function ponto(evento: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (evento.clientX - rect.left) * (canvas.width / rect.width),
      y: (evento.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function iniciar(evento: React.PointerEvent<HTMLCanvasElement>) {
    desenhando.current = true
    evento.currentTarget.setPointerCapture(evento.pointerId)
    const contexto = evento.currentTarget.getContext('2d')!
    const atual = ponto(evento)
    contexto.beginPath()
    contexto.moveTo(atual.x, atual.y)
    setSalva(false)
  }

  function mover(evento: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return
    const atual = ponto(evento)
    const contexto = evento.currentTarget.getContext('2d')!
    contexto.lineTo(atual.x, atual.y)
    contexto.stroke()
  }

  function limpar() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setSalva(false)
  }

  async function salvar() {
    const png = canvasRef.current!.toDataURL('image/png')
    await salvarAssinatura(osId, png)
    setSalva(true)
  }

  return (
    <div className="signature-wrap">
      <canvas ref={canvasRef} width={760} height={220} className="signature-canvas"
        onPointerDown={iniciar} onPointerMove={mover}
        onPointerUp={() => { desenhando.current = false }}
        onPointerCancel={() => { desenhando.current = false }} />
      <div className="signature-line">Assinatura do cliente</div>
      <div className="row-actions no-print">
        <button className="button ghost" onClick={limpar}><Eraser size={17} /> Limpar</button>
        <button className="button secondary" onClick={() => void salvar()}><Save size={17} /> {salva ? 'Assinatura salva' : 'Salvar assinatura'}</button>
      </div>
    </div>
  )
}
