import { ScanBarcode, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Detector = {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
}

type DetectorConstructor = new (options?: { formats?: string[] }) => Detector

export function BarcodeScanner({ onValue }: { onValue: (valor: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    let stream: MediaStream | undefined
    let frame = 0

    async function iniciar() {
      const BarcodeDetector = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector
      if (!BarcodeDetector) {
        setErro('Leitura automática indisponível neste navegador. Digite o código no campo.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        const detector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'qr_code'] })
        const verificar = async () => {
          if (!ativo) return
          try {
            const resultados = await detector.detect(video)
            if (resultados[0]?.rawValue) {
              onValue(resultados[0].rawValue)
              setAberto(false)
              return
            }
          } catch { /* o próximo quadro tenta novamente */ }
          frame = requestAnimationFrame(verificar)
        }
        frame = requestAnimationFrame(verificar)
      } catch {
        setErro('Não foi possível acessar a câmera. Digite o código no campo.')
      }
    }

    void iniciar()
    return () => {
      ativo = false
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [aberto, onValue])

  return (
    <>
      <button type="button" className="inline-action" onClick={() => { setErro(''); setAberto(true) }}><ScanBarcode size={16} /> Ler código</button>
      {aberto && <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="Leitor de código">
        <div className="scanner-card">
          <div className="section-heading"><div><p className="eyebrow">Câmera</p><h2>Aponte para o código</h2></div><button type="button" className="icon-button" onClick={() => setAberto(false)} aria-label="Fechar leitor"><X size={20} /></button></div>
          <video ref={videoRef} muted playsInline />
          {erro && <p className="form-error">{erro}</p>}
          <p className="muted">Compatível com código de barras do IMEI, número de série e QR Code.</p>
        </div>
      </div>}
    </>
  )
}
