export async function redimensionarImagem(
  arquivo: File,
  limite = 1600,
  qualidade = 0.78,
): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo)
  const proporcao = Math.min(1, limite / Math.max(bitmap.width, bitmap.height))
  const largura = Math.round(bitmap.width * proporcao)
  const altura = Math.round(bitmap.height * proporcao)
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('Não foi possível preparar a imagem.')
  contexto.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível reduzir a imagem.'))),
      'image/jpeg',
      qualidade,
    )
  })
}
