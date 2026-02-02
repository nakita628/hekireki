import type { FC } from 'hono/jsx'
import type { DMMF } from '@prisma/generator-helper'
import { isScalarType } from './helpers.js'
import type { DMMFDocument } from './transformDMMF.js'
import { styles } from '../styles.js'

type TypesGeneratorStructure = {
  readonly inputTypes: readonly TGType[]
  readonly outputTypes: readonly TGType[]
}

type TGType = {
  readonly name: string
  readonly fields: readonly TGTypeField[]
}

type TGTypeField = {
  readonly name: string
  readonly type: readonly DMMF.InputTypeRef[]
  readonly nullable: boolean
}

const TypeRefLink: FC<{ typeRef: DMMF.InputTypeRef; kind: 'inputType' | 'outputType' }> = ({
  typeRef,
  kind,
}) => {
  const typeName = typeRef.type as string
  if (isScalarType(typeName)) {
    return <>{typeName}</>
  }
  return (
    <a href={`#type-${kind}-${typeName}`}>
      {typeName}
      {typeRef.isList ? '[]' : ''}
    </a>
  )
}

const TypeFieldRow: FC<{ field: TGTypeField; kind: 'inputType' | 'outputType' }> = ({
  field,
  kind,
}) => (
  <tr>
    <td>{field.name}</td>
    <td>
      {field.type.map((t, i) => (
        <>
          {i > 0 && ' | '}
          <TypeRefLink typeRef={t} kind={kind} />
        </>
      ))}
    </td>
    <td>{field.nullable ? <strong>Yes</strong> : 'No'}</td>
  </tr>
)

const TypeItem: FC<{ type: TGType; kind: 'inputType' | 'outputType' }> = ({ type, kind }) => (
  <div>
    <h3 class={styles.h3} id={`type-${kind}-${type.name}`}>
      {type.name}
    </h3>
    <table class={styles.table}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Nullable</th>
        </tr>
      </thead>
      <tbody>
        {type.fields.map((field) => (
          <TypeFieldRow field={field} kind={kind} />
        ))}
      </tbody>
    </table>
  </div>
)

const TypesSection: FC<{ data: TypesGeneratorStructure }> = ({ data }) => (
  <div class={styles.section}>
    <h1 class={styles.h1} id="types">
      Types
    </h1>
    <div class={styles.ml4}>
      <h2 class={styles.h2} id="input-types">
        Input Types
      </h2>
      <div class={styles.ml4}>
        {data.inputTypes.map((inputType, i) => (
          <>
            {i > 0 && <hr class={styles.hrSmall} />}
            <TypeItem type={inputType} kind="inputType" />
          </>
        ))}
      </div>
    </div>
    <div class={styles.ml4}>
      <h2 class={styles.h2} id="output-types">
        Output Types
      </h2>
      <div class={styles.ml4}>
        {data.outputTypes.map((outputType, i) => (
          <>
            {i > 0 && <hr class={styles.hrSmall} />}
            <TypeItem type={outputType} kind="outputType" />
          </>
        ))}
      </div>
    </div>
  </div>
)

const getInputTypes = (dmmfInputType: readonly DMMF.InputType[]): readonly TGType[] =>
  dmmfInputType.map((inputType) => ({
    name: inputType.name,
    fields: inputType.fields.map((ip) => ({
      name: ip.name,
      nullable: ip.isNullable as boolean,
      type: ip.inputTypes as readonly DMMF.InputTypeRef[],
    })),
  }))

const getOutputTypes = (dmmfOutputTypes: readonly DMMF.OutputType[]): readonly TGType[] =>
  dmmfOutputTypes.map((outputType) => ({
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

const getTypesData = (d: DMMFDocument): TypesGeneratorStructure => {
  const prismaInputTypes = d.schema.inputObjectTypes.prisma ?? []
  return {
    inputTypes: getInputTypes(prismaInputTypes),
    outputTypes: getOutputTypes([
      ...d.schema.outputObjectTypes.model,
      ...d.schema.outputObjectTypes.prisma.filter(
        (op) => op.name !== 'Query' && op.name !== 'Mutation',
      ),
    ]),
  }
}

export const createTypes = (d: DMMFDocument) => {
  const data = getTypesData(d)
  return <TypesSection data={data} />
}
