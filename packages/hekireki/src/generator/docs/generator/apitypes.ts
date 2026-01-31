import type { DMMF } from '@prisma/generator-helper'
import { type Generatable, isScalarType } from './helpers.js'
import type { DMMFDocument } from './transformDMMF.js'

type TypesGeneratorStructure = {
  inputTypes: TGType[]
  outputTypes: TGType[]
}

type TGType = {
  name: string
  fields: TGTypeField[]
}

type TGTypeField = {
  name: string
  type: readonly DMMF.InputTypeRef[]
  nullable: boolean
}

export class TypesGenerator implements Generatable<TypesGeneratorStructure> {
  data: TypesGeneratorStructure

  constructor(d: DMMFDocument) {
    this.data = this.getData(d)
  }

  private getTypeFieldHTML(field: TGTypeField, kind: 'inputType' | 'outputType'): string {
    return `
    <tr>
      <td class="px-4 py-2 border text-black dark:text-white dark:border-gray-400">
        ${field.name} </td>
      <td class="px-4 py-2 border text-black dark:text-white dark:border-gray-400">
        ${field.type
          .map((f) =>
            isScalarType(f.type as string)
              ? f.type
              : `<a href="#type-${kind}-${f.type}">${f.type}${f.isList ? '[]' : ''}</a>`,
          )
          .join(' | ')}
      </td>
      <td class="px-4 py-2 border text-black dark:text-white dark:border-gray-400">
        ${field.nullable ? '<strong>Yes</strong>' : 'No'}
      </td>
    </tr>
    `
  }

  private getTypeHTML(type: TGType, kind: 'inputType' | 'outputType'): string {
    return `
      <div>
        <h3 class="mb-2 text-xl text-black dark:text-white" id="type-${kind}-${type.name}">${type.name}</h3>
        <table class="table-auto">
          <thead>
            <tr>
              <th class="px-4 py-2 border text-black dark:text-white dark:border-gray-400">Name</th>
              <th class="px-4 py-2 border text-black dark:text-white dark:border-gray-400">Type</th>
              <th class="px-4 py-2 border text-black dark:text-white dark:border-gray-400">Nullable</th>
            </tr>
          </thead>
          <tbody>
          ${type.fields.map((field) => this.getTypeFieldHTML(field, kind)).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  toHTML(): string {
    return `<div>
    <h1 class="text-3xl dark:text-white" id="types">Types</h1>
        <div>
          <div class="ml-4">
            <h3 class="mb-2 text-2xl font-normal" id="input-types dark:text-white">Input Types</h3>
            <div class="ml-4">
              ${this.data.inputTypes.map((inputType) => this.getTypeHTML(inputType, 'inputType')).join(`<hr class="my-4" />`)}
            </div>
          </div>
          <div class="ml-4">
            <h3 class="mb-2 text-2xl font-normal dark:text-white" id="output-types">Output Types</h3>
            <div class="ml-4">
              ${this.data.outputTypes.map((outputType) => this.getTypeHTML(outputType, 'outputType')).join(`<hr class="my-4" />`)}
            </div>
          </div>
        </div>
      </div>
`
  }

  private getInputTypes(
    dmmfInputType: readonly DMMF.InputType[],
  ): TGType[] {
    return dmmfInputType.map((inputType) => ({
      name: inputType.name,
      fields: inputType.fields.map((ip) => ({
        name: ip.name,
        nullable: ip.isNullable as boolean,
        type: ip.inputTypes as readonly DMMF.InputTypeRef[],
      })),
    }))
  }

  private getOutputTypes(
    dmmfOutputTypes: readonly DMMF.OutputType[],
  ): TGType[] {
    return dmmfOutputTypes.map((outputType) => ({
      name: outputType.name,
      fields: outputType.fields.map((op) => ({
        name: op.name,
        nullable: !op.isNullable,
        type: [
          {
            isList: op.outputType.isList,
            type: op.outputType.type as string,
            location: op.outputType.location,
          },
        ] as readonly DMMF.InputTypeRef[],
      })),
    }))
  }

  getData(d: DMMFDocument): TypesGeneratorStructure {
    const prismaInputTypes = d.schema.inputObjectTypes.prisma ?? []
    return {
      inputTypes: this.getInputTypes(prismaInputTypes),
      outputTypes: this.getOutputTypes([
        ...d.schema.outputObjectTypes.model,
        ...d.schema.outputObjectTypes.prisma.filter(
          (op) => op.name !== 'Query' && op.name !== 'Mutation',
        ),
      ]),
    }
  }
}
