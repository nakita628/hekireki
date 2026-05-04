import type { DMMF } from '@prisma/generator-helper'

import { transformDMMF } from '../helper/docs/generator/transformDMMF.js'
import { generateHTML } from '../helper/docs/printer/index.js'

export function docsHTML(dmmf: DMMF.Document) {
  return generateHTML(transformDMMF(dmmf))
}
