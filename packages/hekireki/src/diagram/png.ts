import { Resvg } from '@resvg/resvg-js'

/** Rasterises an SVG document at the given scale (2 = a crisp image on high-density displays). */
export function svgToPng(svg: string, scale = 2): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: {
      loadSystemFonts: true,
      monospaceFamily: 'DejaVu Sans Mono',
      sansSerifFamily: 'DejaVu Sans',
    },
  })
  return resvg.render().asPng()
}
