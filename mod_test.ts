import { eject } from './mod.ts'

Deno.test('Output of get', async () => {
    const personShacl = Deno.readTextFileSync('./shapes/Person.ttl')

    const fileContents = await eject(personShacl, { 'label': 'rdfs:label', 'type': 'rdf:type' }, 'dbo', 'https://dbpedia.org/sparql', '../ShaclModel.ts')
    
    Deno.writeTextFileSync('./models/Person.ts', fileContents)
    
    // const { model } = await import('./models/Person.ts')
    
    // const soren = await model.get('http://dbpedia.org/resource/Søren_Kierkegaard', ['en'])
    // console.log(soren)
})