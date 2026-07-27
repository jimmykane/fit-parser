import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

function uint16Array(values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2)
  const view = new DataView(bytes.buffer)
  values.forEach((value, index) => view.setUint16(index * 2, value, true))
  return bytes
}

describe('fit profile corrections', () => {
  it('decodes monitoring values from their declared integer base types', async () => {
    const encoder = new FitEncoder()
    const timestamp = FitEncoder.toFitTimestamp(
      new Date('2026-01-02T03:04:05.000Z'),
    )

    encoder.writeMessage(55, [
      { number: 253, size: 4, baseType: FitBaseType.Uint32, value: timestamp },
      { number: 2, size: 4, baseType: FitBaseType.Uint32, value: 12_345 },
      { number: 3, size: 4, baseType: FitBaseType.Uint32, value: 12 },
      { number: 4, size: 4, baseType: FitBaseType.Uint32, value: 90_000 },
      { number: 12, size: 2, baseType: FitBaseType.Sint16, value: 1234 },
      { number: 14, size: 2, baseType: FitBaseType.Sint16, value: -250 },
      { number: 15, size: 2, baseType: FitBaseType.Sint16, value: 4567 },
      {
        number: 16,
        size: 4,
        baseType: FitBaseType.Uint16,
        value: uint16Array([1, 2]),
      },
    ])

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.monitors).toEqual([
      {
        active_time: 90,
        activity_time: [1, 2],
        cycles: 6,
        distance: 123.45,
        temperature: 12.34,
        temperature_max: 45.67,
        temperature_min: -2.5,
        timestamp: new Date('2026-01-02T03:04:05.000Z'),
      },
    ])
  })

  it('keeps cadence and power zone arrays distinct', async () => {
    const encoder = new FitEncoder()
    encoder.writeMessage(216, [
      {
        number: 4,
        size: 8,
        baseType: FitBaseType.Uint32,
        value: new Uint8Array([
          0xE8,
          0x03,
          0,
          0,
          0xD0,
          0x07,
          0,
          0,
        ]),
      },
      {
        number: 8,
        size: 3,
        baseType: FitBaseType.Uint8,
        value: new Uint8Array([90, 100, 110]),
      },
      {
        number: 9,
        size: 6,
        baseType: FitBaseType.Uint16,
        value: uint16Array([150, 250, 350]),
      },
    ])

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.time_in_zone?.[0]).toMatchObject({
      cadence_zone_high_boundary: [90, 100, 110],
      power_zone_high_boundary: [150, 250, 350],
      time_in_cadence_zone: [1, 2],
    })
  })

  it('does not label a manufacturer-reused session field as average flow', async () => {
    const encoder = new FitEncoder()
    encoder.writeMessage(18, [
      { number: 215, size: 1, baseType: FitBaseType.Uint8, value: 42 },
    ])

    const parsed = await new FitParser({ force: false }).parseAsync(
      encoder.close().buffer,
    )

    expect(parsed.sessions).toEqual([{}])
    expect(parsed.sessions?.[0]).not.toHaveProperty('avg_flow')
  })
})
