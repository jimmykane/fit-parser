import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'

describe('fit parser tests', () => {
  it('expects to retrieve a FIT object', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./test/test.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toBeTypeOf('object')
    expect(fitObject).toHaveProperty('sessions')
  })

  it('expects longitude to be in the range -180 to +180', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./test/test2.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toHaveProperty('records')
    expect(
      fitObject.records && fitObject.records
        .map(r => r.position_long)
        .filter(l => l > 180 || l < -180),
    ).toEqual([])
  })

  it('expects fit with developer data to be parsed', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./test/running-with-developer-data.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toHaveProperty('records')
    expect(fitObject.records?.[0]).toHaveProperty('Ground Time')
    expect(fitObject.records?.[0]).toHaveProperty('Vertical Oscillation')
    expect(fitObject.records?.[0]).toHaveProperty('Elevation')
  })

  it('expects fit with tank_update and tank_summary data to be parsed', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./test/test-diving.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toHaveProperty('tank_updates')
    expect(fitObject.tank_updates?.[0]).toHaveProperty('timestamp')
    expect(fitObject.tank_updates?.[0]).toHaveProperty('sensor')
    expect(fitObject.tank_updates?.[0]).toHaveProperty('pressure')

    expect(fitObject).toHaveProperty('tank_summaries')
    expect(fitObject.tank_summaries?.[0]).toHaveProperty('sensor')
    expect(fitObject.tank_summaries?.[0]).toHaveProperty('start_pressure')
    expect(fitObject.tank_summaries?.[0]).toHaveProperty('end_pressure')
  })
})
