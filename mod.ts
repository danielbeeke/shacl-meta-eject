import { ShaclModel, Converter } from './deps.ts'
import outdent from 'https://deno.land/x/outdent/mod.ts';

export const eject = async (shacl: string, prefixes: { [key: string]: string }, vocab: string, endpoint: string, modelImportPath = './Model.ts') => {
    const model = await new ShaclModel({ endpoint: '', shacl, vocab, prefixes })

    const sourceQuery: string = model.query(999, 333, ['urn:replace']) as string

    const regex = new RegExp(/\|\| \(LANG\(\?o\) IN\(([a-zA-Z0-9-", ]+)\)/, 'g')
    const matches = sourceQuery.matchAll(regex)

    const converter = new Converter()
    const types = await converter.transform(shacl, vocab, prefixes)

    let query = sourceQuery
    for (const match of matches ?? []) {
        query = query.replaceAll(match[0], '|| (LANG(?o) IN(${langCodes.map(langCode => `"${langCode}"`).join(", ")})')
    }

    query = query.replace(`VALUES ?this {\n        <urn:replace>\n      }`, '${iris.map(iri => `${iris.length ? `VALUES ?this { <${iri}>`).join(",")}` : ""}')
    query = query.replace('OFFSET 333', 'OFFSET ${offset}')
    query = query.replace('LIMIT 999', 'LIMIT ${limit}')

    const fileContents = outdent`

    import { Model } from '${modelImportPath}'

    export function createQuery (input1: string | Array<string> | number = 10, input2: number | Array<string> = 0, input3: Array<string> = []): string {
      const iris = Array.isArray(input1) ? input1 : (typeof input1 === 'string' ? [input1] : [])
      const limit = typeof input1 === 'number' ? input1 : 10
      const offset = typeof input2 === 'number' ? input2 : 0
      const langCodes: Array<string> = input3.length ? input3 : (Array.isArray(input2) ? input2 : [])

    ${'  '}return \`\n${'    '}${query.split('\n').join('\n    ')}\n${'  '}\`
    ` + '\n}' + outdent`
    \n
    ${types.map(type => type.text).join('\n')}

    export const prefixes = ${JSON.stringify(prefixes, null, 2)}

    export const model = new Model<${types[0].name}>('${endpoint}', createQuery, prefixes, '${vocab}', import.meta)
    `

    return fileContents
}