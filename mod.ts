import { ShaclModel, Converter, outdent } from './deps.ts'

const extractTypes = (ejectedFile: string) => {
  const types: Types = {}

  let inType: false | string = false
  const lines = ejectedFile.split('\n')

  for (const line of lines) {
      if (line.trim() === '}' && inType) {
          inType = false
      }

      if (inType) {
          if (!types[inType]) types[inType] = {}
          const [property, type] = line.split(': ')

          types[inType][property.replace('?', '').trim().replace(/'/g, '')] = { 
              multiple: type.includes('Array'), 
              optional: property.includes('?'),
              type: type.replaceAll(';', '').replaceAll('Array<', '').replaceAll('>', '')
          }
      }

      if (line.includes('export type')) {
          inType = line.replace(/'/g, '').trim().split(' ')[2].trim()
      }
  }

  return types
}

export type Types = { [key: string]: { [key: string]: { multiple: boolean, optional: boolean, type: string } } }

export const eject = async (shacl: string, prefixes: { [key: string]: string }, vocab: string, endpoint: string, modelImportPath = './Model.ts') => {
    const model = await new ShaclModel({ endpoint: '', shacl, vocab, prefixes })

    const sourceQuery: string = model.query(999, 333, ['urn:replace']) as string

    const regex = new RegExp(/\|\| \(LANG\(\?o\) IN\(([a-zA-Z0-9-", ]+)\)/, 'g')
    const matches = sourceQuery.matchAll(regex)

    const converter = new Converter()
    const types = await converter.transform(shacl, vocab, prefixes)

    const metaTypes = extractTypes(types.map(type => type.text).join('\n'))
    
    let query = sourceQuery
    for (const match of matches ?? []) {
        query = query.replaceAll(match[0], '|| (LANG(?o) IN(${langCodes.map(langCode => `"${langCode}"`).join(", ")})')
    }

    let startIndex = 0
    let endIndex = 0
    const lines = query.split('\n')
    for (const [index, line] of lines.entries()) {
        if (line.includes('SELECT ?this WHERE')) startIndex = index - 1
        if (line.includes('LIMIT 999')) endIndex = index + 1
    }

    if (startIndex && endIndex) {
        const innerQueryLines = lines.filter((line, index) => index >= startIndex && index <= endIndex)
        let innerQuery = innerQueryLines.join('\n')

        innerQuery = innerQuery.replace(`VALUES ?this {\n        <urn:replace>\n      }`, '')
        innerQuery = innerQuery.replace('OFFSET 333', '${offset ? `OFFSET ${offset}` : ``}')
        innerQuery = innerQuery.replace('LIMIT 999', '${limit ? `LIMIT ${limit}` : ``}')
    
        const queryLines = lines.filter((_line, index) => index < startIndex || index > endIndex)

        queryLines.splice(startIndex, 0, '${iris.length ? `VALUES ?this { ${iris.map(iri => `<${iri}>`).join(", ")} }` : `' + innerQuery + '`}')

        query = queryLines.join('\n')
    }    

    const fileContents = outdent`

    import { Model } from '${modelImportPath}'

    export function createQuery (input1: string | Array<string> | number = 0, input2: number | Array<string> = 0, input3: Array<string> = []): string {
      const iris = Array.isArray(input1) ? input1 : (typeof input1 === 'string' ? [input1] : [])
      const limit = typeof input1 === 'number' ? input1 : 0
      const offset = typeof input2 === 'number' ? input2 : 0
      const langCodes: Array<string> = input3.length ? input3 : (Array.isArray(input2) ? input2 : [])

    ${'  '}return \`\n${'    '}${query.split('\n').join('\n    ')}\n${'  '}\`
    ` + '\n}' + outdent`
    \n
    ${types.map(type => type.text).join('\n')}

    export const prefixes = ${JSON.stringify(prefixes, null, 2)}

    export const meta = ${JSON.stringify(metaTypes, null, 2)}

    export const model = new Model<${types[0].name}>('${endpoint}', createQuery, prefixes, '${vocab}', meta)
    `

    return fileContents
}