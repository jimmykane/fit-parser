import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
// Try to load from local build or node_modules
let FitParser
try {
  FitParser = require('../dist/fit-parser.js').default
}
catch (e) {
  FitParser = require('fit-file-parser').default
}

const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('Usage: node deep_probe.js <path_to_fit_file> <search_value> [tolerance]')
  console.log('Example: node deep_probe.js ../examples/jumps-mtb.fit 11 0.1')
  process.exit(1)
}

const filePath = args[0]
const targetValue = Number.parseFloat(args[1])
const tolerance = args[2] ? Number.parseFloat(args[2]) : 0.001

if (isNaN(targetValue)) {
  console.error('Error: Search value must be a number')
  process.exit(1)
}

try {
  const content = fs.readFileSync(filePath)
  const fitParser = new FitParser({
    force: true,
    speedUnit: 'm/s',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    elapsedRecordField: true,
    mode: 'both',
  })

  function search(obj, path = []) {
    if (!obj || typeof obj !== 'object')
      return

    Object.keys(obj).forEach((key) => {
      const val = obj[key]
      const newPath = [...path, key]

      if (typeof val === 'number') {
        if (Math.abs(val - targetValue) <= tolerance) {
          console.log(`>>> FOUND MATCH at: ${newPath.join('.')} (Value: ${val})`)
        }
      }

      if (typeof val === 'object') {
        search(val, newPath)
      }
    })
  }

  fitParser.parse(content, (error, data) => {
    if (error) {
      console.error(error)
    }
    else {
      console.log(`Searching for value ${targetValue} (±${tolerance}) in ${filePath}...`)
      search(data)
      console.log('Search complete.')
    }
  })
}
catch (e) {
  console.error('Error:', e.message)
}
