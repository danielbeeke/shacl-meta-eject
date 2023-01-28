# SHACL Meta Eject

Given a SHACL file returns a TypeScript file including TypeScript type(s) and a Query. This file references a ESM module which makes it easy to fetch objects from a SPARQL endpoint.

## How to get running

- Include the ShaclModel.ts file in your code base.
- Set up a npm run task for example the 'postinstall'. This script should be similar to the following:

```
import { eject } from 'https://deno.land/x/shacl_meta_eject/mod.ts'
const personShacl = Deno.readTextFileSync('./shapes/Person.ttl')
const fileContents = await eject(personShacl, { 'label': 'rdfs:label', 'type': 'rdf:type' }, 'dbo', 'https://dbpedia.org/sparql', '../ShaclModel.ts')
Deno.writeTextFileSync('./models/Person.ts', fileContents)
```

- Now you can include the model/Person.ts file in your codebase.