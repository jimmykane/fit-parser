import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import FitParser from '../src/fit-parser.js'
import { FIT } from '../src/fit.js'

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
        .filter(l => l && (l > 180 || l < -180)),
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

  it('expects fit with data nested into the activity', async () => {
    const fitParser = new FitParser({ force: true, mode: 'both' })
    const buffer = await fs.readFile('./test/test-diving.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    expect(fitObject).toHaveProperty('activity')
    expect(fitObject.activity.sessions?.[0]).toHaveProperty('timestamp')
    expect(fitObject.activity.sessions?.[0].laps?.[0]).toHaveProperty('timestamp')
    expect(fitObject.activity.sessions?.[0].laps?.[0].records?.[0]).toHaveProperty('timestamp')
  })

  it('has Garmin proprietary field definitions for record message', () => {
    const recordMessage = FIT.messages[20]

    expect(recordMessage[90].field).toBe('performance_condition')
    expect(recordMessage[90].type).toBe('sint8')

    expect(recordMessage[136].field).toBe('wrist_heart_rate')
    expect(recordMessage[136].type).toBe('uint8')
    expect(recordMessage[136].units).toBe('bpm')

    expect(recordMessage[137].field).toBe('stamina_potential')
    expect(recordMessage[137].scale).toBe(10)
    expect(recordMessage[137].units).toBe('percent')

    expect(recordMessage[138].field).toBe('stamina')
    expect(recordMessage[138].scale).toBe(10)
    expect(recordMessage[138].units).toBe('percent')

    expect(recordMessage[140].field).toBe('grade_adjusted_speed')
    expect(recordMessage[140].scale).toBe(1000)
    expect(recordMessage[140].units).toBe('m/s')

    expect(recordMessage[143].field).toBe('body_battery')
    expect(recordMessage[143].units).toBe('percent')

    expect(recordMessage[144].field).toBe('external_heart_rate')
    expect(recordMessage[144].units).toBe('bpm')
  })
})
