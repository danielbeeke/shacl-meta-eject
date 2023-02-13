
import { Model } from '../ShaclModel.ts'

export function createQuery (input1: string | Array<string> | number = 0, input2: number | Array<string> = 0, input3: Array<string> = []): string {
  const iris = Array.isArray(input1) ? input1 : (typeof input1 === 'string' ? [input1] : [])
  const limit = typeof input1 === 'number' ? input1 : 0
  const offset = typeof input2 === 'number' ? input2 : 0
  const langCodes: Array<string> = input3.length ? input3 : (Array.isArray(input2) ? input2 : [])

  return `
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX dbo: <http://dbpedia.org/ontology/>
    CONSTRUCT {
      ?s ?p ?o.
      ?this <urn:shacl-meta-sparql> <urn:shacl-meta-sparql>.
    }
    WHERE {
    ${iris.length ? `VALUES ?this { ${iris.map(iri => `<${iri}>`).join(", ")} }` : `  {
        SELECT ?this WHERE {
          ?this rdf:type dbo:Philosopher.
          
        }
        ${offset ? `OFFSET ${offset}` : ``}
        ${limit ? `LIMIT ${limit}` : ``}
      }`}
      ?s ?p ?o.
      {
        ?this ?p ?o.
        BIND(?this AS ?s)
        VALUES ?p {
          rdfs:label
          dbo:thumbnail
          dbo:birthPlace
          dbo:birthDate
        }
        FILTER((?p != dbo:birthPlace) || (ISIRI(?o)))
        FILTER((?p != rdfs:label) || (LANG(?o) IN(${langCodes.map(langCode => `"${langCode}"`).join(", ")})))
        FILTER((?p != rdfs:label) || ((ISLITERAL(?o)) && ((LANG(?o)) != "")))
        FILTER((?p != dbo:birthDate) || ((DATATYPE(?o)) = xsd:date))
      }
      UNION
      {
        {
          {
            ?this dbo:birthPlace ?s.
            VALUES ?p {
              rdfs:label
            }
            FILTER((?p != rdfs:label) || (LANG(?o) IN(${langCodes.map(langCode => `"${langCode}"`).join(", ")})))
            FILTER((?p != rdfs:label) || ((ISLITERAL(?o)) && ((LANG(?o)) != "")))
          }
        }
      }
    }
  `
}

export type selfPhilosopher = {
  'rdfs:label': string;
  thumbnail: string;
  birthPlace?: Array<selfLocation>;
  birthDate?: Date;
}

export type selfLocation = {
  'rdfs:label': string;
}


export const prefixes = {
  "label": "rdfs:label",
  "type": "rdf:type"
}

export const meta = {
  "selfPhilosopher": {
    "rdfs:label": {
      "multiple": false,
      "optional": false,
      "type": "string"
    },
    "thumbnail": {
      "multiple": false,
      "optional": false,
      "type": "string"
    },
    "birthPlace": {
      "multiple": true,
      "optional": true,
      "type": "selfLocation"
    },
    "birthDate": {
      "multiple": false,
      "optional": true,
      "type": "Date"
    }
  },
  "selfLocation": {
    "rdfs:label": {
      "multiple": false,
      "optional": false,
      "type": "string"
    }
  }
}

export const model = new Model<selfPhilosopher>('https://dbpedia.org/sparql', createQuery, prefixes, 'dbo', meta)