import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const FitParser = require('./dist/fit-parser.js').default

const content = fs.readFileSync('./examples/jumps-mtb.fit')
const fitParser = new FitParser({
  force: true,
  speedUnit: 'm/s',
  lengthUnit: 'm',
  temperatureUnit: 'celsius',
  elapsedRecordField: true,
  mode: 'both',
})

fitParser.parse(content, (error, data) => {
  if (error) {
    console.error(error)
    return
  }

  console.log('=== JUMPS ARRAY ===')
  if (data.jumps && data.jumps.length > 0) {
    data.jumps.forEach((jump, i) => {
      console.log(`\nJump ${i + 1}:`)
      Object.keys(jump).forEach((key) => {
        console.log(`  ${key}: ${JSON.stringify(jump[key])}`)
      })
    })
  }
  else {
    console.log('No jumps found')
  }

  // Also check definitions array for message 140 (jump)
  console.log('\n=== DEFINITIONS FOR MESSAGE 140 (JUMP) ===')
  if (data.definitions) {
    const jumpDefs = data.definitions.filter(d => d && d.messageType === 140)
    console.log(`Found ${jumpDefs.length} jump definitions`)
    jumpDefs.forEach((def, i) => {
      console.log(`\nDefinition ${i + 1}:`)
      console.log(JSON.stringify(def, null, 2))
    })
  }
})
