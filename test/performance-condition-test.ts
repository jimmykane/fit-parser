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

    const values = (fitObject.records ?? [])
      .map(record => record.garmin_performance_condition)
      .filter((value): value is number => value != null)

    expect(values).not.toHaveLength(0)
    expect(values.every(value => value >= -20 && value <= 20)).toBe(true)
  })
})
