import { Camera, ImagePlus, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { redimensionarImagem } from '../domain/images'
import { salvarFoto } from '../db/database'

export function PhotoCapture({ osId, onSaved }: { osId: string; onSaved?: () => void }) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function selecionar(arquivo?: File) {
    if (!arquivo) return
    setSalvando(true)
    setErro('')
    try {
      const reduzida = await redimensionarImagem(arquivo)
      await salvarFoto(osId, reduzida, arquivo.name.replace(/\.[^.]+$/, '.jpg'))
      onSaved?.()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a foto.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="photo-actions no-print">
      <label className="button secondary">
        {salvando ? <LoaderCircle className="spin" size={18} /> : <Camera size={18} />}
        Tirar foto
        <input type="file" accept="image/*" capture="environment" hidden disabled={salvando}
          onChange={(e) => void selecionar(e.target.files?.[0])} />
      </label>
      <label className="button ghost">
        <ImagePlus size={18} /> Galeria
        <input type="file" accept="image/*" hidden disabled={salvando}
          onChange={(e) => void selecionar(e.target.files?.[0])} />
      </label>
      {erro && <p className="form-error">{erro}</p>}
    </div>
  )
}
