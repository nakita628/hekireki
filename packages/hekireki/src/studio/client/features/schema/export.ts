import { renderDiagramSvg } from '../../../../diagram/svg.js'
import type { DiagramInput } from '../../../../diagram/svg.js'

const EXPORT_SCALE = 2

function download(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

function loadImage(svg: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    image.addEventListener('load', () => {
      URL.revokeObjectURL(url)
      resolve(image)
    })
    image.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      reject(new Error('The diagram could not be rasterised.'))
    })
    image.src = url
  })
}

/** Draws the diagram to a PNG through a canvas; the SVG is the same one `exportSvg` writes. */
export async function renderDiagramPng(input: DiagramInput) {
  const svg = renderDiagramSvg(input)
  const image = await loadImage(svg)
  const canvas = document.createElement('canvas')
  canvas.width = image.width * EXPORT_SCALE
  canvas.height = image.height * EXPORT_SCALE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available in this browser.')
  context.scale(EXPORT_SCALE, EXPORT_SCALE)
  context.drawImage(image, 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The diagram could not be encoded as PNG.'))
    }, 'image/png')
  })
}

export async function exportPng(fileName: string, input: DiagramInput) {
  download(fileName, await renderDiagramPng(input))
}

export function exportSvg(fileName: string, input: DiagramInput) {
  download(fileName, new Blob([renderDiagramSvg(input)], { type: 'image/svg+xml;charset=utf-8' }))
}
