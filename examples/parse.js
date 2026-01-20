import fs from 'node:fs'
import process from 'node:process'
// eslint-disable-next-line antfu/no-import-dist
import FitParser from './../dist/fit-parser.js'

const file = process.argv[2]

const fitParser = new FitParser({
  force: true,
  speedUnit: 'km/h',
  lengthUnit: 'm',
  temperatureUnit: 'celsius',
  pressureUnit: 'bar',
  elapsedRecordField: true,
  mode: 'both',
})

fs.readFile(file, (err, content) => {
  if (err) {
    console.error(err)
    return
  }

  fitParser.parse(content, (error, data) => {
    if (error) {
      console.error(error)
    }
    else {
      console.log(JSON.stringify(data, null, 2))
    }
  })
})
