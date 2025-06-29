import { modelFields } from './index.js'
import type { Model } from '../types.js'

/**
 * generate model info
 * @param model
 * @returns
 */
export function modelInfo(model: Model): readonly string[] {
  return [`    ${model.name} {`, ...modelFields(model), '    }'] as const
}
