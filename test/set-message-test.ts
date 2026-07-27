import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

function uint16Array(values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2)
  const view = new DataView(bytes.buffer)
  values.forEach((value, index) => view.setUint16(index * 2, value, true))
  return bytes
}

function createStrengthSet(): Uint8Array {
  const encoder = new FitEncoder()
  const startTime = FitEncoder.toFitTimestamp(
    new Date('2026-01-02T03:04:05.000Z'),
  )

  encoder.writeMessage(225, [
    {
      number: 254,
      size: 4,
      baseType: FitBaseType.Uint32,
      value: startTime + 30,
    },
    { number: 0, size: 4, baseType: FitBaseType.Uint32, value: 30_500 },
    { number: 3, size: 2, baseType: FitBaseType.Uint16, value: 12 },
    { number: 4, size: 2, baseType: FitBaseType.Uint16, value: 328 },
    { number: 5, size: 1, baseType: FitBaseType.Uint8, value: 1 },
    { number: 6, size: 4, baseType: FitBaseType.Uint32, value: startTime },
    {
      number: 7,
      size: 4,
      baseType: FitBaseType.Uint16,
      value: uint16Array([0, 28]),
    },
    {
      number: 8,
      size: 4,
      baseType: FitBaseType.Uint16,
      value: uint16Array([1, 2]),
    },
    { number: 9, size: 2, baseType: FitBaseType.Uint16, value: 1 },
    { number: 10, size: 2, baseType: FitBaseType.Uint16, value: 7 },
    { number: 11, size: 2, baseType: FitBaseType.Uint16, value: 3 },
  ])

  return encoder.close()
}

describe('strength-training set messages', () => {
  it('decodes every standard set field', async () => {
    const parsed = await new FitParser({ force: false }).parseAsync(
      createStrengthSet().buffer,
    )

    expect(parsed.sets).toHaveLength(1)
    expect(parsed.sets?.[0]).toMatchObject({
      timestamp: new Date('2026-01-02T03:04:35.000Z'),
      duration: 30.5,
      repetitions: 12,
      weight: 20.5,
      set_type: 'active',
      start_time: new Date('2026-01-02T03:04:05.000Z'),
      category: ['bench_press', 'squat'],
      category_subtype: [1, 2],
      weight_display_unit: 'kilogram',
      message_index: {
        value: 7,
        reserved: false,
        selected: false,
      },
      wkt_step_index: {
        value: 3,
        reserved: false,
        selected: false,
      },
    })
  })

  it('places sets according to the requested output mode', async () => {
    const file = createStrengthSet()
    const [list, cascade, both] = await Promise.all([
      new FitParser({ force: false, mode: 'list' }).parseAsync(file.buffer),
      new FitParser({ force: false, mode: 'cascade' }).parseAsync(file.buffer),
      new FitParser({ force: false, mode: 'both' }).parseAsync(file.buffer),
    ])

    expect(list.sets).toHaveLength(1)
    expect(list.activity).toBeUndefined()

    expect(cascade.sets).toBeUndefined()
    expect(cascade.activity.sets).toHaveLength(1)

    expect(both.sets).toHaveLength(1)
    expect(both.activity.sets).toEqual(both.sets)
  })
})
