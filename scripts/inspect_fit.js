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
if (args.length < 1) {
  console.log('Usage: node inspect_fit.js <path_to_fit_file> [message_key]')
  console.log('Example: node inspect_fit.js ../examples/jumps-mtb.fit jumps')
  process.exit(1)
}

const filePath = args[0]
const messageKey = args[1]

try {
  const content = fs.readFileSync(filePath)
  const fitParser = new FitParser({
    force: true,
    mode: 'both',
    speedUnit: 'm/s',
    lengthUnit: 'm',
  })

  fitParser.parse(content, (error, data) => {
    if (error) {
      console.error('Error parsing FIT file:', error)
      return
    }

    if (messageKey) {
      if (data[messageKey]) {
        console.log(`\n=== ${messageKey.toUpperCase()} (${Array.isArray(data[messageKey]) ? data[messageKey].length : 'object'}) ===`)
        console.log(JSON.stringify(data[messageKey], null, 2))
      }
      else if (data.activity && data.activity[messageKey]) {
        console.log(`\n=== ACTIVITY.${messageKey.toUpperCase()} ===`)
        console.log(JSON.stringify(data.activity[messageKey], null, 2))
      }
      else {
        console.log(`\nMessage key '${messageKey}' not found in root or activity object.`)
        console.log('Available keys:', Object.keys(data).join(', '))
      }
    }
    else {
      console.log('\n=== ROOT KEYS ===')
      console.log(Object.keys(data).join('\n'))

      // Print summary of counts
      console.log('\n=== SUMMARY ===')
      Object.keys(data).forEach((key) => {
        if (Array.isArray(data[key])) {
          console.log(`${key}: ${data[key].length} items`)
        }
      })
    }
  })
}
catch (e) {
  console.error('Error reading file:', e.message)
}
