import { describe, expect, it } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

const definitions = [
  [18, 79, 'avg_strokes_per_length', FitBaseType.Uint16, 2, 125, 12.5],
  [18, 80, 'avg_swolf', FitBaseType.Uint16, 2, 35, 35],
  [18, 106, 'num_segment_laps', FitBaseType.Uint16, 2, 0, 0],
  [18, 107, 'front_gear_shift_count', FitBaseType.Uint16, 2, 3, 3],
  [18, 108, 'rear_gear_shift_count', FitBaseType.Uint16, 2, 4, 4],
  [18, 211, 'avg_grade_adjusted_speed', FitBaseType.Uint32, 4, 3000, 3],
  [19, 27, 'nec_lat', FitBaseType.Sint32, 4, 536870912, 45],
  [19, 28, 'nec_long', FitBaseType.Sint32, 4, -536870912, -45],
  [19, 29, 'swc_lat', FitBaseType.Sint32, 4, 268435456, 22.5],
  [19, 30, 'swc_long', FitBaseType.Sint32, 4, -268435456, -22.5],
  [19, 73, 'avg_swolf', FitBaseType.Uint16, 2, 0, 0],
  [19, 90, 'avg_strokes_per_length', FitBaseType.Uint16, 2, 125, 12.5],
  [19, 96, 'front_gear_shift_count', FitBaseType.Uint16, 2, 3, 3],
  [19, 97, 'rear_gear_shift_count', FitBaseType.Uint16, 2, 4, 4],
  [19, 155, 'metabolic_calories', FitBaseType.Uint16, 2, 25, 25],
  [19, 161, 'avg_grade_adjusted_speed', FitBaseType.Uint32, 4, 3000, 3],
] as const

function wrap(packets: number[]): Uint8Array {
  const header = new Uint8Array(14)
  header[0] = 14
  header[1] = 32
  header.set([46, 70, 73, 84], 8)
  new DataView(header.buffer).setUint32(4, packets.length, true)
  new DataView(header.buffer).setUint16(12, FitEncoder.calculateCRC(header.slice(0, 12)), true)
  const file = new Uint8Array(14 + packets.length + 2)
  file.set(header)
  file.set(packets, 14)
  new DataView(file.buffer).setUint16(file.length - 2, FitEncoder.calculateCRC(file.slice(0, -2)), true)
  return file
}

function describedDeveloper(name: string | undefined, repeated = true): Uint8Array {
  const names = name === undefined ? [] : [3, name.length + 1, 7]
  const desc = [0x41, 0, 0, 206, 0, name === undefined ? 3 : 4, 0, 1, 2, 1, 1, 2, 2, 1, 2, ...names, 1, 0, 1, 132, ...(name === undefined ? [] : [...new TextEncoder().encode(name), 0])]
  return wrap([...desc, 0x60, 0, 0, 20, 0, 1, 3, 1, 2, 1, 1, 2, 0, 0, 147, 52, 18, ...(repeated ? [0, 148, 53, 18] : [])])
}

