type CreateQuery<T> = (input1: string | Array<string> | number, input2: number | Array<string>, input3: Array<string>) => string

export type RdfJsonTerm = {
    type: 'bnode' | 'uri' | 'literal' | 'defaultgraph',
    value: string,
    lang?: string,
    datatype?: string
}

export type RdfJsonRoot = {
    [key: string]: RdfJsonNode
}

export type RdfJsonNode = {
    [key: string]: Array<RdfJsonTerm | RdfJsonNode>
}

export type Types = { [key: string]: { [key: string]: { multiple: boolean, optional: boolean, type: string } } }

export class Model<T> {

    private createQuery: CreateQuery<T>
    private endpoint: string
    private prefixes: Map<string, string> = new Map()
    private vocab: string
    private metaUrl: string
    private types: { [key: string]: { [key: string]: { multiple: boolean, optional: boolean, type: string } } } = {}

    constructor (endpoint: string, createQuery: CreateQuery<T>, predicatePrefixes: { [key: string]: string }, vocab: string, meta: any) {
        this.endpoint = endpoint
        this.createQuery = createQuery
        this.vocab = vocab
        this.metaUrl = meta.url

        for (const [alias, predicate] of Object.entries(predicatePrefixes)) this.prefixes.set(predicate, alias)
    }

    get (iris: Array<string>, langCodes?: Array<string>): Promise<Array<T>>;
    get (iri: string, langCodes?: Array<string>): Promise<T>;
    get (limit: number, offset?: number, langCodes?: Array<string>): Promise<Array<T>>;
    async get (input1: string | Array<string> | number = 10, input2: number | Array<string> = 0, input3: Array<string> = []): Promise<Array<T> | T> {
        const query = this.createQuery(input1, input2, input3)
        const body = new FormData()
        body.set('query', query)

        this.extractPrefixes(query)
        const ejectedFileResponse = await fetch(this.metaUrl)
        const ejectedFile = await ejectedFileResponse.text()
        this.types = this.extractTypes(ejectedFile)

        const response = await fetch(this.endpoint, {
            body,
            method: 'POST',
            headers: { 'accept': 'application/rdf+json' }
        })

        const graphs = await response.json()

        const returnObject: any = {}

        const mainSubjects = Object.entries(graphs).filter(([_iri, graph]: [string, any]) => graph['urn:shacl-meta-sparql'])
        const iris = mainSubjects.map(([iri]: [string, any]) => iri)

        for (const iri of iris) {
            returnObject[iri] = this.convertRdfGraphToJson(this.nestGraphs(graphs, iri))
            returnObject[iri].id = iri
        }
    
        const results = Object.values(returnObject)

        return typeof input1 === 'string' ? results[0] as T : results as Array<T>
    }

    extractTypes (ejectedFile: string) {
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

                types[inType][property.replace('?', '').trim()] = { 
                    multiple: type.includes('Array'), 
                    optional: property.includes('?'),
                    type: type.replaceAll(';', '').replaceAll('Array<', '').replaceAll('>', '')
                }
            }

            if (line.includes('export type')) {
                inType = line.trim().split(' ')[2].trim()
            }
        }

        return types
    }

    rdfTermValueToTypedVariable (value: RdfJsonTerm) {
        if (value.datatype === 'http://www.w3.org/2001/XMLSchema#date') return new Date(value.value)
        if (value.datatype === 'http://www.w3.org/2001/XMLSchema#integer') return parseInt(value.value)
        if (value.datatype === 'http://www.w3.org/2001/XMLSchema#string') return value.value
        if (value.datatype === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString') return value.value
        if (value.type === 'literal') return value.value
        if (value.type === 'uri') return value.value
        return value.value
    }
    
    convertRdfGraphToJson (graph: RdfJsonNode, currentTypeName = '') {
        if (!currentTypeName) currentTypeName = Object.keys(this.types)[0]
        const currentType = this.types[currentTypeName]

        const returnGraph: any = {}

        for (const [predicate, values] of Object.entries(graph)) {
            const compactedPredicate = this.compact(predicate)

            const currentProperty = currentType[compactedPredicate]

            const castedValues = values.map(value => {
                if (value.type) return this.rdfTermValueToTypedVariable(value as RdfJsonTerm)
                const nestedType = this.types[currentTypeName]?.[compactedPredicate]?.type
                return this.convertRdfGraphToJson(value as RdfJsonNode, nestedType)
            })

            if (predicate === 'urn:shacl-meta-sparql') continue

            returnGraph[compactedPredicate] = currentProperty.multiple ? castedValues : castedValues[0]
        }

        return returnGraph
    }

    nestGraphs (graphs: RdfJsonRoot, rootUri: string) {
        const finalObject = Object.entries(graphs).find(([uri]) => uri === rootUri)?.[1]
        if (!finalObject) throw new Error('Object not found')
    
        for (const [iri, graph] of Object.entries(graphs)) {
            const entries = Array.isArray(graph) ? graph.entries() : Object.entries(graph)
            for (const [key, values] of entries) {
                for (const [index, value] of values.entries()) {
                    if ((value.type === 'uri' || value.type === 'bnode') && typeof value.value === 'string' && graphs[value.value]) {
                        const newValue = graphs[value.value] as unknown as RdfJsonTerm | RdfJsonNode
                        graphs[iri][key][index] = newValue
                    }
                }
            }
        }
    
        return finalObject
    }
    
    extractPrefixes (query: string) {
        query
            .split('\n')
            .filter(line => line.includes('PREFIX'))
            .forEach(line => {
                let [, alias, iri] = line.trim().split(' ')
                alias = alias.substring(0, alias.length - 1)
                iri = iri.substring(1, iri.length - 1)
                this.prefixes.set(iri, alias)
            })
    }

    compact (iriToCompact: string) {
        const doPass = () => {
            for (const [iri, alias] of this.prefixes.entries()) {
                if (iriToCompact.includes(iri)) {
                    iriToCompact = iriToCompact.replace(iri, alias === this.vocab ? '' : `${alias}:`)
                    if (iriToCompact.at(-1) === ':') {
                        iriToCompact = iriToCompact.substring(0, iriToCompact.length - 1)
                    }
                }
            }
        }

        doPass()
        doPass()
        
        return iriToCompact
    }
}