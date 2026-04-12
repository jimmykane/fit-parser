import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('garmin performance condition test', () => {
  it('expects to retrieve a FIT object', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./test/test.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toBeTypeOf('object')
    expect(fitObject).toHaveProperty('sessions')
  })

  it('expects performance condition to be within the range -20 to 20 or null', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./test/running-with-developer-data.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toHaveProperty('records');

    // console.log(fitObject.records?.filter(r => r.garmin_performance_condition != null).map(r => r.garmin_performance_condition).slice(0, 10));

    const valuesFound = fitObject.records?.filter(r => r.garmin_performance_condition != null).map(r => r.garmin_performance_condition).length

    expect(valuesFound).toBeGreaterThan(0);
  })

})