describe('fIT profile and byte-preservation regressions', () => {
  it.each(definitions)('decodes standard field %s:%s with its documented scale', async (mn, fn, name, baseType, size, value, expected) => {
    const file = new FitEncoder().writeMessage(mn, [{ number: fn, size, baseType, value }]).close()
    const parsed = await new FitParser({ force: false, includeUnmappedMessages: true }).parseAsync(file)
    const message = mn === 18 ? parsed.sessions?.[0] : parsed.laps?.[0]
    expect((message as any)?.[name]).toBe(expected)
    expect(parsed.unmapped_messages).toBeUndefined()
  })

  it.each([18, 19])('converts grade adjusted speed for message %s using the chosen speed unit', async (mn) => {
    const file = new FitEncoder().writeMessage(mn, [{ number: mn === 18 ? 211 : 161, size: 4, baseType: FitBaseType.Uint32, value: 3000 }]).close()
    const p = await new FitParser({ force: false, speedUnit: 'km/h' }).parseAsync(file)
    expect((mn === 18 ? p.sessions?.[0] : p.laps?.[0])?.avg_grade_adjusted_speed).toBeCloseTo(10.8)
  })

  it('omits standard invalid sentinels without shifting an adjacent field', async () => {
    const file = new FitEncoder().writeMessage(18, [
      { number: 79, size: 2, baseType: FitBaseType.Uint16, value: 65535 },
      { number: 211, size: 4, baseType: FitBaseType.Uint32, value: 4294967295 },
      { number: 80, size: 2, baseType: FitBaseType.Uint16, value: 33 },
    ]).close()
    const p = await new FitParser({ force: false }).parseAsync(file)
    expect(p.sessions?.[0].avg_strokes_per_length).toBeUndefined()
    expect(p.sessions?.[0].avg_grade_adjusted_speed).toBeUndefined()
    expect(p.sessions?.[0].avg_swolf).toBe(33)
  })

  it('retains every battery sample, timestamp and undocumented byte', async () => {
    const e = new FitEncoder()
    for (const capacity of [90, 89]) {
      e.writeMessage(104, [
        { number: 253, size: 4, baseType: FitBaseType.Uint32, value: 1000 },
        { number: 2, size: 1, baseType: FitBaseType.Uint8, value: capacity },
        { number: 0, size: 2, baseType: FitBaseType.Uint16, value: 42 },
      ])
    }
    const p = await new FitParser({ force: false, includeUnmappedMessages: true }).parseAsync(e.close())
    expect(p.batteries?.map(m => m.capacity)).toEqual([90, 89])
    expect(p.messages?.battery).toEqual(p.batteries)
    expect(p.batteries?.[0].timestamp).toEqual(new Date(631066600000))
    expect(p.unmapped_messages?.map(m => m.fields[0].raw_value)).toEqual([[42, 0], [42, 0]])
  })

  it.each([undefined, '', 'unknown'])('preserves described developer bytes with unusable name %s after cache reuse', async (name) => {
    const p = await new FitParser({ force: false, includeUnmappedMessages: true }).parseAsync(describedDeveloper(name))
    expect(p.records?.map(m => m.heart_rate)).toEqual([147, 148])
    expect(p.unmapped_messages?.map(m => m.developer_fields[0].raw_value)).toEqual([[52, 18], [53, 18]])
    expect(Object.keys(p.records?.[0] ?? {})).not.toContain('')
  })

  it('keeps named developer behavior unchanged', async () => {
    const p = await new FitParser({ force: false, includeUnmappedMessages: true }).parseAsync(describedDeveloper('named_value'))
    expect((p.records?.[0] as any).named_value).toBe(4660)
    expect(p.unmapped_messages).toBeUndefined()
  })

  it.each([0, 20, 126, 127, 128, 254, 255])('recovers only unambiguous unsigned temperature byte %s and preserves raw data', async (value) => {
    const file = new FitEncoder().writeMessage(20, [
      { number: 13, size: 1, baseType: FitBaseType.Uint8, value },
      { number: 3, size: 1, baseType: FitBaseType.Uint8, value: 147 },
    ]).close()
    const p = await new FitParser({ force: false, includeUnmappedMessages: true }).parseAsync(file)
    expect(p.records?.[0].temperature).toBe(value < 127 ? value : undefined)
    expect(p.records?.[0].heart_rate).toBe(147)
    expect(p.unmapped_messages?.[0].fields[0].raw_value).toEqual([value])
  })

  it('does not expand compatibility to other signed fields or mismatched widths', async () => {
    const file = new FitEncoder().writeMessage(20, [{ number: 6, size: 1, baseType: FitBaseType.Enum, value: 20 }]).writeMessage(19, [{ number: 3, size: 4, baseType: FitBaseType.Uint32, value: 20 }]).close()
    const p = await new FitParser({ force: false, includeUnmappedMessages: true }).parseAsync(file)
    expect(p.records?.[0].speed).toBeUndefined()
    expect(p.laps?.[0].start_position_lat).toBeUndefined()
    expect(p.unmapped_messages).toHaveLength(2)
  })
})
