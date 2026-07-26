import { Buffer } from 'node:buffer'
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

  it('parses an offset Buffer view without reading surrounding bytes', async () => {
    const buffer = await fs.readFile('./test/test.fit')
    const padded = Buffer.alloc(buffer.length + 32, 0xA5)
    buffer.copy(padded, 17)
    const offsetBuffer = padded.subarray(17, 17 + buffer.length)

    const direct = await new FitParser({ force: true }).parseAsync(buffer)
    const offset = await new FitParser({ force: true }).parseAsync(offsetBuffer)

    expect(offset).toEqual(direct)
  })

  it('preserves elapsed and timer time generation with cached field definitions', async () => {
    const fitParser = new FitParser({ elapsedRecordField: true, force: true })
    const buffer = await fs.readFile('./test/test.fit')
    const fitObject = await fitParser.parseAsync(buffer)
    const records = fitObject.records ?? []

    expect(records.length).toBeGreaterThan(1)
    expect(records[0]).toMatchObject({ elapsed_time: 0, timer_time: 0 })
    expect(records[records.length - 1]?.elapsed_time).toBeTypeOf('number')
    expect(records[records.length - 1]?.timer_time).toBeTypeOf('number')
  })

  it('preserves force-mode output when only the trailing file CRC is corrupt', async () => {
    const buffer = await fs.readFile('./test/test.fit')
    const corruptCrc = Buffer.from(buffer)
    const headerLength = corruptCrc[0]
    const dataLength = corruptCrc.readUInt32LE(4)
    const crcStart = headerLength + dataLength
    corruptCrc[crcStart] ^= 0xFF
    corruptCrc[crcStart + 1] ^= 0xFF

    const original = await new FitParser({ force: true }).parseAsync(buffer)
    const corrupt = await new FitParser({ force: true }).parseAsync(corruptCrc)

    expect(corrupt).toEqual(original)
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

  it('expects undocumented Garmin user metrics to be parsed', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./test/user_metrics.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    const userMetrics = fitObject.user_metrics?.[0]

    expect(userMetrics?.timestamp).toEqual(new Date('2020-06-09T11:53:24.000Z'))
    expect(userMetrics?.vo2_max).toBeCloseTo(53.18, 2)
    expect(userMetrics).toMatchObject({
      age: 32,
      height: 1.83,
      weight: 70,
      gender: 'male',
      max_heart_rate: 188,
    })
    expect(fitObject.activity_metrics?.[0]?.vo2_max).toBeUndefined()
  })

  it('expects extended Garmin user metrics to be parsed', async () => {
    const fitParser = new FitParser({ force: true })
    const buffer = await fs.readFile('./test/user_metrics_extended.fit')
    const fitObject = await fitParser.parseAsync(buffer)

    const userMetrics = fitObject.user_metrics?.[0]

    expect(userMetrics?.timestamp).toEqual(new Date('2026-05-03T09:36:24.000Z'))
    expect(userMetrics?.vo2_max).toBeCloseTo(56.22, 2)
    expect(userMetrics?.first_vo2_max).toBeCloseTo(56.2173, 4)
    expect(userMetrics).toMatchObject({
      age: 42,
      height: 1.78,
      weight: 65,
      gender: 'male',
      max_heart_rate: 187,
      remaining_recovery_time: 182,
      lthr: 161,
      ltpower: 216,
      ltspeed: 0,
      start_of_activity: new Date('2026-05-03T09:36:23.000Z'),
      end_of_previous_activity: new Date('2026-04-28T14:37:31.000Z'),
    })
  })

  it('expects Garmin stamina fields to be parsed from records, session, and splits', async () => {
    const fitParser = new FitParser({ force: true, mode: 'both' })
    const buffer = await fs.readFile('./test/garmin-stamina.fit')
    const fitObject = await fitParser.parseAsync(buffer)
    const records = fitObject.records ?? []
    const splits = fitObject.splits ?? []

    expect(records).toHaveLength(4488)
    expect(records[0]).toMatchObject({
      potential_stamina: 95,
      stamina: 95,
    })

    const lastRecord = records[records.length - 1]
    expect(lastRecord).toMatchObject({
      potential_stamina: 66,
      stamina: 66,
    })
    expect(Math.min(...records.map(record => record.stamina!))).toBe(34)

    expect(fitObject.sessions?.[0]).toMatchObject({
      beginning_potential_stamina: 95,
      ending_potential_stamina: 66,
      min_stamina: 34,
    })

    expect(splits).toHaveLength(91)
    expect(splits[0]).toMatchObject({
      beginning_potential_stamina: 95,
      ending_potential_stamina: 95,
      min_stamina: 95,
    })
    expect(splits[splits.length - 1]).toMatchObject({
      beginning_potential_stamina: 66,
      ending_potential_stamina: 66,
      min_stamina: 66,
    })
    expect(Math.min(...splits.map(split => split.min_stamina!))).toBe(34)
    expect(fitObject.activity?.splits).toHaveLength(91)

    expect(fitObject.split_summaries).toHaveLength(7)
    expect(fitObject.split_summaries?.[0]).toMatchObject({
      split_type: 'interval_active',
      num_splits: 5,
      avg_heart_rate: 160,
      max_heart_rate: 199,
    })
  })
})
