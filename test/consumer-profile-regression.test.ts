import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

describe('consumer-backed profile corrections', () => {
  it('keeps message references structured for zone consumers', async () => {
    const file = new FitEncoder().writeMessage(216, [
      { number: 0, size: 2, baseType: FitBaseType.Uint16, value: 18 },
      { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 3 },
    ]).close()

    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.time_in_zone?.[0]).toMatchObject({
      reference_mesg: 'session',
      reference_index: {
        value: 3,
        reserved: false,
        selected: false,
      },
    })
  })

  it('decodes the observed dive-gas mode field', async () => {
    const file = new FitEncoder().writeMessage(259, [
      { number: 0, size: 1, baseType: FitBaseType.Uint8, value: 0 },
      { number: 1, size: 1, baseType: FitBaseType.Uint8, value: 21 },
      { number: 2, size: 1, baseType: FitBaseType.Enum, value: 1 },
      { number: 3, size: 1, baseType: FitBaseType.Enum, value: 0 },
    ]).close()

    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.dive_gases?.[0]).toMatchObject({
      helium_content: 0,
      oxygen_content: 21,
      status: 'enabled',
      mode: 'open_circuit',
    })
  })

  it('decodes observed dive timing, rate, and gas-consumption summaries', async () => {
    const file = new FitEncoder().writeMessage(268, [
      { number: 12, size: 2, baseType: FitBaseType.Uint16, value: 167 },
      { number: 13, size: 2, baseType: FitBaseType.Uint16, value: 2222 },
      { number: 14, size: 2, baseType: FitBaseType.Uint16, value: 2150 },
      { number: 15, size: 4, baseType: FitBaseType.Uint32, value: 691_000 },
      { number: 16, size: 4, baseType: FitBaseType.Uint32, value: 1_937_527 },
      { number: 22, size: 4, baseType: FitBaseType.Uint32, value: 55 },
      { number: 24, size: 4, baseType: FitBaseType.Uint32, value: 77 },
      { number: 25, size: 4, baseType: FitBaseType.Uint32, value: 8_000 },
    ]).close()

    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.dive_summary).toMatchObject({
      avg_pressure_sac: 1.67,
      avg_volume_sac: 22.22,
      avg_rmv: 21.5,
      descent_time: 691,
      ascent_time: 1937.527,
      avg_descent_rate: 0.055,
      max_descent_rate: 0.077,
      hang_time: 8,
    })
  })

  it('decodes observed per-record dive metrics and tank timestamps', async () => {
    const timestamp = FitEncoder.toFitTimestamp(new Date('2026-08-22T10:00:00.000Z'))
    const file = new FitEncoder()
      .writeMessage(20, [
        { number: 123, size: 4, baseType: FitBaseType.Uint32, value: 900 },
        { number: 124, size: 2, baseType: FitBaseType.Uint16, value: 1234 },
        { number: 125, size: 2, baseType: FitBaseType.Uint16, value: 2345 },
        { number: 126, size: 2, baseType: FitBaseType.Uint16, value: 3456 },
        { number: 129, size: 1, baseType: FitBaseType.Uint8, value: 21 },
      ], 0)
      .writeMessage(323, [
        { number: 0, size: 4, baseType: FitBaseType.Uint32z, value: 10_001 },
        { number: 253, size: 4, baseType: FitBaseType.Uint32, value: timestamp },
      ], 1)
      .close()

    const parsed = await new FitParser({ force: false }).parseAsync(file.buffer)

    expect(parsed.records?.[0]).toMatchObject({
      air_time_remaining: 900,
      pressure_sac: 12.34,
      volume_sac: 23.45,
      rmv: 34.56,
      po2: 0.21,
    })
    expect(parsed.tank_summaries?.[0]).toMatchObject({
      sensor: 10_001,
      timestamp: new Date('2026-08-22T10:00:00.000Z'),
    })
  })
})
